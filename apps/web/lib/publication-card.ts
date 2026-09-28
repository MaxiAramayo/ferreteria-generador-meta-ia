import type { PublicationSummaryResponse } from "@aramayo/contracts";

import type { PublishGate } from "./publication-publishing-presentation.ts";

/**
 * Qué muestra y qué ofrece cada pieza del listado (`P2-T11`).
 *
 * La tarjeta tiene una acción principal —la que sigue en el camino de esa
 * pieza— y el resto queda a un toque, en «Más acciones». Decidirlo acá, sin
 * React, deja probar cada estado sin montar la pantalla.
 */

type Summary = Pick<
  PublicationSummaryResponse,
  "format" | "layout" | "previewUrl" | "status"
>;

export interface CardPermissions {
  readonly canApprove: boolean;
  readonly canEdit: boolean;
  readonly canSchedule: boolean;
}

/** El formato dicho como lo dice quien publica. */
export function pieceFormatLabel(format: string | undefined): string {
  switch (format) {
    case "feed":
      return "Post";
    case "cuadrado":
      return "Post cuadrado";
    case "historia":
      return "Historia";
    case undefined:
    default:
      return "Pieza";
  }
}

/**
 * A dónde sale una pieza que se aprueba y se programa en el mismo gesto.
 *
 * Un post va al feed y una historia a historias: mandar un post como historia
 * lo rechaza la publicación, y al revés también. Sin formato conocido se
 * conserva lo de siempre, que era la historia.
 */
export function approvalTargetsFor(
  format: string | undefined,
): readonly ("instagram_feed" | "instagram_story")[] {
  return format === "feed" || format === "cuadrado"
    ? ["instagram_feed"]
    : ["instagram_story"];
}

const recurringLayouts: ReadonlySet<string> = new Set([
  "historia-apertura-cartel",
  "historia-apertura-esquina",
  "historia-apertura-horario",
  "historia-apertura-imagen",
  "historia-apertura-locales",
  "historia-apertura-placa",
  "historia-lubricentro-esquina",
  "historia-lubricentro-imagen",
  "historia-lubricentro-placa",
  "historia-lubricentro-ventana",
]);

const reopenableStatuses: ReadonlySet<PublicationSummaryResponse["status"]> =
  new Set([
    "draft",
    "ready_for_review",
    "generation_failed",
    "validation_failed",
  ]);

/**
 * Con qué se edita una pieza, o `null` si no hay dónde.
 *
 * El producto con foto propia se reabre en su compositor aunque ya esté en
 * revisión: guardar la devuelve a borrador. La historia recurrente conserva su
 * editor, que sólo trabaja sobre un borrador.
 */
export function editorFor(
  publication: Summary,
  permissions: CardPermissions,
): "product" | "recurring" | null {
  if (!permissions.canEdit || publication.layout === undefined) return null;
  if (
    publication.layout.startsWith("foto-producto-") &&
    reopenableStatuses.has(publication.status)
  ) {
    return "product";
  }
  if (
    recurringLayouts.has(publication.layout) &&
    publication.status === "draft"
  ) {
    return "recurring";
  }
  return null;
}

export type CardAction =
  | Readonly<{ kind: "render"; label: string }>
  | Readonly<{ kind: "release"; label: string }>
  | Readonly<{ kind: "preview"; label: string }>
  | Readonly<{ kind: "schedule"; label: string }>
  | Readonly<{ kind: "publish"; label: string }>
  | Readonly<{ kind: "result"; label: string }>
  | Readonly<{ kind: "wait"; label: string }>;

/** La acción que sigue en el camino de la pieza, si la sesión la puede hacer. */
export function primaryActionFor(
  publication: Summary,
  permissions: CardPermissions,
  gate: PublishGate,
): CardAction | null {
  switch (publication.status) {
    case "draft":
      return permissions.canEdit
        ? { kind: "render", label: "Preparar imagen" }
        : null;
    case "generation_failed":
      return permissions.canEdit
        ? { kind: "render", label: "Reintentar imagen" }
        : null;
    case "retrieving_context":
    case "generating_assets":
      return { kind: "wait", label: "Preparando la imagen…" };
    case "ready_for_review":
      // Lo que sigue es sacarla: la hoja deja publicar ya o programar, y
      // aprobar va adentro de ese toque (`ADR-034`).
      return permissions.canApprove
        ? { kind: "release", label: "Publicar…" }
        : { kind: "preview", label: "Ver imagen" };
    case "approved":
      // Una aprobada que no salió —por ejemplo, porque falló la conexión— se
      // vuelve a publicar antes que a programar.
      if (gate.kind === "ready") return { kind: "publish", label: "Publicar…" };
      return permissions.canSchedule
        ? { kind: "schedule", label: "Programar" }
        : { kind: "preview", label: "Ver imagen" };
    case "scheduled":
      return { kind: "preview", label: "Ver imagen" };
    case "publishing":
    case "published":
    case "partially_published":
    case "publish_failed":
      return { kind: "result", label: "Ver resultado" };
    case "missing_information":
    case "validation_failed":
    case "cancelled":
    case "expired":
      return null;
  }
}

/** Publicar ya, cuando no es la acción principal pero se puede. */
export function canPublishNow(
  publication: Summary,
  primary: CardAction | null,
  gate: PublishGate,
): boolean {
  return (
    gate.kind === "ready" &&
    primary?.kind !== "publish" &&
    (publication.status === "approved" || publication.status === "scheduled")
  );
}

/** Programar desde la pieza, cuando no es la acción principal pero se puede. */
export function canScheduleFromCard(
  publication: Summary,
  primary: CardAction | null,
  permissions: CardPermissions,
): boolean {
  return (
    permissions.canSchedule &&
    publication.status === "approved" &&
    primary?.kind !== "schedule"
  );
}

/**
 * El motivo por el que no se puede publicar, sólo cuando hay algo que hacer.
 *
 * «Todavía no está aprobada» en cada borrador era ruido: el estado ya lo dice.
 * Sin conexión sana o sin destino, en cambio, quien espera publicar necesita
 * saberlo.
 */
export function publishBlockNotice(gate: PublishGate): string | null {
  return gate.kind === "blocked" &&
    (gate.reason === "no-healthy-connection" ||
      gate.reason === "no-target-available")
    ? gate.message
    : null;
}
