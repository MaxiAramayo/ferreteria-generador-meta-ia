export type MediaLifecycleErrorCode =
  | "asset-in-use"
  | "asset-retained"
  | "idempotency-conflict"
  | "invalid-state"
  | "not-found"
  | "provider-contract-invalid"
  | "provider-disabled"
  | "provider-failed"
  | "state-conflict";

export class MediaLifecycleError extends Error {
  readonly code: MediaLifecycleErrorCode;
  readonly retryable: boolean;

  constructor(
    code: MediaLifecycleErrorCode,
    message: string,
    retryable: boolean,
  ) {
    super(message);
    this.code = code;
    this.name = "MediaLifecycleError";
    this.retryable = retryable;
  }
}
