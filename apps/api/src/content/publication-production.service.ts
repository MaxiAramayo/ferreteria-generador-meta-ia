import type {
  PublicationApprovalResponse,
  PublicationDiscardResponse,
  PublicationRenderRequestResponse,
} from "@aramayo/contracts";
import {
  authorizeActor,
  type AuthenticatedActor,
  type PublicationProductionRepository,
  type ReliableMutationContext,
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
import { PUBLICATION_PRODUCTION_REPOSITORY } from "../database/database.tokens.ts";

@Injectable()
export class PublicationProductionService {
  readonly #reliableOperations: ReliableOperationService;
  readonly #repository: PublicationProductionRepository;

  constructor(
    @Inject(PUBLICATION_PRODUCTION_REPOSITORY)
    repository: PublicationProductionRepository,
    reliableOperations: ReliableOperationService,
  ) {
    this.#repository = repository;
    this.#reliableOperations = reliableOperations;
  }

  async requestRender(
    actor: AuthenticatedActor,
    publicationId: string,
    expectedVersion: number,
    idempotencyKey?: string,
  ): Promise<PublicationRenderRequestResponse> {
    this.#require(actor, "content:edit");
    const reliableOperation = this.#prepare(
      actor,
      "content.publication:request-render",
      idempotencyKey,
      { expectedVersion, publicationId },
    );
    const result = await this.#repository.requestRender({
      actorMembershipId: actor.membershipId,
      expectedVersion,
      organizationId: actor.organizationId,
      publicationId,
      reliableOperation,
    });
    switch (result.status) {
      case "accepted":
        return Object.freeze({
          publicationId: result.publicationId,
          revisionId: result.revisionId,
          status: "generating_assets",
          version: result.version,
        });
      case "conflict":
        throw new ConflictException(
          "La publicación cambió. Recargá antes de solicitar otro render.",
        );
      case "idempotency-conflict":
        throw new ConflictException(
          "La clave idempotente ya fue usada con otra solicitud.",
        );
      case "in-progress":
        throw new ConflictException({
          message: "La misma solicitud todavía está en curso.",
          retryAfter: result.retryAfter,
        });
      case "invalid-state":
        throw new ConflictException(
          "La publicación no admite render en su estado actual.",
        );
      case "not-found":
        throw new NotFoundException("No se encontró la publicación.");
    }
  }

  /**
   * Descartar una pieza que no va a publicarse.
   *
   * Requiere `content:edit`, igual que crearla: quien puede armar un borrador
   * puede tirarlo. No alcanza a una pieza aprobada o publicada; ahí el
   * repositorio responde `invalid-state` y la pieza queda como está.
   */
  async discard(
    actor: AuthenticatedActor,
    publicationId: string,
    expectedVersion: number,
    idempotencyKey?: string,
  ): Promise<PublicationDiscardResponse> {
    this.#require(actor, "content:edit");
    const reliableOperation = this.#prepare(
      actor,
      "content.publication:discard",
      idempotencyKey,
      { expectedVersion, publicationId },
    );
    const result = await this.#repository.discard({
      actorMembershipId: actor.membershipId,
      expectedVersion,
      organizationId: actor.organizationId,
      publicationId,
      reliableOperation,
    });
    switch (result.status) {
      case "cancelled":
        return Object.freeze({
          publicationId: result.publicationId,
          status: result.status,
          version: result.version,
        });
      case "conflict":
        throw new ConflictException(
          "La publicación cambió. Recargá antes de descartarla.",
        );
      case "idempotency-conflict":
        throw new ConflictException(
          "La clave idempotente ya fue usada con otra solicitud.",
        );
      case "in-progress":
        throw new ConflictException({
          message: "El mismo descarte todavía está en curso.",
          retryAfter: result.retryAfter,
        });
      case "invalid-state":
        throw new ConflictException(
          "Una pieza aprobada, programada o publicada no se descarta: ya es evidencia de lo que salió.",
        );
      case "not-found":
        throw new NotFoundException("No se encontró la publicación.");
    }
  }

  async approve(
    actor: AuthenticatedActor,
    publicationId: string,
    expectedVersion: number,
    idempotencyKey?: string,
  ): Promise<PublicationApprovalResponse> {
    this.#require(actor, "content:approve");
    const reliableOperation = this.#prepare(
      actor,
      "content.publication:approve",
      idempotencyKey,
      { expectedVersion, publicationId },
    );
    const result = await this.#repository.approve({
      actorMembershipId: actor.membershipId,
      expectedVersion,
      organizationId: actor.organizationId,
      publicationId,
      reliableOperation,
    });
    switch (result.status) {
      case "approved":
      case "scheduled":
        return Object.freeze({
          publicationId: result.publicationId,
          snapshotId: result.snapshotId,
          status: result.status,
          version: result.version,
        });
      case "conflict":
        throw new ConflictException(
          "La publicación cambió. Recargá antes de aprobar.",
        );
      case "idempotency-conflict":
        throw new ConflictException(
          "La clave idempotente ya fue usada con otra solicitud.",
        );
      case "in-progress":
        throw new ConflictException({
          message: "La misma aprobación todavía está en curso.",
          retryAfter: result.retryAfter,
        });
      case "invalid-state":
        throw new ConflictException(
          "La publicación debe tener un PNG listo para revisión.",
        );
      case "not-found":
        throw new NotFoundException("No se encontró la publicación.");
    }
  }

  #prepare(
    actor: AuthenticatedActor,
    operation: string,
    idempotencyKey: string | undefined,
    request: unknown,
  ): ReliableMutationContext {
    if (idempotencyKey === undefined) {
      throw new BadRequestException(
        "El encabezado Idempotency-Key es obligatorio.",
      );
    }
    try {
      return this.#reliableOperations.prepare(
        actor,
        operation,
        idempotencyKey,
        request,
        new Date(),
      );
    } catch (cause: unknown) {
      if (cause instanceof RangeError || cause instanceof TypeError) {
        throw new BadRequestException(
          "El encabezado Idempotency-Key o la solicitud no son válidos.",
        );
      }
      throw cause;
    }
  }

  #require(
    actor: AuthenticatedActor,
    permission: "content:approve" | "content:edit",
  ): void {
    if (!authorizeActor(actor, permission, actor.organizationId).allowed) {
      throw new ForbiddenException(
        "No tenés permisos para realizar esta acción.",
      );
    }
  }
}
