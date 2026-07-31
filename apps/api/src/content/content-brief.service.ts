/**
 * Vertical síncrona del brief.
 *
 * La API no genera: reserva la ejecución, encola su evento y responde. La
 * organización, la membresía y la sucursal salen de la sesión, nunca del body,
 * así que un pedido no puede alcanzar datos de otra organización aunque lo
 * intente.
 */

import { createHash, randomUUID } from "node:crypto";

import type {
  ContentBriefRunAcceptedResponse,
  ContentBriefRunCancellationResponse,
  ContentBriefRunListResponse,
  ContentBriefRunResponse,
  PublicationDraftResponse,
} from "@aramayo/contracts";
import {
  authorizeActor,
  contentBriefLimits,
  type AuthenticatedActor,
  type ContentBriefRequestRepository,
  type ContentBriefRunRecord,
  type ContentBriefRunRepository,
  type OrganizationConfigurationRepository,
} from "@aramayo/domain";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { ReliableOperationService } from "../audit/reliable-operation.service.ts";
import {
  CONTENT_BRIEF_REQUEST_REPOSITORY,
  CONTENT_BRIEF_RUN_REPOSITORY,
  ORGANIZATION_CONFIGURATION_REPOSITORY,
} from "../database/database.tokens.ts";
import {
  PublicationDraftService,
  type DraftDesignSubmission,
} from "./publication-draft.service.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const contentBriefHistoryLimits = Object.freeze({
  defaultLimit: 20,
  maximumLimit: 50,
});

/**
 * El pedido no nombra prompt ni esquema: los elige el worker al ejecutar y los
 * anota al cerrar. La API no puede conocerlos sin acoplarse a la versión que
 * hoy corre del otro lado del outbox. El nombre de la sucursal tampoco viaja:
 * lo resuelve el servidor desde la configuración de la organización.
 */
export interface RequestContentBriefCommand {
  readonly locationId: string | null;
  readonly request: string;
}

/**
 * Proyección pública. El hash del pedido, el request ID del proveedor y el
 * identificador de respuesta quedan en el historial pero no salen por la API:
 * no le sirven a quien revisa y sí amplían la superficie expuesta.
 */
function toResponse(record: ContentBriefRunRecord): ContentBriefRunResponse {
  return {
    brief: record.brief,
    cancelledAt: record.cancelledAt,
    completedAt: record.completedAt,
    evidence: record.evidence.map((entry) => ({
      citationId: entry.citationId,
      kind: entry.kind,
      observedAt: entry.observedAt,
      reference: entry.reference,
    })),
    id: record.id,
    knowledgeStatus: record.knowledgeStatus,
    locationId: record.locationId,
    // `unselected` es el centinela de una ejecución que todavía no eligió
    // modelo; hacia afuera eso es ausencia, no un modelo llamado así.
    model: record.model === "unselected" ? null : record.model,
    promptVersion: record.promptVersion,
    rejection: record.rejection,
    request: record.request,
    requestedAt: record.requestedAt,
    schemaVersion: record.schemaVersion,
    status: record.status,
    toolInvocations: record.toolInvocations.map((invocation) => ({
      outcome: invocation.outcome,
      toolName: invocation.toolName,
    })),
    usage: {
      estimatedCostUsd: record.estimatedCostUsd,
      latencyMilliseconds: record.latencyMilliseconds,
      totalTokens: record.usage.totalTokens,
    },
  };
}

@Injectable()
export class ContentBriefService {
  readonly #configuration: OrganizationConfigurationRepository;
  readonly #drafts: PublicationDraftService;
  readonly #reliableOperations: ReliableOperationService;
  readonly #requests: ContentBriefRequestRepository;
  readonly #runs: ContentBriefRunRepository;

