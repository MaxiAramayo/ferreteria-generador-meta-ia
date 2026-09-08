import type {
  CreatePublicationScheduleResponse,
  PreviewPublicationScheduleUpdateResponse,
  PublicationScheduleCalendarEntryResponse,
  PublicationScheduleCalendarResponse,
  PublicationScheduleTransitionResponse,
  PublicationScheduleResponse,
  UpdatePublicationScheduleResponse,
} from "@aramayo/contracts";
import {
  authorizeActor,
  singleOccurrenceRule,
  type AuthenticatedActor,
  type CreatePublicationScheduleResult,
  type PublicationScheduleCalendarEntry,
  type PublicationRecurrence,
  type PublicationScheduleManagementRepository,
  type PublicationScheduleRule,
  type PublicationScheduleTransitionCommand,
  type PreviewPublicationScheduleUpdateResult,
  type ReliableMutationContext,
  type UpdatePublicationScheduleResult,
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
import type { CreatePublicationScheduleDto } from "./dto/create-publication-schedule.dto.ts";
import type { PublicationScheduleCalendarQueryDto } from "./dto/publication-schedule-calendar-query.dto.ts";
import type { PublicationScheduleRuleDto } from "./dto/publication-schedule-rule.dto.ts";
import type { TransitionPublicationScheduleDto } from "./dto/transition-publication-schedule.dto.ts";
import type { UpdatePublicationScheduleDto } from "./dto/update-publication-schedule.dto.ts";

function createResponse(
  result: Extract<
    CreatePublicationScheduleResult,
    Readonly<{ status: "created" }>
  >,
): CreatePublicationScheduleResponse {
  return Object.freeze({
    materializedOccurrenceCount: result.materializedOccurrenceCount,
    publication: result.publication,
    scheduleId: result.scheduleId,
    status: "created",
    version: result.version,
  });
}

function updateResponse(
  result: Extract<
    UpdatePublicationScheduleResult,
    Readonly<{ status: "updated" }>
  >,
): UpdatePublicationScheduleResponse {
  return Object.freeze({
    cancelledOccurrenceCount: result.cancelledOccurrenceCount,
    createdOccurrenceCount: result.createdOccurrenceCount,
    frozenOccurrenceCount: result.frozenOccurrenceCount,
    rescheduledOccurrenceCount: result.rescheduledOccurrenceCount,
    scheduleId: result.scheduleId,
    status: "updated",
    version: result.version,
  });
}

function previewResponse(
  result: Extract<
    PreviewPublicationScheduleUpdateResult,
    Readonly<{ status: "preview" }>
  >,
): PreviewPublicationScheduleUpdateResponse {
  return Object.freeze({
    cancelledOccurrenceCount: result.cancelledOccurrenceCount,
    createdOccurrenceCount: result.createdOccurrenceCount,
    frozenOccurrenceCount: result.frozenOccurrenceCount,
    rescheduledOccurrenceCount: result.rescheduledOccurrenceCount,
    scheduleId: result.scheduleId,
    status: "preview",
    version: result.version,
  });
}

function scheduleResponse(
  schedule: PublicationScheduleCalendarEntry["schedule"],
): PublicationScheduleResponse {
  return Object.freeze({
    approvalSnapshotId: schedule.approvalSnapshotId,
    effectiveFrom: schedule.rule.effectiveFrom,
    ...(schedule.rule.effectiveUntil === undefined
      ? {}
      : { effectiveUntil: schedule.rule.effectiveUntil }),
    gapPolicy: schedule.rule.gapPolicy,
    id: schedule.id,
    lateToleranceMinutes: schedule.lateToleranceMinutes,
    localTime: schedule.rule.localTime,
    missedPolicy: schedule.missedPolicy,
    publicationId: schedule.publicationId,
    recurrence: schedule.rule.recurrence,
    status: schedule.status,
    targets: schedule.targets,
    timeZone: schedule.rule.timeZone,
    version: schedule.version,
  });
}

function calendarEntryResponse(
  entry: PublicationScheduleCalendarEntry,
): PublicationScheduleCalendarEntryResponse {
  return Object.freeze({
    occurrences: Object.freeze(
      entry.occurrences.map((occurrence) =>
        Object.freeze({
          ...(occurrence.dispatchRequestedAt === undefined
            ? {}
            : { dispatchRequestedAt: occurrence.dispatchRequestedAt }),
          occurrenceKey: occurrence.occurrenceKey,
          ...(occurrence.publicationOrderId === undefined
            ? {}
            : { publicationOrderId: occurrence.publicationOrderId }),
          resolution: occurrence.resolution,
          scheduledAt: occurrence.scheduledAt,
          status: occurrence.status,
        }),
      ),
    ),
    schedule: scheduleResponse(entry.schedule),
  });
}

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

  async calendar(
    actor: AuthenticatedActor,
    input: PublicationScheduleCalendarQueryDto,
  ): Promise<PublicationScheduleCalendarResponse> {
    this.#requireRead(actor);
    const window = this.#calendarWindow(input);
    try {
      const entries = await this.#repository.list({
        from: window.from,
        organizationId: actor.organizationId,
        to: window.to,
      });
      return Object.freeze({
        entries: Object.freeze(entries.map(calendarEntryResponse)),
        from: window.from,
        to: window.to,
      });
    } catch (cause: unknown) {
      if (cause instanceof RangeError) {
        throw new BadRequestException(
          "La ventana de calendario no es válida o supera el máximo permitido.",
        );
      }
      throw cause;
    }
  }

  async detail(
    actor: AuthenticatedActor,
    scheduleId: string,
    input: PublicationScheduleCalendarQueryDto,
  ): Promise<PublicationScheduleCalendarEntryResponse> {
    this.#requireRead(actor);
    const window = this.#calendarWindow(input);
    try {
      const entry = await this.#repository.find({
        from: window.from,
        organizationId: actor.organizationId,
        scheduleId,
        to: window.to,
      });
      if (entry === null) {
        throw new NotFoundException("No se encontró la programación.");
      }
      return calendarEntryResponse(entry);
    } catch (cause: unknown) {
      if (cause instanceof RangeError) {
        throw new BadRequestException(
          "La ventana de calendario no es válida o supera el máximo permitido.",
        );
      }
      throw cause;
    }
  }

  async create(
    actor: AuthenticatedActor,
    publicationId: string,
    input: CreatePublicationScheduleDto,
    idempotencyKey?: string,
  ): Promise<CreatePublicationScheduleResponse> {
    this.#require(actor);
    const rule = this.#rule(input);
    const reliableOperation = this.#prepare(
      actor,
      "scheduling.schedule:create",
      idempotencyKey,
      {
        expectedPublicationVersion: input.expectedPublicationVersion,
        lateToleranceMinutes: input.lateToleranceMinutes,
        missedPolicy: input.missedPolicy,
        publicationId,
        rule,
        targets: input.targets,
      },
    );
    const result = await this.#repository.create({
      actorMembershipId: actor.membershipId,
      expectedPublicationVersion: input.expectedPublicationVersion,
      lateToleranceMinutes: input.lateToleranceMinutes,
      missedPolicy: input.missedPolicy,
      organizationId: actor.organizationId,
      publicationId,
      reliableOperation,
      rule,
      targets: input.targets,
    });
    switch (result.status) {
      case "created":
        return createResponse(result);
      case "conflict":
        throw new ConflictException(
          "La publicación cambió. Recargá antes de programarla.",
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
      case "invalid-rule":
        throw new BadRequestException(
          "La fecha, hora, zona o recurrencia no forman una programación válida.",
        );
      case "invalid-target":
        throw new BadRequestException(
          "Los destinos no coinciden con la aprobación de esta publicación.",
        );
      case "not-approved":
        throw new ConflictException(
          "Sólo se puede programar una publicación aprobada con snapshot vigente.",
        );
      case "not-found":
        throw new NotFoundException("No se encontró la publicación.");
    }
  }

  async update(
    actor: AuthenticatedActor,
    scheduleId: string,
    input: UpdatePublicationScheduleDto,
    idempotencyKey?: string,
  ): Promise<UpdatePublicationScheduleResponse> {
    this.#require(actor);
    const rule = this.#rule(input);
    const reliableOperation = this.#prepare(
      actor,
      "scheduling.schedule:update",
      idempotencyKey,
      {
        expectedVersion: input.expectedVersion,
        lateToleranceMinutes: input.lateToleranceMinutes,
        missedPolicy: input.missedPolicy,
        rule,
        scheduleId,
        targets: input.targets,
      },
    );
    const result = await this.#repository.update({
      actorMembershipId: actor.membershipId,
      expectedVersion: input.expectedVersion,
      lateToleranceMinutes: input.lateToleranceMinutes,
      missedPolicy: input.missedPolicy,
      organizationId: actor.organizationId,
      reliableOperation,
      rule,
      scheduleId,
      targets: input.targets,
    });
    switch (result.status) {
      case "updated":
        return updateResponse(result);
      case "conflict":
        throw new ConflictException(
          "La programación cambió. Recargá antes de moverla.",
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
      case "invalid-rule":
        throw new BadRequestException(
          "La fecha, hora, zona o recurrencia no forman una programación válida.",
        );
      case "invalid-state":
        throw new ConflictException(
          "La programación no admite cambios en su estado actual.",
        );
      case "invalid-target":
        throw new BadRequestException(
          "Los destinos no coinciden con la aprobación de esta publicación.",
        );
      case "not-found":
        throw new NotFoundException("No se encontró la programación.");
    }
  }

  async preview(
    actor: AuthenticatedActor,
    scheduleId: string,
    input: UpdatePublicationScheduleDto,
  ): Promise<PreviewPublicationScheduleUpdateResponse> {
    this.#require(actor);
    const rule = this.#rule(input);
    const result = await this.#repository.preview({
      expectedVersion: input.expectedVersion,
      lateToleranceMinutes: input.lateToleranceMinutes,
      missedPolicy: input.missedPolicy,
      occurredAt: new Date().toISOString(),
      organizationId: actor.organizationId,
      rule,
      scheduleId,
      targets: input.targets,
    });
    switch (result.status) {
      case "preview":
        return previewResponse(result);
      case "conflict":
        throw new ConflictException(
          "La programación cambió. Recargá antes de calcular el impacto.",
        );
      case "invalid-rule":
        throw new BadRequestException(
          "La fecha, hora, zona o recurrencia no forman una programación válida.",
        );
      case "invalid-state":
        throw new ConflictException(
          "La programación no admite cambios en su estado actual.",
        );
      case "invalid-target":
        throw new BadRequestException(
          "Los destinos no coinciden con la aprobación de esta publicación.",
        );
      case "not-found":
        throw new NotFoundException("No se encontró la programación.");
    }
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

  #calendarWindow(
    input: PublicationScheduleCalendarQueryDto,
  ): Readonly<{ from: string; to: string }> {
    try {
      return Object.freeze({
        from: new Date(input.from).toISOString(),
        to: new Date(input.to).toISOString(),
      });
    } catch (cause: unknown) {
      if (cause instanceof RangeError) {
        throw new BadRequestException(
          "La ventana de calendario debe contener dos fechas válidas.",
        );
      }
      throw cause;
    }
  }

  #rule(input: PublicationScheduleRuleDto): PublicationScheduleRule {
    const anchor = this.#localRule(
      input.effectiveFromLocalDate,
      input.localTime,
      input.timeZone,
      input.gapPolicy,
    );
    const recurrence = this.#recurrence(input);
    if (recurrence.kind === "once") {
      if (input.effectiveUntilLocalDate !== undefined) {
        throw new BadRequestException(
          "Una programación única no admite una fecha de finalización distinta.",
        );
      }
      return anchor;
    }
    const end =
      input.effectiveUntilLocalDate === undefined
        ? undefined
        : this.#localRule(
            input.effectiveUntilLocalDate,
            input.localTime,
            input.timeZone,
            input.gapPolicy,
          ).effectiveFrom;
    if (
      end !== undefined &&
      Date.parse(end) < Date.parse(anchor.effectiveFrom)
    ) {
      throw new BadRequestException(
        "La fecha de finalización no puede ser anterior al inicio.",
      );
    }
    return Object.freeze({
      effectiveFrom: anchor.effectiveFrom,
      ...(end === undefined ? {} : { effectiveUntil: end }),
      gapPolicy: input.gapPolicy,
      localTime: input.localTime,
      recurrence,
      timeZone: input.timeZone,
    });
  }

  #localRule(
    localDate: string,
    localTime: string,
    timeZone: string,
    gapPolicy: "next-valid" | "skip",
  ): PublicationScheduleRule {
    try {
      const resolved = singleOccurrenceRule({
        gapPolicy,
        localDate,
        localTime,
        timeZone,
      });
      if (resolved === undefined) {
        throw new BadRequestException(
          "La fecha y hora elegidas no existen en la zona indicada.",
        );
      }
      return resolved;
    } catch (cause: unknown) {
      if (cause instanceof BadRequestException) {
        throw cause;
      }
      if (cause instanceof RangeError) {
        throw new BadRequestException(
          "La fecha, hora o zona de la programación no son válidas.",
        );
      }
      throw cause;
    }
  }

  #recurrence(input: PublicationScheduleRuleDto): PublicationRecurrence {
    const hasMonthlyFields =
      input.monthDay !== undefined || input.monthDayOverflow !== undefined;
    const hasWeeklyFields = input.weekdays !== undefined;
    switch (input.recurrenceKind) {
      case "once":
        if (
          input.recurrenceInterval !== undefined ||
          hasMonthlyFields ||
          hasWeeklyFields
        ) {
          throw new BadRequestException(
            "Una programación única no admite campos de recurrencia.",
          );
        }
        return Object.freeze({ kind: "once" });
      case "daily":
        if (
          input.recurrenceInterval === undefined ||
          hasMonthlyFields ||
          hasWeeklyFields
        ) {
          throw new BadRequestException(
            "Una programación diaria requiere sólo su intervalo.",
          );
        }
        return Object.freeze({
          interval: input.recurrenceInterval,
          kind: "daily",
        });
      case "weekly":
        if (
          input.recurrenceInterval === undefined ||
          input.weekdays === undefined ||
          hasMonthlyFields
        ) {
          throw new BadRequestException(
            "Una programación semanal requiere intervalo y días, sin campos mensuales.",
          );
        }
        return Object.freeze({
          interval: input.recurrenceInterval,
          kind: "weekly",
          weekdays: Object.freeze([...input.weekdays]),
        });
      case "monthly":
        if (
          input.recurrenceInterval === undefined ||
          input.monthDay === undefined ||
          input.monthDayOverflow === undefined ||
          hasWeeklyFields
        ) {
          throw new BadRequestException(
            "Una programación mensual requiere intervalo, día y política de desborde.",
          );
        }
        return Object.freeze({
          interval: input.recurrenceInterval,
          kind: "monthly",
          monthDay: input.monthDay,
          overflow: input.monthDayOverflow,
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

  #requireRead(actor: AuthenticatedActor): void {
    if (!authorizeActor(actor, "content:read", actor.organizationId).allowed) {
      throw new ForbiddenException(
        "No tenés permisos para consultar programaciones.",
      );
    }
  }
}
