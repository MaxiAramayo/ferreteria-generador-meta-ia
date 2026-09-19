import type {
  CreateRecurringStoryRuleResponse,
  RecurringStoryRuleResponse,
  RecurringStoryWorkspaceResponse,
  UpdateRecurringStoryVisualStyleResponse,
} from "@aramayo/contracts";
import { isInlineImageDataUrl } from "@aramayo/design-engine/validation";
import {
  authorizeActor,
  recurringStoryStyleIssue,
  singleOccurrenceRule,
  type AuthenticatedActor,
  type OrganizationConfigurationRepository,
  type PublicationWeekday,
  type RecurringStoryDesignVariant,
  type RecurringStoryPhoto,
  type RecurringStoryRuleRecord,
  type RecurringStoryRuleRepository,
  type RecurringStoryStyleIssue,
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
import type { UpdateRecurringStoryVisualStyleDto } from "./dto/update-recurring-story-visual-style.dto.ts";

function response(rule: RecurringStoryRuleRecord): RecurringStoryRuleResponse {
  return Object.freeze({
    accent: rule.accent,
    approvalPolicy: rule.approvalPolicy,
    designVariant: rule.designVariant,
    effectiveFrom: rule.effectiveFrom,
    id: rule.id,
    leadTimeMinutes: rule.leadTimeMinutes,
    localTime: rule.localTime,
    locationId: rule.locationId,
    name: rule.name,
    photo: rule.photo,
    status: rule.status,
    theme: rule.theme,
    timeZone: rule.timeZone,
    version: rule.version,
    weekdays: rule.weekdays,
  });
}

const styleIssueMessages: Readonly<Record<RecurringStoryStyleIssue, string>> =
  Object.freeze({
    "photo-alt-invalid": "La foto necesita una descripción corta.",
    "photo-focus-invalid": "El encuadre de la foto no es válido.",
    "photo-required": "La imagen propia necesita una imagen.",
    "photo-too-large": "La foto supera el tamaño permitido.",
    "photo-type-invalid": "La foto tiene que ser JPEG o PNG.",
  });

/**
 * El dominio decide lo que es regla de la apertura y el motor, que los bytes
 * sean de verdad la imagen que dicen ser: una foto que el render no podría
 * decodificar se rechaza al guardarla, no cada día al renderizar.
 */
function assertValidStyle(
  designVariant: RecurringStoryDesignVariant,
  photo: RecurringStoryPhoto | null,
): void {
  const issue = recurringStoryStyleIssue({ designVariant, photo });
  if (issue !== null) {
    throw new BadRequestException({
      field: "photo",
      message: styleIssueMessages[issue],
    });
  }
  if (photo !== null && !isInlineImageDataUrl(photo.dataUrl)) {
    throw new BadRequestException({
      field: "photo",
      message: styleIssueMessages["photo-type-invalid"],
    });
  }
}

function photoFrom(
  input: Readonly<{ alt: string; dataUrl: string; focusY: number }> | null,
): RecurringStoryPhoto | null {
  return input === null
    ? null
    : Object.freeze({
        alt: input.alt.trim(),
        dataUrl: input.dataUrl,
        focusY: input.focusY,
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
    const photo = photoFrom(input.photo ?? null);
    assertValidStyle(input.designVariant ?? "cartel", photo);
    const configuration = await this.#configuration.findByOrganizationId(
      actor.organizationId,
    );
    const locationId = input.locationId ?? null;
    const scope = (configuration?.locations ?? []).filter(
      (candidate) =>
        candidate.isActive &&
        (locationId === null || candidate.id === locationId),
    );
    const [location] = scope;
    if (location === undefined) {
      throw new NotFoundException("No se encontró una sucursal activa.");
    }
    // Para todas las sucursales, la hora de la historia tiene que significar
    // lo mismo en cada una.
    if (scope.some((candidate) => candidate.timeZone !== location.timeZone)) {
      throw new BadRequestException(
        "Las sucursales no comparten zona horaria: elegí una para esta historia.",
      );
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
      ...(input.accent === undefined ? {} : { accent: input.accent }),
      actor,
      approvalPolicy: input.approvalPolicy,
      ...(input.designVariant === undefined
        ? {}
        : { designVariant: input.designVariant }),
      effectiveFrom: anchor.effectiveFrom,
      idempotencyKey: normalizedKey,
      leadTimeMinutes: input.leadTimeMinutes,
      localTime: input.localTime,
      locationId,
      name: input.name.trim(),
      photo,
      ...(input.theme === undefined ? {} : { theme: input.theme }),
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

  async updateVisualStyle(
    actor: AuthenticatedActor,
    ruleId: string,
    input: UpdateRecurringStoryVisualStyleDto,
    idempotencyKey?: string,
  ): Promise<UpdateRecurringStoryVisualStyleResponse> {
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
    // El estilo se reemplaza entero: una foto omitida no puede significar
    // «borrala» sin que nadie lo haya pedido.
    if (input.photo === undefined) {
      throw new BadRequestException({
        field: "photo",
        message: "Indicá la foto de la regla o null para usar la del local.",
      });
    }
    const photo = photoFrom(input.photo);
    assertValidStyle(input.designVariant, photo);
    const result = await this.#rules.updateVisualStyle({
      accent: input.accent,
      actor,
      designVariant: input.designVariant,
      expectedVersion: input.expectedVersion,
      idempotencyKey: normalizedKey,
      occurredAt: new Date().toISOString(),
      photo,
      ruleId,
      theme: input.theme,
    });
    if (result.status === "not-found") {
      throw new NotFoundException("No se encontró la regla recurrente.");
    }
    if (result.status === "version-conflict") {
      throw new ConflictException(
        "La regla cambió. Recargá antes de guardar el estilo.",
      );
    }
    return Object.freeze({ rule: response(result.rule), status: "updated" });
  }
}
