/**
 * Compuerta inmediatamente anterior a Meta.
 *
 * La orden ya existe y conserva su idempotencia, pero ningún publicador recibe
 * un comando hasta que este validador termina. Es importante que el resultado
 * sea un bloqueo de la publicación —no un intento fallido por destino—: aún no
 * ocurrió ninguna escritura remota y una revisión nueva debe partir de cero.
 */

import {
  readApprovalPrePublishProfile,
  readRecurringStorySourceSnapshot,
  validateFacebookCopy,
  validateFacebookDelivery,
  validateFacebookGeometry,
  validateInstagramCaption,
  validateInstagramDelivery,
  validateInstagramGeometry,
  type MediaAssetRecord,
  type MetaConnectionRecord,
  type PromotionApprovalPort,
  type PublicMediaProbePort,
  type PublicationOrderJob,
  type PublicationOrderTargetRecord,
  type PublicationTarget,
  type SupportedMediaMimeType,
} from "@aramayo/domain";

import type { PublicationCredentialPort } from "./publication-order.transport.ts";

/** Caja a la que la variante `meta-feed` limita el lado largo de la pieza. */
const deliveryLongestSide = 1440;

export interface PrePublishCommercialSession {
  price(
    externalProductId: string,
  ): Promise<Readonly<{ amountMinor: number; kind: "priced" }> | null>;
  stock(
    externalProductId: string,
  ): Promise<Readonly<{ kind: "known"; quantity: number }> | null>;
}

/** Puertos mínimos que esta compuerta necesita; no expone un repositorio entero. */
export interface PrePublishConnectionPort {
  list(organizationId: string): Promise<readonly MetaConnectionRecord[]>;
}

export interface PrePublishMediaAssetPort {
  findById(
    scope: Readonly<{ organizationId: string }>,
    mediaAssetId: string,
  ): Promise<MediaAssetRecord | null>;
}

export interface PrePublishMediaStoragePort {
  deliveryUrl(
    object: Readonly<{
      mimeType: SupportedMediaMimeType;
      storageKey: string;
      storageVersion: number;
    }>,
    variant: "meta-feed",
  ): string;
}

/**
 * El adaptador conserva el mapeo de sucursal y la auditoría del catálogo. El
 * validador sólo expresa qué hecho necesita; no conoce Odoo ni credenciales.
 */
export interface PrePublishCommercialPort {
  createSession(
    input: Readonly<{
      actorMembershipId: string;
      locationId: string;
      organizationId: string;
      runId: string;
    }>,
  ): PrePublishCommercialSession;
}

export interface PrePublishValidatorOptions {
  readonly now?: () => Date;
}

export interface PrePublishValidatorPort {
  validate(
    job: PublicationOrderJob,
    targets: readonly PublicationOrderTargetRecord[],
  ): Promise<PrePublishValidation>;
}

interface ApprovedPiece {
  readonly caption: string;
  readonly checksumSha256: string;
  readonly height: number;
  readonly mediaAssetId: string;
  readonly mimeType: SupportedMediaMimeType;
  readonly width: number;
}

export interface PrePublishReadyContext {
  readonly accessToken: string;
  readonly caption: string;
  readonly connection: MetaConnectionRecord;
  readonly media: Readonly<{ height: number; url: string; width: number }>;
}

export type PrePublishValidation =
  | Readonly<{ context: PrePublishReadyContext; status: "ready" }>
  | Readonly<{
      code: string;
      safeMessage: string;
      status: "blocked";
    }>;

