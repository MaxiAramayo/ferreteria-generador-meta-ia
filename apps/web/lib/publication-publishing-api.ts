/**
 * Llamadas del panel a la vertical de publicación.
 *
 * La clave idempotente la genera quien llama y viaja en el encabezado, igual
 * que en el resto de las mutaciones. Acá importa más que en ningún otro lado:
 * un doble envío desde el navegador —doble clic, un reintento del usuario, un
 * refresh en el momento justo— crearía dos órdenes sobre la misma pieza, y la
 * clave es lo que hace que el segundo intento devuelva la orden del primero en
 * vez de una nueva.
 *
 * Ningún resultado inventa un desenlace cuando la API no contestó. Una
 * publicación pedida y sin respuesta puede haber salido, así que se informa
 * como indeterminada y el panel recarga el estado en vez de afirmar un fallo.
 */

import type {
  PublicationManualActionListResponse,
  PublicationOrderRequestResponse,
  PublicationOrderResponse,
  PublishingReadinessResponse,
} from "@aramayo/contracts";
import type { PublicationTarget } from "@aramayo/domain";

export type PublishRequestResult =
  | Readonly<{ kind: "accepted"; order: PublicationOrderRequestResponse }>
  | Readonly<{ kind: "forbidden" }>
  /**
   * El pedido salió y no se supo el desenlace. No es un fallo: recargar es lo
   * único honesto, porque la orden pudo haberse creado.
   */
  | Readonly<{ kind: "indeterminate"; message: string }>
  | Readonly<{ kind: "rejected"; message: string }>;

/**
 * Lo que se le muestra a alguien antes de confirmar.
 *
 * Sale de la revisión **aprobada**, no de la última: lo que se va a publicar es
 * el snapshot que alguien revisó, y mostrar un borrador más nuevo haría que la
 * confirmación describiera algo distinto de lo que sale. `approved` viaja
 * explícito para que la pantalla pueda decirlo en vez de suponerlo.
 */
export type PublishConfirmationResult =
  | Readonly<{
      approved: boolean;
      caption: string;
      checksumSha256: string;
      kind: "ready";
      previewAlt: string;
      previewUrl: string;
      title: string;
    }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>;

export type PublicationOrderLoadResult =
  | Readonly<{ kind: "ready"; order: PublicationOrderResponse }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>;

export type PublicationOrderHistoryResult =
  | Readonly<{ items: readonly PublicationOrderResponse[]; kind: "ready" }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>;

export type ManualActionListResult =
  | Readonly<{
      items: PublicationManualActionListResponse["items"];
      kind: "ready";
    }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>;

async function payload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function csrf(apiBaseUrl: string): Promise<string | null> {
  const response = await fetch(new URL("auth/csrf", apiBaseUrl), {
    credentials: "include",
    headers: { accept: "application/json" },
  });
  const body = objectRecord(await payload(response));
  return response.ok && typeof body?.["csrfToken"] === "string"
    ? body["csrfToken"]
    : null;
}

/** Mensaje del servidor si lo trae; nunca el cuerpo crudo. */
function safeMessage(body: unknown, fallback: string): string {
  const record = objectRecord(body);
  const message = record?.["message"];
  return typeof message === "string" && message.length > 0 ? message : fallback;
}

function isOrderRequest(
  value: unknown,
): value is PublicationOrderRequestResponse {
  const record = objectRecord(value);
  return (
    record !== null &&
    typeof record["orderId"] === "string" &&
    typeof record["publicationId"] === "string" &&
    typeof record["version"] === "number"
  );
}

function isOrder(value: unknown): value is PublicationOrderResponse {
  const record = objectRecord(value);
  return (
    record !== null &&
    typeof record["id"] === "string" &&
    typeof record["status"] === "string" &&
    Array.isArray(record["targets"])
  );
}

export async function requestPublication(
  apiBaseUrl: string,
  publicationId: string,
  expectedVersion: number,
  targets: readonly PublicationTarget[],
  idempotencyKey: string,
): Promise<PublishRequestResult> {
  try {
    const csrfToken = await csrf(apiBaseUrl);
    if (csrfToken === null) return { kind: "forbidden" };
    const response = await fetch(
      new URL(`publications/${publicationId}/publish`, apiBaseUrl),
      {
        body: JSON.stringify({ expectedVersion, targets: [...targets] }),
        credentials: "include",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
          "x-csrf-token": csrfToken,
        },
        method: "POST",
      },
    );
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    const body = await payload(response);
    if (response.ok && isOrderRequest(body)) {
      return { kind: "accepted", order: body };
    }
    return {
      kind: "rejected",
      message: safeMessage(
        body,
        "La API rechazó la publicación. Recargá el estado.",
      ),
    };
  } catch {
    // El pedido pudo haber llegado. Afirmar que falló sería inventar un
    // desenlace que nadie comprobó, y con una acción irreversible atrás.
    return {
      kind: "indeterminate",
      message:
        "No sabemos si el pedido llegó. Recargá para ver si la orden se creó.",
    };
  }
}

/**
 * Si se puede publicar, leído con el permiso de publicar.
 *
 * No usa el listado de conexiones a propósito: ese exige `connections:manage`,
 * que el rol `publisher` no tiene, y decidir con datos que la sesión no puede
 * leer dejaba el control apagado para justamente quien está autorizado.
 */
