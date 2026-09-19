import type { LocationConfigurationResponse } from "./organization-configuration.ts";

export type RecurringStoryApprovalPolicyResponse =
  "automatic-routine" | "human-each-cycle";

/** `imagen` publica tal cual la imagen propia de la regla. */
export type RecurringStoryDesignVariantResponse =
  "cartel" | "horario" | "imagen" | "locales";

export type RecurringStoryThemeResponse = "taller" | "claro" | "promo";

/** Color de la etiqueta de estado y del botón de contacto. */
export type RecurringStoryAccentResponse = "marca" | "senal" | "verde";

/**
 * Foto propia de la regla, embebida como `data:` JPEG o PNG. `focusY` es el
 * encuadre vertical, de 0 a 100.
 */
export interface RecurringStoryPhotoPayload {
  readonly alt: string;
  readonly dataUrl: string;
  readonly focusY: number;
}

export interface RecurringStoryRuleResponse {
  readonly accent: RecurringStoryAccentResponse;
  readonly approvalPolicy: RecurringStoryApprovalPolicyResponse;
  /** Diseño que usa esta regla para todos sus días seleccionados. */
  readonly designVariant: RecurringStoryDesignVariantResponse;
  readonly effectiveFrom: string;
  readonly id: string;
  readonly leadTimeMinutes: number;
  readonly localTime: string;
  /** `null`: la historia es para todas las sucursales activas. */
  readonly locationId: string | null;
  readonly name: string;
  /** `null`: la historia usa la foto del local. */
  readonly photo: RecurringStoryPhotoPayload | null;
  readonly status: "active" | "cancelled" | "paused";
  readonly theme: RecurringStoryThemeResponse;
  readonly timeZone: string;
  readonly version: number;
  readonly weekdays: readonly number[];
}

export interface RecurringStoryWorkspaceResponse {
  readonly canUseAutomaticApproval: boolean;
  readonly locations: readonly LocationConfigurationResponse[];
  readonly rules: readonly RecurringStoryRuleResponse[];
}

export interface CreateRecurringStoryRuleResponse {
  readonly rule: RecurringStoryRuleResponse;
  readonly status: "created";
}

export interface UpdateRecurringStoryVisualStyleResponse {
  readonly rule: RecurringStoryRuleResponse;
  readonly status: "updated";
}
