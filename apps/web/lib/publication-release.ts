import type { PublishingReadinessResponse } from "@aramayo/contracts";
import type { PublicationTarget } from "@aramayo/domain";

import { approvalTargetsFor } from "./publication-card.ts";
import { requestPublication } from "./publication-publishing-api.ts";
import { approvePublicationForRelease } from "./publication-workspace-api.ts";

/**
 * Sacar una pieza en un gesto (`P2-T11`, `ADR-034`).
 *
 * Quien publica ve la imagen final, el texto, a dónde sale y con qué cuenta, y
 * con un toque la pieza sale ahora o queda programada. Aprobar va adentro de
 * ese toque y lo dice el botón: nada se aprueba ni se publica sin que la
 * persona haya visto lo que sale.
 */

export interface ReleaseTargetOption {
  readonly checked: boolean;
  /** Por qué no se puede elegir, o `null` si se puede. */
  readonly disabledReason: string | null;
  readonly label: string;
  readonly target: PublicationTarget;
}

const targetLabels: Readonly<Record<PublicationTarget, string>> = {
  facebook_page: "Facebook",
  instagram_feed: "Instagram · post",
  instagram_story: "Instagram · historia",
};

/**
 * A dónde puede salir la pieza. Una historia sale como historia de Instagram;
 * un post, en el feed y, si se quiere, también en Facebook, que exige texto.
 */
export function releaseTargetOptions(
  format: string | undefined,
  readiness: PublishingReadinessResponse | null,
  captionEmpty: boolean,
): readonly ReleaseTargetOption[] {
  const [natural] = approvalTargetsFor(format);
  const possible: readonly PublicationTarget[] =
    natural === "instagram_feed"
      ? ["instagram_feed", "facebook_page"]
      : ["instagram_story"];
  return possible.map((target) => {
    const connected = readiness?.targets.includes(target) ?? false;
    const disabledReason = !connected
      ? "No está conectado."
      : target === "facebook_page" && captionEmpty
        ? "Facebook necesita el texto del post."
        : null;
    return {
      checked: target === natural && disabledReason === null,
      disabledReason,
      label: targetLabels[target],
      target,
    };
  });
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * La próxima media hora, para «Más tarde»: un horario fijo de la mañana ya
 * pasó casi siempre que se publica a la tarde.
 */
export function nextHalfHour(now: Date): Readonly<{
  localDate: string;
  localTime: string;
}> {
  const next = new Date(now.getTime());
  next.setSeconds(0, 0);
  const minutes = next.getMinutes();
  next.setMinutes(minutes < 30 ? 30 : 60);
  if (next.getTime() - now.getTime() < 10 * 60_000) {
    next.setMinutes(next.getMinutes() + 30);
  }
  return {
    localDate: `${String(next.getFullYear())}-${twoDigits(next.getMonth() + 1)}-${twoDigits(next.getDate())}`,
    localTime: `${twoDigits(next.getHours())}:${twoDigits(next.getMinutes())}`,
  };
}

export type ReleaseWhen =
  | Readonly<{ kind: "later"; localDate: string; localTime: string }>
  | Readonly<{ kind: "now" }>;

export type ReleaseResult =
  | Readonly<{ kind: "published" }>
  | Readonly<{ kind: "scheduled" }>
  /** Quedó aprobada pero la publicación no salió: se reintenta desde la pieza. */
  | Readonly<{ kind: "approved-not-published"; message: string }>
  /** El pedido salió y no se supo el desenlace: recargar es lo honesto. */
  | Readonly<{ kind: "indeterminate"; message: string }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>;

/**
 * Aprueba si hace falta y publica o programa, en ese orden.
 *
 * Las claves de idempotencia llegan de afuera: un doble toque con las mismas
 * claves no aprueba dos veces ni crea dos órdenes.
 */
export async function releasePiece(
  apiBaseUrl: string,
  input: Readonly<{
    alreadyApproved: boolean;
    keys: Readonly<{ approve: string; publish: string }>;
    publicationId: string;
    targets: readonly PublicationTarget[];
    version: number;
    when: ReleaseWhen;
  }>,
): Promise<ReleaseResult> {
  if (input.targets.length === 0) {
    return { kind: "error", message: "Elegí a dónde sale." };
  }
  if (input.when.kind === "later") {
    if (input.alreadyApproved) {
      return {
        kind: "error",
        message: "Esta pieza ya está aprobada: programala desde Programación.",
      };
    }
    const scheduled = await approvePublicationForRelease(
      apiBaseUrl,
      input.publicationId,
      input.version,
      input.keys.approve,
      {
        localDate: input.when.localDate,
        localTime: input.when.localTime,
        targets: input.targets,
      },
    );
    return scheduled.kind === "approved" ? { kind: "scheduled" } : scheduled;
  }

  let version = input.version;
  if (!input.alreadyApproved) {
    const approved = await approvePublicationForRelease(
      apiBaseUrl,
      input.publicationId,
      version,
      input.keys.approve,
    );
    if (approved.kind !== "approved") return approved;
    version = approved.version;
  }
  const published = await requestPublication(
    apiBaseUrl,
    input.publicationId,
    version,
    input.targets,
    input.keys.publish,
  );
  switch (published.kind) {
    case "accepted":
      return { kind: "published" };
    case "forbidden":
      return { kind: "forbidden" };
    case "indeterminate":
      return { kind: "indeterminate", message: published.message };
    case "rejected":
      return input.alreadyApproved
        ? { kind: "error", message: published.message }
        : { kind: "approved-not-published", message: published.message };
  }
}
