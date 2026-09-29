import type {
  PublicationListResponse,
  PublicationStatusResponse,
} from "@aramayo/contracts";
import { authorizeActor, type AuthenticatedActor } from "@aramayo/domain";

import { parseSessionActor } from "./authentication-api.ts";

export type WorkspaceActor = AuthenticatedActor;

export type PublicationWorkspaceLoadResult =
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{
      actor: WorkspaceActor;
      canApprove: boolean;
      canEdit: boolean;
      canSchedule: boolean;
      kind: "empty";
    }>
  | Readonly<{
      actor: WorkspaceActor;
      canApprove: boolean;
      canEdit: boolean;
      canSchedule: boolean;
      /** Cuántas salieron en total; el listado trae sólo las últimas. */
      doneTotal: number;
      kind: "ready";
      /** Todo lo que falta sacar, y después las últimas que salieron. */
      publications: PublicationListResponse;
    }>;

/**
 * Lo que falta sacar llega entero; de lo que ya salió, las últimas. Las
 * historias automáticas suman dos piezas por día, y una sola página de veinte
 * dejaba afuera un borrador o una pieza programada de hace unos días.
 */
const upcomingListPath = "publications?stage=upcoming&page=1&limit=100";
const doneListPath = "publications?stage=done&page=1&limit=20";

export type TemplateDraftSaveResult =
  | Readonly<{
      kind: "saved";
      publication: Readonly<{ id: string; title: string }>;
    }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>;

export type PublicationCommandResult =
  | Readonly<{ kind: "completed"; message: string }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>;

export type PublicationPreviewResult =
  | Readonly<{
      kind: "ready";
      preview: Readonly<{
        alt: string;
        checksumSha256: string;
        secureUrl: string;
      }>;
    }>
  | Readonly<{ kind: "error"; message: string }>;

const publicationStatuses: ReadonlySet<string> = new Set([
  "approved",
  "cancelled",
  "draft",
  "expired",
  "generating_assets",
  "generation_failed",
  "missing_information",
  "partially_published",
  "published",
  "publishing",
  "publish_failed",
  "ready_for_review",
  "retrieving_context",
  "scheduled",
  "validation_failed",
]);

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

async function payload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isPublicationStatus(
  value: unknown,
): value is PublicationStatusResponse {
  return typeof value === "string" && publicationStatuses.has(value);
}

function isDateText(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isPublicationFailure(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }
  const failure = record(value);
  return (
    failure !== null &&
    typeof failure["code"] === "string" &&
    isDateText(failure["occurredAt"]) &&
    typeof failure["retryable"] === "boolean" &&
    typeof failure["safeMessage"] === "string"
  );
}

function isPublicationList(value: unknown): value is PublicationListResponse {
  const page = record(value);
  return (
    page !== null &&
    Array.isArray(page["items"]) &&
    page["items"].every((entry) => {
      const publication = record(entry);
      return (
        publication !== null &&
        isDateText(publication["createdAt"]) &&
        isPublicationFailure(publication["failure"]) &&
        typeof publication["id"] === "string" &&
        (publication["latestContentBriefRunId"] === undefined ||
          typeof publication["latestContentBriefRunId"] === "string") &&
        typeof publication["latestContentHash"] === "string" &&
        typeof publication["latestRevisionId"] === "string" &&
        typeof publication["latestRevisionNumber"] === "number" &&
        (publication["locationId"] === undefined ||
          typeof publication["locationId"] === "string") &&
        isPublicationStatus(publication["status"]) &&
        typeof publication["title"] === "string" &&
        isDateText(publication["updatedAt"]) &&
        typeof publication["version"] === "number"
      );
    }) &&
    typeof page["limit"] === "number" &&
    typeof page["page"] === "number" &&
    typeof page["total"] === "number"
  );
}

/**
 * La publicación que devuelve la API al guardar un borrador. Vive acá y se
 * comparte: quien la lea por su cuenta termina inventando la forma.
 */
export function savedPublication(
  value: unknown,
): Readonly<{ id: string; title: string }> | null {
  const publication = record(value);
  const revision = record(publication?.["latestRevision"]);
  return publication !== null &&
    revision !== null &&
    typeof publication["id"] === "string" &&
    typeof publication["title"] === "string" &&
    typeof revision["id"] === "string" &&
    typeof revision["revisionNumber"] === "number"
    ? { id: publication["id"], title: publication["title"] }
    : null;
}

