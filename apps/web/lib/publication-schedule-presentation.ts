import type {
  PublicationScheduleOccurrenceResponse,
  PublicationScheduleResponse,
} from "@aramayo/contracts";

import { publicationTargetLabels } from "./publication-publishing-presentation.ts";

/**
 * Estados de una programación y de sus turnos, como los lee quien programa.
 *
 * La API los devuelve como identificadores; mostrarlos tal cual —`active`,
 * `planned`— obliga a traducir en la cabeza lo que la pantalla debería decir.
 */
export const scheduleStatusLabels: Readonly<
  Record<PublicationScheduleResponse["status"], string>
> = Object.freeze({
  active: "Activa",
  cancelled: "Cancelada",
  completed: "Terminada",
  expired: "Vencida",
  paused: "Pausada",
});

export const occurrenceStatusLabels: Readonly<
  Record<PublicationScheduleOccurrenceResponse["status"], string>
> = Object.freeze({
  cancelled: "Cancelada",
  dispatched: "Despachada",
  planned: "Planificada",
  skipped: "Salteada",
});

export function scheduleTargetsLabel(
  targets: PublicationScheduleResponse["targets"],
): string {
  return targets.map((target) => publicationTargetLabels[target]).join(" · ");
}