  constructor(
    @Inject(CONTENT_BRIEF_REQUEST_REPOSITORY)
    requests: ContentBriefRequestRepository,
    @Inject(CONTENT_BRIEF_RUN_REPOSITORY)
    runs: ContentBriefRunRepository,
    @Inject(ORGANIZATION_CONFIGURATION_REPOSITORY)
    configuration: OrganizationConfigurationRepository,
    reliableOperations: ReliableOperationService,
    drafts: PublicationDraftService,
  ) {
    this.#configuration = configuration;
    this.#drafts = drafts;
    this.#reliableOperations = reliableOperations;
    this.#requests = requests;
    this.#runs = runs;
  }

  async request(
    actor: AuthenticatedActor,
    command: RequestContentBriefCommand,
    idempotencyKey?: string,
  ): Promise<ContentBriefRunAcceptedResponse> {
    this.#require(actor, "content:edit");
    const request = command.request.replaceAll(/\s+/gu, " ").trim();
    if (
      request.length < contentBriefLimits.requestMinimum ||
      request.length > contentBriefLimits.requestMaximum
    ) {
      throw new BadRequestException(
        "El pedido debe tener entre 8 y 600 caracteres.",
      );
    }
    if (command.locationId !== null && !UUID.test(command.locationId)) {
      throw new BadRequestException("La sucursal del pedido no es válida.");
    }
    const locationName = await this.#resolveLocationName(
      actor,
      command.locationId,
    );