export async function loadPublicationWorkspace(
  apiBaseUrl: string,
): Promise<PublicationWorkspaceLoadResult> {
  try {
    const read = (path: string): Promise<Response> =>
      fetch(new URL(path, apiBaseUrl), {
        cache: "no-store",
        credentials: "include",
        headers: { accept: "application/json" },
      });
    const responses = await Promise.all([
      read("auth/session"),
      read(upcomingListPath),
      read(doneListPath),
    ]);
    if (
      responses.some(
        (response) => response.status === 401 || response.status === 403,
      )
    ) {
      return { kind: "forbidden" };
    }
    const [sessionResponse, upcomingResponse, doneResponse] = responses;
    const [session, upcoming, done] = await Promise.all([
      payload(sessionResponse),
      payload(upcomingResponse),
      payload(doneResponse),
    ]);
    const actor = parseSessionActor(session);
    if (
      responses.some((response) => !response.ok) ||
      actor === null ||
      !isPublicationList(upcoming) ||
      !isPublicationList(done)
    ) {
      return {
        kind: "error",
        message: "La API devolvió un listado que el panel no puede usar.",
      };
    }
    const canEdit = authorizeActor(
      actor,
      "content:edit",
      actor.organizationId,
    ).allowed;
    const canApprove = authorizeActor(
      actor,
      "content:approve",
      actor.organizationId,
    ).allowed;
    const canSchedule = authorizeActor(
      actor,
      "content:schedule",
      actor.organizationId,
    ).allowed;
    const total = upcoming.total + done.total;
    return total === 0
      ? { actor, canApprove, canEdit, canSchedule, kind: "empty" }
      : {
          actor,
          canApprove,
          canEdit,
          canSchedule,
          doneTotal: done.total,
          kind: "ready",
          publications: Object.freeze({
            items: Object.freeze([...upcoming.items, ...done.items]),
            limit: upcoming.limit + done.limit,
            page: 1,
            total,
          }),
        };
  } catch {
    return {
      kind: "error",
      message: "No se pudo conectar con la API para cargar publicaciones.",
    };
  }
}

async function publicationCommand(
  apiBaseUrl: string,
  publicationId: string,
  expectedVersion: number,
  command: "approve" | "delete" | "render",
  idempotencyKey: string,
  /** Sólo al aprobar: el turno viaja con la aprobación, no en otra pantalla. */
  schedule?: Readonly<{
    localDate: string;
    localTime: string;
    targets: readonly string[];
  }>,
): Promise<PublicationCommandResult> {
  try {
    const csrf = await csrfToken(apiBaseUrl);
    if (csrf === null) {
      return { kind: "forbidden" };
    }
    const response = await fetch(
      new URL(`publications/${publicationId}/${command}`, apiBaseUrl),
      {
        body: JSON.stringify({
          expectedVersion,
          ...(schedule === undefined ? {} : { schedule }),
        }),
        credentials: "include",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
          "x-csrf-token": csrf,
        },
        method: "POST",
      },
    );
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    const done: Readonly<Record<typeof command, string>> = {
      approve:
        schedule === undefined
          ? "Revisión aprobada y conservada."
          : "Aprobada y programada.",
      delete: "La pieza se eliminó para siempre.",
      render: "Preparando la imagen. Se abre sola cuando esté lista.",
    };
    const failed: Readonly<Record<typeof command, string>> = {
      approve: "No se pudo aprobar. Recargá el estado.",
      delete: "No se pudo eliminar. Recargá el estado.",
      render: "No se pudo preparar la imagen. Recargá el estado.",
    };
    return response.ok
      ? { kind: "completed", message: done[command] }
      : { kind: "error", message: failed[command] };
  } catch {
    return {
      kind: "error",
      message: "La API no respondió y la acción no fue confirmada.",
    };
  }
}

export function requestPublicationRender(
  apiBaseUrl: string,
  publicationId: string,
  expectedVersion: number,
  idempotencyKey: string,
): Promise<PublicationCommandResult> {
  return publicationCommand(
    apiBaseUrl,
    publicationId,
    expectedVersion,
    "render",
    idempotencyKey,
  );
}

/** Eliminar para siempre una pieza que nunca fue evidencia. */
export function deletePublication(
  apiBaseUrl: string,
  publicationId: string,
  expectedVersion: number,
  idempotencyKey: string,
): Promise<PublicationCommandResult> {
  return publicationCommand(
    apiBaseUrl,
    publicationId,
    expectedVersion,
    "delete",
    idempotencyKey,
  );
}

export function approvePublication(
  apiBaseUrl: string,
  publicationId: string,
  expectedVersion: number,
  idempotencyKey: string,
  /** Con turno, aprobar y programar son un solo gesto. */
  schedule?: Readonly<{
    localDate: string;
    localTime: string;
    targets: readonly string[];
  }>,
): Promise<PublicationCommandResult> {
  return publicationCommand(
    apiBaseUrl,
    publicationId,
    expectedVersion,
    "approve",
    idempotencyKey,
    schedule,
  );
}

export async function loadPublicationPreview(
  apiBaseUrl: string,
  publicationId: string,
): Promise<PublicationPreviewResult> {
  try {
    const response = await fetch(
      new URL(`publications/${publicationId}`, apiBaseUrl),
      {
        cache: "no-store",
        credentials: "include",
        headers: { accept: "application/json" },
      },
    );
    const body = record(await payload(response));
    const revision = record(body?.["latestRevision"]);
    const rendered = record(revision?.["renderedMedia"]);
    const secureUrl = rendered?.["secureUrl"];
    const checksumSha256 = rendered?.["checksumSha256"];
    const title = body?.["title"];
    return response.ok &&
      typeof secureUrl === "string" &&
      typeof checksumSha256 === "string" &&
      typeof title === "string"
      ? {
          kind: "ready",
          preview: {
            alt: `PNG renderizado de ${title}`,
            checksumSha256,
            secureUrl,
          },
        }
      : {
          kind: "error",
          message: "La publicación todavía no conserva un PNG verificable.",
        };
  } catch {
    return {
      kind: "error",
      message: "No se pudo cargar el PNG de la publicación.",
    };
  }
}

