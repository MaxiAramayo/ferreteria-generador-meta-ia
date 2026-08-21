import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const signedRequestAlgorithm = "HMAC-SHA256";
const deletionConfirmationPurpose = "aramayo-meta-data-deletion";

export class MetaSignedRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetaSignedRequestError";
  }
}

interface MetaSignedRequestPayload {
  readonly algorithm: typeof signedRequestAlgorithm;
  readonly userId: string;
}

export interface MetaDeletionConfirmation {
  readonly completedAt: string;
}

function parseJsonObject(
  encodedPayload: string,
): Readonly<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
  } catch {
    throw new MetaSignedRequestError("El payload firmado no es JSON válido.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new MetaSignedRequestError("El payload firmado no es un objeto.");
  }
  return parsed as Readonly<Record<string, unknown>>;
}

function signatureFor(encodedPayload: string, appSecret: string): Buffer {
  return createHmac("sha256", appSecret).update(encodedPayload).digest();
}

function verifySignature(
  encodedSignature: string,
  encodedPayload: string,
  appSecret: string,
): void {
  let receivedSignature: Buffer;
  try {
    receivedSignature = Buffer.from(encodedSignature, "base64url");
  } catch {
    throw new MetaSignedRequestError("La firma no tiene un formato válido.");
  }
  const expectedSignature = signatureFor(encodedPayload, appSecret);
  if (
    receivedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(receivedSignature, expectedSignature)
  ) {
    throw new MetaSignedRequestError("La firma de Meta no es válida.");
  }
}

function splitSignedValue(value: string): readonly [string, string] {
  const parts = value.split(".");
  const encodedSignature = parts[0];
  const encodedPayload = parts[1];
  if (
    parts.length !== 2 ||
    encodedSignature === undefined ||
    encodedSignature.length === 0 ||
    encodedPayload === undefined ||
    encodedPayload.length === 0
  ) {
    throw new MetaSignedRequestError(
      "El valor firmado no tiene dos segmentos.",
    );
  }
  return [encodedSignature, encodedPayload];
}

export function parseMetaSignedRequest(
  signedRequest: string,
  appSecret: string,
): MetaSignedRequestPayload {
  const [encodedSignature, encodedPayload] = splitSignedValue(signedRequest);
  verifySignature(encodedSignature, encodedPayload, appSecret);
  const payload = parseJsonObject(encodedPayload);
  if (payload.algorithm !== signedRequestAlgorithm) {
    throw new MetaSignedRequestError(
      "El algoritmo de la solicitud firmada no está permitido.",
    );
  }
  if (
    typeof payload.user_id !== "string" ||
    payload.user_id.length === 0 ||
    payload.user_id.length > 160
  ) {
    throw new MetaSignedRequestError(
      "La solicitud firmada no contiene una cuenta válida.",
    );
  }
  return Object.freeze({
    algorithm: signedRequestAlgorithm,
    userId: payload.user_id,
  });
}

export function createMetaDeletionConfirmation(
  completedAt: string,
  appSecret: string,
): string {
  const encodedPayload = Buffer.from(
    JSON.stringify({
      completed_at: completedAt,
      nonce: randomBytes(16).toString("base64url"),
      purpose: deletionConfirmationPurpose,
      version: 1,
    }),
  ).toString("base64url");
  return `${signatureFor(encodedPayload, appSecret).toString("base64url")}.${encodedPayload}`;
}

export function parseMetaDeletionConfirmation(
  confirmationCode: string,
  appSecret: string,
): MetaDeletionConfirmation {
  const [encodedSignature, encodedPayload] = splitSignedValue(confirmationCode);
  verifySignature(encodedSignature, encodedPayload, appSecret);
  const payload = parseJsonObject(encodedPayload);
  if (
    payload.purpose !== deletionConfirmationPurpose ||
    payload.version !== 1 ||
    typeof payload.completed_at !== "string" ||
    !Number.isFinite(Date.parse(payload.completed_at))
  ) {
    throw new MetaSignedRequestError(
      "El código de confirmación no tiene un payload válido.",
    );
  }
  return Object.freeze({ completedAt: payload.completed_at });
}
