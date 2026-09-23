import type { LocationConfigurationResponse } from "./organization-configuration.ts";

export type RecurringStoryApprovalPolicyResponse =
  "automatic-routine" | "human-each-cycle";

/** Qué historia recurrente arma la regla: el local que abre o el servicio. */
export type RecurringStoryKindResponse = "apertura" | "lubricentro";

/**
 * Marco de la historia. Cada uno deja libre una zona distinta de la foto;
 * `horario` y `locales` son marcos heredados, e `imagen` publica tal cual la
 * imagen propia de la regla.
 */
export type RecurringStoryDesignVariantResponse =
  "cartel" | "esquina" | "horario" | "imagen" | "locales" | "placa" | "ventana";

export type RecurringStoryThemeResponse =
  "taller" | "claro" | "promo" | "lubricentro";

/** Color de la etiqueta de estado y del botón de contacto. */
export type RecurringStoryAccentResponse = "marca" | "senal" | "verde";

/**
 * Foto propia de la regla, embebida como `data:` JPEG o PNG.
 *
 * `focusX` y `focusY` son el punto de la imagen que queda fijo, de 0 a 100, y
 * `zoom` el acercamiento en porcentaje, de 100 a 250.
 */
export interface RecurringStoryPhotoPayload {
  readonly alt: string;
  readonly dataUrl: string;
  readonly focusX: number;
  readonly focusY: number;
  readonly zoom: number;
}

export interface RecurringStoryRuleResponse {
  readonly accent: RecurringStoryAccentResponse;
  readonly approvalPolicy: RecurringStoryApprovalPolicyResponse;
  /** Diseño que usa esta regla para todos sus días seleccionados. */
  readonly designVariant: RecurringStoryDesignVariantResponse;
  readonly effectiveFrom: string;
  readonly id: string;
  readonly kind: RecurringStoryKindResponse;
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

/** Pausar o reanudar una regla: la devuelve con su estado nuevo. */
export interface RecurringStoryRuleStatusResponse {
  readonly rule: RecurringStoryRuleResponse;
  readonly status: "updated";
}

/** Borrar una regla: se va ella y el vínculo con lo que materializó. */
export interface DeleteRecurringStoryRuleResponse {
  readonly ruleId: string;
  readonly status: "deleted";
}