    const runId = randomUUID();
    const requestedAt = new Date();
    const reliableOperation = this.#prepare(
      actor,
      "content.brief:request",
      idempotencyKey,
      { locationId: command.locationId, request },
      requestedAt,
    );

    const result = await this.#requests.request({
      actorMembershipId: actor.membershipId,
      id: runId,
      locationId: command.locationId,
      locationName,
      organizationId: actor.organizationId,
      reliableOperation,
      request,
      requestHash: createHash("sha256").update(request).digest("hex"),
      requestedAt: requestedAt.toISOString(),
    });

    switch (result.status) {
      case "accepted":
        return Object.freeze({ runId: result.runId, status: "pending" });
      case "idempotency-conflict":
        throw new ConflictException(
          "La clave idempotente ya fue usada con otro pedido.",
        );
      case "in-progress":
        throw new ConflictException({
          message: "El mismo pedido todavía está en curso.",
          retryAfter: result.retryAfter,
        });
    }
  }

  async findById(
    actor: AuthenticatedActor,
    runId: string,
  ): Promise<ContentBriefRunResponse> {
    this.#require(actor, "content:read");
    const record = await this.#runs.findById({
      id: runId,
      organizationId: actor.organizationId,
    });
    if (record === null) {
      throw new NotFoundException("La ejecución no existe.");
    }
    return toResponse(record);
  }

  async list(
    actor: AuthenticatedActor,
    filter: Readonly<{ limit?: number; mine?: boolean; page?: number }>,
  ): Promise<ContentBriefRunListResponse> {
    this.#require(actor, "content:read");
    const limit = Math.min(
      Math.max(filter.limit ?? contentBriefHistoryLimits.defaultLimit, 1),
      contentBriefHistoryLimits.maximumLimit,
    );
    const page = Math.max(filter.page ?? 1, 1);
    const history = await this.#runs.list({
      ...(filter.mine === true
        ? { actorMembershipId: actor.membershipId }
        : {}),
      limit,
      organizationId: actor.organizationId,
      page,
    });
    return {
      items: history.items.map(toResponse),
      limit: history.limit,
      page: history.page,
      total: history.total,
    };
  }

  /**
   * Cancelar es idempotente hacia el editor: si la ejecución ya se resolvió,
   * la respuesta informa el estado real en lugar de fallar. Lo que nunca
   * ocurre es que una cancelación revierta un resultado ya confirmado.
   */
  async cancel(
    actor: AuthenticatedActor,
    runId: string,
  ): Promise<ContentBriefRunCancellationResponse> {
    this.#require(actor, "content:edit");
    const outcome = await this.#runs.cancel({
      cancelledAt: new Date().toISOString(),
      id: runId,
      organizationId: actor.organizationId,
    });
    switch (outcome.status) {
      case "cancelled":
        return Object.freeze({ runId, status: "cancelled" });
      case "already-resolved":
        return Object.freeze({ runId, status: outcome.resolvedStatus });
      case "not-found":
        throw new NotFoundException("La ejecución no existe.");
    }
  }

  /**
   * Aceptar crea una revisión de publicación y nada más: no publica ni programa.
   *
   * El copy sale del brief guardado, no del body. Es la única forma de que lo
   * que llega al borrador sea exactamente lo que se validó contra evidencia; si
   * el cliente pudiera reescribirlo, aceptar se convertiría en la vía para
   * introducir afirmaciones que ninguna fuente sustenta.
   */
  async accept(
    actor: AuthenticatedActor,
    runId: string,
    design: DraftDesignSubmission,
    idempotencyKey?: string,
  ): Promise<PublicationDraftResponse> {
    this.#require(actor, "content:edit");
    const record = await this.#runs.findById({
      id: runId,
      organizationId: actor.organizationId,
    });
    if (record === null) {
      throw new NotFoundException("La ejecución no existe.");
    }
    // Una ejecución pendiente, cancelada o rechazada no tiene brief que
    // aceptar. El estado por sí solo no alcanza: `brief` es lo que se persiste.
    if (record.status !== "generated" || record.brief === null) {
      throw new ConflictException(
        "La ejecución no produjo un brief que se pueda aceptar.",
      );
    }

    const brief = record.brief;
    return this.#drafts.create(
      actor,
      {
        content: {
          caption: brief.caption,
          products: brief.products.map((product) => ({
            label: product.label,
            reference: product.externalProductId,
          })),
        },
        design,
        ...(record.locationId === null
          ? {}
          : { locationId: record.locationId }),
        title: brief.title,
      },
      idempotencyKey,
    );
  }

  /**
   * Resuelve la sucursal contra la configuración de la organización.
   *
   * Sirve para dos cosas: el nombre viaja al evento para que el prompt pueda
   * nombrarla, y una sucursal ajena o inexistente se detiene acá con un 404 en
   * lugar de romper contra la clave foránea ya dentro de la transacción.
   */
  async #resolveLocationName(
    actor: AuthenticatedActor,
    locationId: string | null,
  ): Promise<string | null> {
    if (locationId === null) {
      return null;
    }
    const configuration = await this.#configuration.findByOrganizationId(
      actor.organizationId,
    );
    const location = configuration?.locations.find(
      (entry) => entry.id === locationId,
    );
    if (location === undefined) {
      throw new NotFoundException("La sucursal del pedido no existe.");
    }
    return location.name;
  }

  #prepare(
    actor: AuthenticatedActor,
    operation: string,
    idempotencyKey: string | undefined,
    payload: Readonly<Record<string, unknown>>,
    at: Date,
  ): ReturnType<ReliableOperationService["prepare"]> {
    if (idempotencyKey === undefined) {
      throw new BadRequestException("Falta la cabecera idempotency-key.");
    }
    try {
      return this.#reliableOperations.prepare(
        actor,
        operation,
        idempotencyKey,
        payload,
        at,
      );
    } catch (cause: unknown) {
      // Sólo un valor mal formado es culpa de quien pide. Cualquier otra falla
      // es nuestra y debe subir como tal en lugar de disfrazarse de 400.
      if (cause instanceof RangeError || cause instanceof TypeError) {
        throw new BadRequestException(
          "La cabecera idempotency-key o el pedido no son válidos.",
        );
      }
      throw cause;
    }
  }

  #require(
    actor: AuthenticatedActor,
    permission: "content:edit" | "content:read",
  ): void {
    const decision = authorizeActor(actor, permission, actor.organizationId);
    if (!decision.allowed) {
      throw new ForbiddenException("La sesión no habilita esta acción.");
    }
  }
}