async function csrfToken(apiBaseUrl: string): Promise<string | null> {
  const response = await fetch(new URL("auth/csrf", apiBaseUrl), {
    credentials: "include",
    headers: { accept: "application/json" },
  });
  const body = record(await payload(response));
  return response.ok && typeof body?.["csrfToken"] === "string"
    ? body["csrfToken"]
    : null;
}

export async function saveTemplatePublicationDraft(
  apiBaseUrl: string,
  input: Readonly<{
    caption: string;
    idempotencyKey: string;
    title: string;
  }>,
): Promise<TemplateDraftSaveResult> {
  try {
    const csrf = await csrfToken(apiBaseUrl);
    if (csrf === null) {
      return { kind: "forbidden" };
    }
    const response = await fetch(new URL("publications", apiBaseUrl), {
      body: JSON.stringify({
        content: { caption: input.caption, products: [] },
        design: {
          content: {
            callToAction: "Consultanos por WhatsApp",
            title: input.title,
          },
          format: "historia",
          layout: "historia-tip",
          media: [],
          schemaVersion: 1,
          slug: "historia-tip-editorial",
          theme: "taller",
        },
        title: input.title,
      }),
      credentials: "include",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "idempotency-key": input.idempotencyKey,
        "x-csrf-token": csrf,
      },
      method: "POST",
    });
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    const body = await payload(response);
    const publication = savedPublication(body);
    return response.ok && publication !== null
      ? { kind: "saved", publication }
      : {
          kind: "error",
          message: "El borrador no se guardó. Revisá los campos y reintentá.",
        };
  } catch {
    return {
      kind: "error",
      message: "La API no respondió. El borrador no fue confirmado.",
    };
  }
}

export type PublicationReopenResult =
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{ kind: "reopened"; version: number }>;

/**
 * Devuelve a borrador una pieza en revisión para editarla (`P2-T11`). La
 * versión nueva es la que espera el guardado que sigue.
 */
export async function reopenPublication(
  apiBaseUrl: string,
  publicationId: string,
  expectedVersion: number,
  idempotencyKey: string,
): Promise<PublicationReopenResult> {
  try {
    const csrf = await csrfToken(apiBaseUrl);
    if (csrf === null) return { kind: "forbidden" };
    const response = await fetch(
      new URL(`publications/${publicationId}/reopen`, apiBaseUrl),
      {
        body: JSON.stringify({ expectedVersion }),
        credentials: "include",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
          "x-csrf-token": csrf,
        },
        method: "POST",
      },
    );
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    const body = record(await payload(response));
    const version = body?.["version"];
    return response.ok && typeof version === "number"
      ? { kind: "reopened", version }
      : {
          kind: "error",
          message:
            "La pieza cambió mientras la editabas. Recargá antes de guardar.",
        };
  } catch {
    return {
      kind: "error",
      message: "La API no respondió y la pieza no volvió a borrador.",
    };
  }
}

export type PublicationApproveResult =
  | Readonly<{ kind: "approved"; status: string; version: number }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>;

/**
 * Aprobar y conocer la versión que queda (`P2-T11`): publicar en el mismo
 * gesto necesita esa versión, que el aviso de `approvePublication` no trae.
 */
export async function approvePublicationForRelease(
  apiBaseUrl: string,
  publicationId: string,
  expectedVersion: number,
  idempotencyKey: string,
  schedule?: Readonly<{
    localDate: string;
    localTime: string;
    targets: readonly string[];
  }>,
): Promise<PublicationApproveResult> {
  try {
    const csrf = await csrfToken(apiBaseUrl);
    if (csrf === null) return { kind: "forbidden" };
    const response = await fetch(
      new URL(`publications/${publicationId}/approve`, apiBaseUrl),
      {
        body: JSON.stringify({
          expectedVersion,
          ...(schedule === undefined ? {} : { schedule }),
        }),
        credentials: "include",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
          "x-csrf-token": csrf,
        },
        method: "POST",
      },
    );
    if (response.status === 401 || response.status === 403) {
      return { kind: "forbidden" };
    }
    const body = record(await payload(response));
    const version = body?.["version"];
    const status = body?.["status"];
    if (
      response.ok &&
      typeof version === "number" &&
      typeof status === "string"
    ) {
      return { kind: "approved", status, version };
    }
    const message = body?.["message"];
    return {
      kind: "error",
      message:
        typeof message === "string" && message.length > 0
          ? message
          : "No se pudo aprobar. Recargá el estado.",
    };
  } catch {
    return {
      kind: "error",
      message: "La API no respondió y la pieza no quedó aprobada.",
    };
  }
}
