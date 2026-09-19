import type {
  LocationConfigurationResponse,
  RecurringStoryAccentResponse,
  RecurringStoryDesignVariantResponse,
  RecurringStoryPhotoPayload,
  RecurringStoryThemeResponse,
} from "@aramayo/contracts";
import type { DesignDocument } from "@aramayo/design-engine";
import { parseDesignDocument } from "@aramayo/design-engine/validation";
import {
  openingStoryDesignDocument,
  resolveEveryLocationStoryDraft,
  resolveRecurringStoryDraft,
  type RecurringStoryDraftResolution,
  type RecurringStoryLocationSource,
} from "@aramayo/domain";

/**
 * Documento de la vista previa de una regla de apertura.
 *
 * No es una maqueta: usa las mismas funciones del dominio que el borrador
 * real, con la configuración vigente de las sucursales. Lo único que la vista
 * previa no puede saber es una excepción cargada para un día puntual.
 */

export type OpeningStoryPreview =
  | Readonly<{ document: DesignDocument; kind: "ready" }>
  | Readonly<{ kind: "blocked"; message: string }>
  | Readonly<{ kind: "needs-photo" }>;

const blockedMessages: Readonly<
  Record<
    Extract<RecurringStoryDraftResolution, { status: "blocked" }>["reason"],
    string
  >
> = Object.freeze({
  "location-closed":
    "La sucursal figura cerrada: no hay «Ya abrimos» que mostrar.",
  "location-inactive": "No hay sucursales activas para esta historia.",
  "missing-hours":
    "Falta el horario de alguna sucursal: sin horario no se afirma «Ya abrimos».",
});

function locationSource(
  location: LocationConfigurationResponse,
): RecurringStoryLocationSource {
  return {
    addressLine: location.addressLine,
    city: location.city,
    id: location.id,
    isActive: location.isActive,
    name: location.name,
    ...(location.openingHours.trim().length === 0
      ? {}
      : { openingHours: location.openingHours }),
    organizationId: "vista-previa",
    province: location.province,
    timeZone: location.timeZone,
    version: location.version,
  };
}

export function openingStoryPreviewDocument(
  input: Readonly<{
    accent: RecurringStoryAccentResponse;
    designVariant: RecurringStoryDesignVariantResponse;
    localDate: string;
    localTime: string;
    /** `null`: la regla es para todas las sucursales activas. */
    locationId: string | null;
    locations: readonly LocationConfigurationResponse[];
    photo: RecurringStoryPhotoPayload | null;
    theme: RecurringStoryThemeResponse;
  }>,
): OpeningStoryPreview {
  if (input.designVariant === "imagen" && input.photo === null) {
    return { kind: "needs-photo" };
  }
  const occurrence = {
    occurrenceKey: `${input.localDate}T${input.localTime}`,
    resolution: "exact" as const,
    scheduledAt: new Date(0).toISOString(),
  };
  const capturedAt = new Date(0).toISOString();
  const scope = input.locations.filter(
    (location) => input.locationId === null || location.id === input.locationId,
  );
  const [single] = scope;
  const resolution =
    input.locationId === null || single === undefined
      ? resolveEveryLocationStoryDraft({
          capturedAt,
          designVariant: input.designVariant,
          locations: scope.map((location) => ({
            location: locationSource(location),
          })),
          occurrence,
          policy: "human-each-cycle",
        })
      : resolveRecurringStoryDraft({
          capturedAt,
          designVariant: input.designVariant,
          location: locationSource(single),
          occurrence,
          policy: "human-each-cycle",
        });
  if (resolution.status === "blocked") {
    return { kind: "blocked", message: blockedMessages[resolution.reason] };
  }

  const parsed = parseDesignDocument(
    openingStoryDesignDocument({
      accent: input.accent,
      content: resolution.designContent,
      designVariant: input.designVariant,
      localDate: input.localDate,
      photo: input.photo,
      ruleId: "vista-previa",
      theme: input.theme,
    }),
  );
  return parsed.ok
    ? { document: parsed.document, kind: "ready" }
    : {
        kind: "blocked",
        message: "La vista previa no se puede componer con estos datos.",
      };
}