function blocked(code: string, safeMessage: string): PrePublishValidation {
  return Object.freeze({ code, safeMessage, status: "blocked" as const });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectAt(
  value: unknown,
  field: string,
): Readonly<Record<string, unknown>> | null {
  if (!isRecord(value)) return null;
  const nested = value[field];
  return isRecord(nested) ? nested : null;
}

function approvedPiece(job: PublicationOrderJob): ApprovedPiece | null {
  const snapshot = job.snapshot;
  const rendered = objectAt(snapshot, "renderedMedia");
  const content = objectAt(snapshot, "content");
  if (rendered === null || content === null) return null;
  const mediaAssetId = rendered["mediaAssetId"];
  const checksumSha256 = rendered["checksumSha256"];
  const mimeType = rendered["mimeType"];
  const width = rendered["width"];
  const height = rendered["height"];
  const caption = content["caption"];
  if (
    typeof mediaAssetId !== "string" ||
    typeof checksumSha256 !== "string" ||
    (mimeType !== "image/png" && mimeType !== "image/jpeg") ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    typeof caption !== "string"
  ) {
    return null;
  }
  return Object.freeze({
    caption,
    checksumSha256,
    height,
    mediaAssetId,
    mimeType,
    width,
  });
}

function deliveredSize(
  width: number,
  height: number,
): Readonly<{ height: number; width: number }> {
  const longest = Math.max(width, height);
  if (longest <= deliveryLongestSide) return Object.freeze({ height, width });
  const factor = deliveryLongestSide / longest;
  return Object.freeze({
    height: Math.round(height * factor),
    width: Math.round(width * factor),
  });
}

function sameRecurringSource(left: unknown, right: unknown): boolean {
  const expected = readRecurringStorySourceSnapshot(left);
  const current = readRecurringStorySourceSnapshot(right);
  if (expected === null || current === null) return false;
  return (
    expected.address === current.address &&
    expected.hours === current.hours &&
    expected.localDate === current.localDate &&
    expected.locationId === current.locationId &&
    expected.locationName === current.locationName &&
    expected.locationVersion === current.locationVersion &&
    expected.sourceKind === current.sourceKind &&
    expected.sourceVersion === current.sourceVersion
  );
}

function parseArsMinor(statement: string): number | null {
  const match = /\$\s*([0-9][0-9.\s]*(?:,[0-9]{1,2})?)/u.exec(statement);
  if (match?.[1] === undefined) return null;
  const normalized = match[1].replaceAll(/[.\s]/gu, "");
  const [integer, decimal = ""] = normalized.split(",");
  if (
    integer === undefined ||
    !/^\d+$/u.test(integer) ||
    !/^\d{0,2}$/u.test(decimal)
  ) {
    return null;
  }
  const amount = Number(integer) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isSafeInteger(amount) ? amount : null;
}

function parseStockQuantity(statement: string): number | null {
  const match = /\b(\d+)\s*(?:unidades?|u)\b/iu.exec(statement);
  if (match?.[1] === undefined) return null;
  const quantity = Number(match[1]);
  return Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : null;
}

type StockExpectation =
  | Readonly<{ kind: "available" }>
  | Readonly<{ kind: "quantity"; quantity: number }>;

/**
 * El brief puede expresar stock como cantidad o como disponibilidad. En ambos
 * casos la comparación es conservadora: una frase que no permite inferir qué
 * se aprobó no habilita una publicación.
 */
function stockExpectation(statement: string): StockExpectation | null {
  const quantity = parseStockQuantity(statement);
  if (quantity !== null) {
    return Object.freeze({ kind: "quantity", quantity });
  }
  if (/\b(?:en\s+stock|stock\s+disponible|disponible)\b/iu.test(statement)) {
    return Object.freeze({ kind: "available" });
  }
  return null;
}

function connectionSupportsTargets(
  connection: MetaConnectionRecord,
  targets: readonly PublicationOrderTargetRecord[],
): boolean {
  if (connection.health !== "healthy") return false;
  const permissions = new Set(connection.grantedPermissions);
  const activeAssets = new Set(
    connection.assets
      .filter((asset) => asset.status === "active")
      .map((asset) => asset.kind),
  );
  const hasPage = activeAssets.has("page");
  const hasInstagram = activeAssets.has("instagram_business");
  const supports = (target: PublicationTarget): boolean => {
    if (target === "facebook_page") {
      return (
        hasPage &&
        permissions.has("pages_manage_posts") &&
        permissions.has("pages_read_engagement") &&
        permissions.has("pages_show_list")
      );
    }
    return (
      hasPage &&
      hasInstagram &&
      permissions.has("instagram_basic") &&
      permissions.has("instagram_content_publish") &&
      permissions.has("pages_read_engagement") &&
      permissions.has("pages_show_list")
    );
  };
  return targets.every((target) => supports(target.target));
}

interface DeliverableAsset {
  readonly storageKey: string;
  readonly storageVersion: number;
}

function candidateAsset(
  asset: MediaAssetRecord | null,
  piece: ApprovedPiece,
): DeliverableAsset | null {
  if (
    asset === null ||
    asset.status !== "available" ||
    asset.storageKey === undefined ||
    asset.storageVersion === undefined ||
    asset.checksumSha256 !== piece.checksumSha256
  ) {
    return null;
  }
  return Object.freeze({
    storageKey: asset.storageKey,
    storageVersion: asset.storageVersion,
  });
}

/** Las validaciones de formato locales se hacen antes de siquiera sondear HTTP. */
function validateLocalMedia(
  targets: readonly PublicationOrderTargetRecord[],
  caption: string,
  media: Readonly<{ height: number; url: string; width: number }>,
): PrePublishValidation | null {
  for (const target of targets) {
    if (target.target === "facebook_page") {
      const copy = validateFacebookCopy(caption);
      const geometry = validateFacebookGeometry(media);
      if (copy.status === "rejected" || geometry.status === "rejected") {
        return blocked(
          "prepublish-media-invalid",
          "La pieza aprobada ya no cumple el formato requerido para publicar. Volvé a renderizar y revisar.",
        );
      }
      continue;
    }
    const captionDecision = validateInstagramCaption(
      target.target,
      target.target === "instagram_story" ? undefined : caption,
    );
    const geometry = validateInstagramGeometry(target.target, media);
    if (
      captionDecision.status === "rejected" ||
      geometry.status === "rejected"
    ) {
      return blocked(
        "prepublish-media-invalid",
        "La pieza aprobada ya no cumple el formato requerido para publicar. Volvé a renderizar y revisar.",
      );
    }
  }
  return null;
}

function validateDeliveredMedia(
  targets: readonly PublicationOrderTargetRecord[],
  delivery: Readonly<{ byteSize: number; mimeType: string }>,
): PrePublishValidation | null {
  for (const target of targets) {
    const decision =
      target.target === "facebook_page"
        ? validateFacebookDelivery(delivery)
        : validateInstagramDelivery(delivery);
    if (decision.status === "rejected") {
      return blocked(
        "prepublish-media-invalid",
        "La variante pública de la pieza no cumple el formato requerido. Volvé a renderizar y revisar.",
      );
    }
  }
  return null;
}

export class PrePublishValidator implements PrePublishValidatorPort {
  readonly #commercial: PrePublishCommercialPort | null;
  readonly #connections: PrePublishConnectionPort;
  readonly #credentials: PublicationCredentialPort;
  readonly #media: PrePublishMediaAssetPort;
  readonly #now: () => Date;
  readonly #probe: PublicMediaProbePort;
  readonly #promotionApprovals: PromotionApprovalPort | null;
  readonly #storage: PrePublishMediaStoragePort;

  constructor(
    connections: PrePublishConnectionPort,
    credentials: PublicationCredentialPort,
    media: PrePublishMediaAssetPort,
    storage: PrePublishMediaStoragePort,
    probe: PublicMediaProbePort,
    commercial: PrePublishCommercialPort | null,
    promotionApprovals: PromotionApprovalPort | null,
    options: PrePublishValidatorOptions = {},
  ) {
    this.#commercial = commercial;
    this.#connections = connections;
    this.#credentials = credentials;
    this.#media = media;
    this.#now = options.now ?? ((): Date => new Date());
    this.#probe = probe;
    this.#promotionApprovals = promotionApprovals;
    this.#storage = storage;
  }

  async validate(
    job: PublicationOrderJob,
    targets: readonly PublicationOrderTargetRecord[],
  ): Promise<PrePublishValidation> {
    if (job.publicationStatus !== "publishing") {
      return blocked(
        "prepublish-snapshot-invalidated",
        "La publicación ya no conserva una aprobación vigente. Creá una revisión nueva antes de publicar.",
      );
    }
    const piece = approvedPiece(job);
    if (piece === null) {
      return blocked(
        "prepublish-snapshot-invalid",
        "El snapshot aprobado no describe una pieza publicable. Creá una revisión nueva.",
      );
    }

    const facts = await this.#validateFacts(job);
    if (facts !== null) return facts;

    const asset = candidateAsset(
      await this.#media.findById(
        { organizationId: job.organizationId },
        piece.mediaAssetId,
      ),
      piece,
    );
    if (asset === null) {
      return blocked(
        "prepublish-media-unavailable",
        "La pieza aprobada ya no está disponible o cambió. Volvé a renderizar y revisar.",
      );
    }
    const media = Object.freeze({
      ...deliveredSize(piece.width, piece.height),
      url: this.#storage.deliveryUrl(
        {
          mimeType: piece.mimeType,
          storageKey: asset.storageKey,
          storageVersion: asset.storageVersion,
        },
        "meta-feed",
      ),
    });
    const localMedia = validateLocalMedia(targets, piece.caption, media);
    if (localMedia !== null) return localMedia;

    let delivered;
    try {
      delivered = await this.#probe.probe(media.url);
    } catch {
      return blocked(
        "prepublish-media-unreachable",
        "No se puede acceder a la pieza pública. Volvé a renderizar o restaurar el medio antes de publicar.",
      );
    }
    if (delivered.status === "unreachable") {
      return blocked(
        "prepublish-media-unreachable",
        "No se puede acceder a la pieza pública. Volvé a renderizar o restaurar el medio antes de publicar.",
      );
    }
    const deliveredMedia = validateDeliveredMedia(targets, delivered);
    if (deliveredMedia !== null) return deliveredMedia;

    const connection = await this.#publishableConnection(
      job.organizationId,
      targets,
    );
    if (connection === null) {
      return blocked(
        "prepublish-connection-unhealthy",
        "La conexión de Meta perdió permisos, activos o vigencia. Reconectala antes de publicar.",
      );
    }
    let accessToken: string | null;
    try {
      accessToken = await this.#credentials.pageAccessToken(
        job.organizationId,
        connection.id,
      );
    } catch {
      return blocked(
        "prepublish-credential-unavailable",
        "No se puede usar la credencial de Meta. Reconectá la cuenta antes de publicar.",
      );
    }
    if (accessToken === null) {
      return blocked(
        "prepublish-credential-unavailable",
        "No se puede usar la credencial de Meta. Reconectá la cuenta antes de publicar.",
      );
    }
    return Object.freeze({
      context: Object.freeze({
        accessToken,
        caption: piece.caption,
        connection,
        media,
      }),
      status: "ready",
    });
  }

  async #validateFacts(
    job: PublicationOrderJob,
  ): Promise<PrePublishValidation | null> {
    const profile = readApprovalPrePublishProfile(job.snapshot);
    if (profile.status === "invalid") {
      return blocked(
        "prepublish-snapshot-invalid",
        "El snapshot aprobado no conserva la evidencia necesaria. Creá una revisión nueva antes de publicar.",
      );
    }
    if (profile.status === "missing") {
      // Un snapshot histórico no permite inferir si hay precio, stock u otra
      // afirmación dinámica dentro de la composición. Publicarlo equivaldría a
      // aceptar esa incertidumbre justo antes del efecto externo.
      return blocked(
        "prepublish-evidence-missing",
        "La aprobación no conserva evidencia revalidable. Creá una revisión nueva antes de publicar.",
      );
    }
    const required = new Set(profile.profile.requiredClaims);
    for (const kind of required) {
      if (
        kind !== "business_hours" &&
        !profile.profile.factualClaims.some((claim) => claim.claimKind === kind)
      ) {
        return blocked(
          "prepublish-evidence-missing",
          "La aprobación no conserva evidencia suficiente para revalidar los datos materiales. Creá una revisión nueva.",
        );
      }
    }

    if (required.has("business_hours")) {
      const expected = profile.profile.recurringStorySource;
      const current = job.recurringStoryMaterialization;
      if (
        expected === undefined ||
        current === undefined ||
        current.invalidatedAt !== undefined ||
        !sameRecurringSource(expected, current.sourceSnapshot)
      ) {
        return blocked(
          "prepublish-hours-changed",
          "El horario o la sucursal cambió desde la aprobación. Materializá y revisá una pieza nueva.",
        );
      }
    }

    const requiresCommercial = required.has("price") || required.has("stock");
    let commercial: PrePublishCommercialSession | null = null;
    if (requiresCommercial) {
      if (this.#commercial === null || job.locationId === undefined) {
        return blocked(
          "prepublish-commercial-unavailable",
          "No se puede revalidar la información comercial de esta pieza. Creá una revisión nueva cuando la fuente esté disponible.",
        );
      }
      try {
        commercial = this.#commercial.createSession({
          actorMembershipId: job.requestedByMembershipId,
          locationId: job.locationId,
          organizationId: job.organizationId,
          runId: job.orderId,
        });
      } catch {
        return blocked(
          "prepublish-commercial-unavailable",
          "No se puede revalidar la información comercial de esta pieza. Creá una revisión nueva cuando la fuente esté disponible.",
        );
      }
    }

    for (const claim of profile.profile.factualClaims) {
      if (claim.claimKind === "price") {
        const expected = parseArsMinor(claim.statement);
        if (
          expected === null ||
          claim.externalProductId === undefined ||
          commercial === null
        ) {
          return blocked(
            "prepublish-evidence-unverifiable",
            "El precio aprobado no conserva un valor revalidable. Creá una revisión nueva.",
          );
        }
        let current: Readonly<{
          amountMinor: number;
          kind: "priced";
        }> | null;
        try {
          current = await commercial.price(claim.externalProductId);
        } catch {
          current = null;
        }
        if (current?.kind !== "priced") {
          return blocked(
            "prepublish-price-unavailable",
            "No se pudo confirmar el precio actual. Revisá la pieza antes de publicar.",
          );
        }
        if (current.amountMinor !== expected) {
          return blocked(
            "prepublish-price-changed",
            "El precio cambió desde la aprobación. Actualizá la pieza y solicitá una nueva revisión.",
          );
        }
      }
      if (claim.claimKind === "stock") {
        const expected = stockExpectation(claim.statement);
        if (
          expected === null ||
          claim.externalProductId === undefined ||
          commercial === null
        ) {
          return blocked(
            "prepublish-evidence-unverifiable",
            "El stock aprobado no conserva una cantidad revalidable. Creá una revisión nueva.",
          );
        }
        let current: Readonly<{ kind: "known"; quantity: number }> | null;
        try {
          current = await commercial.stock(claim.externalProductId);
        } catch {
          current = null;
        }
        if (current?.kind !== "known") {
          return blocked(
            "prepublish-stock-unavailable",
            "No se pudo confirmar el stock actual. Revisá la pieza antes de publicar.",
          );
        }
        if (
          (expected.kind === "quantity" &&
            current.quantity !== expected.quantity) ||
          (expected.kind === "available" && current.quantity <= 0)
        ) {
          return blocked(
            "prepublish-stock-changed",
            "El stock cambió desde la aprobación. Actualizá la pieza y solicitá una nueva revisión.",
          );
        }
      }
    }

    if (required.has("promotion")) {
      if (this.#promotionApprovals === null) {
        return blocked(
          "prepublish-promotion-unavailable",
          "No se puede confirmar la vigencia de la promoción. Revisá y aprobá la pieza nuevamente.",
        );
      }
      const revisionId = isRecord(job.snapshot)
        ? job.snapshot["revisionId"]
        : undefined;
      if (typeof revisionId !== "string") {
        return blocked(
          "prepublish-evidence-missing",
          "La aprobación no conserva la revisión de la promoción. Creá una revisión nueva.",
        );
      }
      try {
        const approval = await this.#promotionApprovals.getPromotionApproval({
          at: this.#now().toISOString(),
          organizationId: job.organizationId,
          publicationRevisionId: revisionId,
        });
        if (approval.kind !== "approved") {
          return blocked(
            "prepublish-promotion-expired",
            "La promoción ya no está vigente o no conserva aprobación. Revisá y aprobá la pieza nuevamente.",
          );
        }
      } catch {
        return blocked(
          "prepublish-promotion-unavailable",
          "No se puede confirmar la vigencia de la promoción. Revisá y aprobá la pieza nuevamente.",
        );
      }
    }
    return null;
  }

  async #publishableConnection(
    organizationId: string,
    targets: readonly PublicationOrderTargetRecord[],
  ): Promise<MetaConnectionRecord | null> {
    try {
      const connections = await this.#connections.list(organizationId);
      return (
        connections.find((connection) =>
          connectionSupportsTargets(connection, targets),
        ) ?? null
      );
    } catch {
      return null;
    }
  }
}
