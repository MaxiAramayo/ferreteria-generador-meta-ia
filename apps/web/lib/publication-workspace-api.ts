import type {
  PublicationListResponse,
  PublicationStatusResponse,
} from "@aramayo/contracts";
import {
  authorizeActor,
  organizationRoles,
  type AuthenticatedActor,
  type OrganizationRole,
} from "@aramayo/domain";

export type WorkspaceActor = AuthenticatedActor;

export type PublicationWorkspaceLoadResult =
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{
      actor: WorkspaceActor;
      canApprove: boolean;
      canEdit: boolean;
      kind: "empty";
    }>
  | Readonly<{
      actor: WorkspaceActor;
      canApprove: boolean;
      canEdit: boolean;
      kind: "ready";
      publications: PublicationListResponse;
    }>;

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

const roles: ReadonlySet<string> = new Set(organizationRoles);

function sessionActor(value: unknown): WorkspaceActor | null {
  const session = record(value);
  const actor = record(session?.["actor"]);
  const actorRoles = actor?.["roles"];
  return actor !== null &&
    typeof actor["displayName"] === "string" &&
    typeof actor["email"] === "string" &&
    typeof actor["membershipId"] === "string" &&
    typeof actor["organizationId"] === "string" &&
    Array.isArray(actorRoles) &&
    actorRoles.every(
      (role): role is OrganizationRole =>
        typeof role === "string" && roles.has(role),
    ) &&
    typeof actor["sessionId"] === "string" &&
    typeof actor["userId"] === "string"
    ? {
        displayName: actor["displayName"],
        email: actor["email"],
        membershipId: actor["membershipId"],
        organizationId: actor["organizationId"],
        roles: actorRoles,
        sessionId: actor["sessionId"],
        userId: actor["userId"],
      }
    : null;
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

function savedPublication(
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
    const [sessionResponse, publicationsResponse] = await Promise.all([
      fetch(new URL("auth/session", apiBaseUrl), {
        cache: "no-store",
        credentials: "include",
        headers: { accept: "application/json" },
      }),
      fetch(new URL("publications?page=1&limit=20", apiBaseUrl), {
        cache: "no-store",
        credentials: "include",
        headers: { accept: "application/json" },
      }),
    ]);
    if (
      sessionResponse.status === 401 ||
      sessionResponse.status === 403 ||
      publicationsResponse.status === 401 ||
      publicationsResponse.status === 403
    ) {
      return { kind: "forbidden" };
    }
    const [session, publications] = await Promise.all([
      payload(sessionResponse),
      payload(publicationsResponse),
    ]);
    const actor = sessionActor(session);
    if (
      !sessionResponse.ok ||
      !publicationsResponse.ok ||
      actor === null ||
      !isPublicationList(publications)
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
    return publications.total === 0
      ? { actor, canApprove, canEdit, kind: "empty" }
      : { actor, canApprove, canEdit, kind: "ready", publications };
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
  command: "approve" | "render",
  idempotencyKey: string,
): Promise<PublicationCommandResult> {
  try {
    const csrf = await csrfToken(apiBaseUrl);
    if (csrf === null) {
      return { kind: "forbidden" };
    }
    const response = await fetch(
      new URL(`publications/${publicationId}/${command}`, apiBaseUrl),
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
    return response.ok
      ? {
          kind: "completed",
          message:
            command === "render"
              ? "Render solicitado. El worker actualizará el estado."
              : "Snapshot aprobado y conservado.",
        }
      : {
          kind: "error",
          message:
            command === "render"
              ? "No se pudo solicitar el render. Recargá el estado."
              : "No se pudo aprobar. Recargá el estado.",
        };
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

export function approvePublication(
  apiBaseUrl: string,
  publicationId: string,
  expectedVersion: number,
  idempotencyKey: string,
): Promise<PublicationCommandResult> {
  return publicationCommand(
    apiBaseUrl,
    publicationId,
    expectedVersion,
    "approve",
    idempotencyKey,
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