export async function loadPublishingReadiness(
  apiBaseUrl: string,
): Promise<PublishingReadinessResponse | null> {
  try {
    const response = await fetch(new URL("publishing/readiness", apiBaseUrl), {
      cache: "no-store",
      credentials: "include",
      headers: { accept: "application/json" },
    });
    const body = objectRecord(await payload(response));
    if (!response.ok || body === null) return null;
    const targets = body["targets"];
    if (typeof body["canPublish"] !== "boolean" || !Array.isArray(targets)) {
      return null;
    }
    return Object.freeze({
      ...(typeof body["accountName"] === "string"
        ? { accountName: body["accountName"] }
        : {}),
      canPublish: body["canPublish"],
      targets: Object.freeze(targets) as PublishingReadinessResponse["targets"],
    });
  } catch {
    // Sin respuesta se asume que no se puede publicar: es la lectura segura.
    return null;
  }
}

export async function loadPublishConfirmation(
  apiBaseUrl: string,
  publicationId: string,
): Promise<PublishConfirmationResult> {
  try {
    const response = await fetch(
      new URL(`publications/${publicationId}`, apiBaseUrl),
      {
        cache: "no-store",
        credentials: "include",
        headers: { accept: "application/json" },
      },
    );
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    const body = objectRecord(await payload(response));
    const revision = objectRecord(body?.["latestRevision"]);
    const content = objectRecord(revision?.["content"]);
    const rendered = objectRecord(revision?.["renderedMedia"]);
    const caption = content?.["caption"];
    const title = body?.["title"];
    const previewUrl = rendered?.["secureUrl"];
    const checksumSha256 = rendered?.["checksumSha256"];
    if (
      !response.ok ||
      typeof caption !== "string" ||
      typeof title !== "string" ||
      typeof previewUrl !== "string" ||
      typeof checksumSha256 !== "string"
    ) {
      // Sin pieza verificable o sin copy no hay nada que confirmar. Mostrar la
      // pantalla a medias invitaría a publicar sin haber visto qué sale.
      return {
        kind: "error",
        message:
          "La publicación todavía no tiene copy y PNG confirmados para revisar.",
      };
    }
    return {
      approved:
        revision?.["status"] === "approved" &&
        typeof revision["approvalSnapshotId"] === "string",
      caption,
      checksumSha256,
      kind: "ready",
      previewAlt: `PNG aprobado de ${title}`,
      previewUrl,
      title,
    };
  } catch {
    return {
      kind: "error",
      message: "No se pudo leer qué se va a publicar.",
    };
  }
}

export async function loadPublicationOrder(
  apiBaseUrl: string,
  orderId: string,
): Promise<PublicationOrderLoadResult> {
  try {
    const response = await fetch(
      new URL(`publication-orders/${orderId}`, apiBaseUrl),
      {
        cache: "no-store",
        credentials: "include",
        headers: { accept: "application/json" },
      },
    );
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    const body = await payload(response);
    return response.ok && isOrder(body)
      ? { kind: "ready", order: body }
      : {
          kind: "error",
          message: "No se pudo leer el estado de la publicación.",
        };
  } catch {
    return {
      kind: "error",
      message: "La API no respondió al consultar la publicación.",
    };
  }
}

/**
 * Historial de órdenes de una publicación.
 *
 * Una pieza que salió a medias y se reintentó tiene más de una, y mirarlas en
 * orden es lo que permite entender qué pasó sin adivinar.
 */
export async function loadPublicationOrders(
  apiBaseUrl: string,
  publicationId: string,
): Promise<PublicationOrderHistoryResult> {
  try {
    const response = await fetch(
      new URL(`publications/${publicationId}/orders`, apiBaseUrl),
      {
        cache: "no-store",
        credentials: "include",
        headers: { accept: "application/json" },
      },
    );
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    const body = objectRecord(await payload(response));
    const items = body?.["items"];
    return response.ok && Array.isArray(items) && items.every(isOrder)
      ? { items: Object.freeze(items), kind: "ready" }
      : {
          kind: "error",
          message: "No se pudo leer el historial de publicación.",
        };
  } catch {
    return {
      kind: "error",
      message: "La API no respondió al consultar el historial.",
    };
  }
}

export async function loadPendingManualActions(
  apiBaseUrl: string,
): Promise<ManualActionListResult> {
  try {
    const response = await fetch(
      new URL("publication-targets/pending-actions", apiBaseUrl),
      {
        cache: "no-store",
        credentials: "include",
        headers: { accept: "application/json" },
      },
    );
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    const body = objectRecord(await payload(response));
    const items = body?.["items"];
    return response.ok && Array.isArray(items)
      ? {
          items: Object.freeze(
            items,
          ) as PublicationManualActionListResponse["items"],
          kind: "ready",
        }
      : {
          kind: "error",
          message: "No se pudo leer qué publicaciones esperan una decisión.",
        };
  } catch {
    return {
      kind: "error",
      message: "La API no respondió al consultar las publicaciones detenidas.",
    };
  }
}

export async function applyManualAction(
  apiBaseUrl: string,
  publicationTargetId: string,
  action: "abandon" | "reconcile" | "retry",
): Promise<ManualActionListResult> {
  try {
    const csrfToken = await csrf(apiBaseUrl);
    if (csrfToken === null) return { kind: "forbidden" };
    const response = await fetch(
      new URL(
        `publication-targets/${encodeURIComponent(publicationTargetId)}/actions`,
        apiBaseUrl,
      ),
      {
        body: JSON.stringify({ action }),
        credentials: "include",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-csrf-token": csrfToken,
        },
        method: "POST",
      },
    );
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    const body = objectRecord(await payload(response));
    const items = body?.["items"];
    if (response.ok && Array.isArray(items)) {
      return {
        items: Object.freeze(
          items,
        ) as PublicationManualActionListResponse["items"],
        kind: "ready",
      };
    }
    return {
      kind: "error",
      message: safeMessage(
        body,
        "La acción no se pudo aplicar. Recargá el estado.",
      ),
    };
  } catch {
    return {
      kind: "error",
      message: "La API no respondió y la acción no fue confirmada.",
    };
  }
}
