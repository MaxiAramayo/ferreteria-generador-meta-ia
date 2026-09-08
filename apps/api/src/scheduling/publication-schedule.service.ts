import type { PublicationScheduleTransitionResponse } from "@aramayo/contracts";
import {
  authorizeActor,
  type AuthenticatedActor,
  type PublicationScheduleManagementRepository,
  type PublicationScheduleTransitionCommand,
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
import { PUBLICATION_SCHEDULE_MANAGEMENT_REPOSITORY } from "../database/database.tokens.ts";
import type { TransitionPublicationScheduleDto } from "./dto/transition-publication-schedule.dto.ts";

function response(
  result: Extract<
    Awaited<ReturnType<PublicationScheduleManagementRepository["transition"]>>,
    Readonly<{ status: "updated" }>
  >,
): PublicationScheduleTransitionResponse {
  return Object.freeze({
    cancelledOccurrenceCount: result.cancelledOccurrenceCount,
    dispatchedOccurrenceCount: result.dispatchedOccurrenceCount,
    publication: result.publication,
    scheduleId: result.scheduleId,
    status: "updated",
    version: result.version,
  });
}

type PublicationScheduleTransitionDraft =
  | Readonly<{
      actorMembershipId: string;
      expectedVersion: number;
      type: "pause" | "resume";
    }>
  | Readonly<{
      actorMembershipId: string;
      expectedVersion: number;
      reasonCode: string;
      type: "cancel";
    }>;

@Injectable()
export class PublicationScheduleService {
  readonly #reliableOperations: ReliableOperationService;
  readonly #repository: PublicationScheduleManagementRepository;

  constructor(
    @Inject(PUBLICATION_SCHEDULE_MANAGEMENT_REPOSITORY)
    repository: PublicationScheduleManagementRepository,
    reliableOperations: ReliableOperationService,
  ) {
    this.#repository = repository;
    this.#reliableOperations = reliableOperations;
  }

  async transition(
    actor: AuthenticatedActor,
    scheduleId: string,
    input: TransitionPublicationScheduleDto,
    idempotencyKey?: string,
  ): Promise<PublicationScheduleTransitionResponse> {
    this.#require(actor);
    const command = this.#command(actor, input);
    const reliableOperation = this.#prepare(
      actor,
      `scheduling.schedule:${command.type}`,
      idempotencyKey,
      {
        expectedVersion: command.expectedVersion,
        ...(command.type === "cancel"
          ? { reasonCode: command.reasonCode }
          : {}),
        scheduleId,
        type: command.type,
      },
    );
    const result = await this.#repository.transition({
      command: this.#withOccurredAt(command, reliableOperation.occurredAt),
      organizationId: actor.organizationId,
      reliableOperation,
      scheduleId,
    });
    switch (result.status) {
      case "updated":
        return response(result);
      case "conflict":
        throw new ConflictException(
          "La programación cambió. Recargá antes de aplicar esta acción.",
        );
      case "idempotency-conflict":
        throw new ConflictException(
          "La clave idempotente ya fue usada con otra acción de calendario.",
        );
      case "in-progress":
        throw new ConflictException({
          message: "La misma acción de calendario todavía está en curso.",
          retryAfter: result.retryAfter,
        });
      case "invalid-state":
        throw new ConflictException(
          "La programación no admite esa acción en su estado actual.",
        );
      case "not-found":
        throw new NotFoundException("No se encontró la programación.");
    }
  }

  #command(
    actor: AuthenticatedActor,
    input: TransitionPublicationScheduleDto,
  ): PublicationScheduleTransitionDraft {
    const base = {
      actorMembershipId: actor.membershipId,
      expectedVersion: input.expectedVersion,
    } as const;
    if (input.type !== "cancel" && input.reasonCode !== undefined) {
      throw new BadRequestException(
        "Sólo una cancelación puede incluir un código de motivo.",
      );
    }
    switch (input.type) {
      case "pause":
        return Object.freeze({ ...base, type: "pause" });
      case "resume":
        return Object.freeze({ ...base, type: "resume" });
      case "cancel":
        if (input.reasonCode === undefined) {
          throw new BadRequestException(
            "Cancelar una programación requiere un código de motivo válido.",
          );
        }
        return Object.freeze({
          ...base,
          reasonCode: input.reasonCode,
          type: "cancel",
        });
    }
  }

  #withOccurredAt(
    command: PublicationScheduleTransitionDraft,
    occurredAt: string,
  ): PublicationScheduleTransitionCommand {
    switch (command.type) {
      case "pause":
        return Object.freeze({ ...command, occurredAt, type: "pause" });
      case "resume":
        return Object.freeze({ ...command, occurredAt, type: "resume" });
      case "cancel":
        return Object.freeze({ ...command, occurredAt, type: "cancel" });
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

  #require(actor: AuthenticatedActor): void {
    if (
      !authorizeActor(actor, "content:schedule", actor.organizationId).allowed
    ) {
      throw new ForbiddenException(
        "No tenés permisos para gestionar programaciones.",
      );
    }
  }
}
