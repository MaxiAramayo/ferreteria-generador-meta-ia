import type {
  CreateRecurringStoryRuleResponse,
  RecurringStoryRuleResponse,
  RecurringStoryWorkspaceResponse,
} from "@aramayo/contracts";
import {
  authorizeActor,
  singleOccurrenceRule,
  type AuthenticatedActor,
  type OrganizationConfigurationRepository,
  type PublicationWeekday,
  type RecurringStoryRuleRecord,
  type RecurringStoryRuleRepository,
} from "@aramayo/domain";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import {
  ORGANIZATION_CONFIGURATION_REPOSITORY,
  RECURRING_STORY_RULE_REPOSITORY,
} from "../database/database.tokens.ts";
import type { CreateRecurringStoryRuleDto } from "./dto/create-recurring-story-rule.dto.ts";

function response(rule: RecurringStoryRuleRecord): RecurringStoryRuleResponse {
  return Object.freeze({
    approvalPolicy: rule.approvalPolicy,
    effectiveFrom: rule.effectiveFrom,
    id: rule.id,
    leadTimeMinutes: rule.leadTimeMinutes,
    localTime: rule.localTime,
    locationId: rule.locationId,
    name: rule.name,
    status: rule.status,
    timeZone: rule.timeZone,
    version: rule.version,
    weekdays: rule.weekdays,
  });
}

function canUseAutomaticApproval(actor: AuthenticatedActor): boolean {
  return (
    authorizeActor(actor, "content:schedule", actor.organizationId).allowed &&
    authorizeActor(actor, "organization:manage", actor.organizationId).allowed
  );
}

@Injectable()
export class RecurringStoryService {
  readonly #configuration: OrganizationConfigurationRepository;
  readonly #rules: RecurringStoryRuleRepository;

  constructor(
    @Inject(RECURRING_STORY_RULE_REPOSITORY)
    rules: RecurringStoryRuleRepository,
    @Inject(ORGANIZATION_CONFIGURATION_REPOSITORY)
    configuration: OrganizationConfigurationRepository,
  ) {
    this.#rules = rules;
    this.#configuration = configuration;
  }

  async workspace(
    actor: AuthenticatedActor,
  ): Promise<RecurringStoryWorkspaceResponse> {
    const [configuration, rules] = await Promise.all([
      this.#configuration.findByOrganizationId(actor.organizationId),
      this.#rules.list(actor.organizationId),
    ]);
    if (configuration === null) {
      throw new NotFoundException("No se encontró la organización.");
    }
    return Object.freeze({
      canUseAutomaticApproval: canUseAutomaticApproval(actor),
      locations: Object.freeze(
        configuration.locations.filter((location) => location.isActive),
      ),
      rules: Object.freeze(rules.map(response)),
    });
  }

  async create(
    actor: AuthenticatedActor,
    input: CreateRecurringStoryRuleDto,
    idempotencyKey?: string,
  ): Promise<CreateRecurringStoryRuleResponse> {
    const normalizedKey = idempotencyKey?.trim();
    if (
      normalizedKey === undefined ||
      normalizedKey.length < 8 ||
      normalizedKey.length > 128
    ) {
      throw new BadRequestException(
        "El encabezado Idempotency-Key es obligatorio y debe ser válido.",
      );
    }
    if (
      input.approvalPolicy === "automatic-routine" &&
      !canUseAutomaticApproval(actor)
    ) {
      throw new ForbiddenException(
        "La aprobación automática requiere administración y programación.",
      );
    }
    const configuration = await this.#configuration.findByOrganizationId(
      actor.organizationId,
    );
    const location = configuration?.locations.find(
      (candidate) => candidate.id === input.locationId && candidate.isActive,
    );
    if (location === undefined) {
      throw new NotFoundException("No se encontró una sucursal activa.");
    }
    const anchor = singleOccurrenceRule({
      gapPolicy: "skip",
      localDate: input.effectiveFromLocalDate,
      localTime: input.localTime,
      timeZone: location.timeZone,
    });
    if (anchor === undefined) {
      throw new BadRequestException(
        "La fecha y hora elegidas no existen en la zona de la sucursal.",
      );
    }
    const result = await this.#rules.create({
      actor,
      approvalPolicy: input.approvalPolicy,
      effectiveFrom: anchor.effectiveFrom,
      idempotencyKey: normalizedKey,
      leadTimeMinutes: input.leadTimeMinutes,
      localTime: input.localTime,
      locationId: input.locationId,
      name: input.name.trim(),
      occurredAt: new Date().toISOString(),
      weekdays: input.weekdays as PublicationWeekday[],
    });
    switch (result.status) {
      case "created":
        return Object.freeze({
          rule: response(result.rule),
          status: "created",
        });
      case "idempotency-conflict":
        throw new ConflictException(
          "La clave idempotente ya fue usada con otra regla.",
        );
      case "location-not-found":
        throw new NotFoundException("No se encontró la sucursal.");
    }
  }
}
