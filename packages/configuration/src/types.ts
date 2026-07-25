export type ApplicationEnvironment =
  "development" | "production" | "staging" | "test";

export type RawEnvironment = Readonly<Record<string, string | undefined>>;

export interface DisabledIntegration {
  readonly enabled: false;
}

export interface EnabledIntegration<Credentials> {
  readonly credentials: Credentials;
  readonly enabled: true;
}

export type OptionalIntegration<Credentials> =
  DisabledIntegration | EnabledIntegration<Credentials>;

export class SecretValue {
  readonly #plainText: string;

  constructor(plainText: string) {
    this.#plainText = plainText;
    Object.freeze(this);
  }

  reveal(): string {
    return this.#plainText;
  }

  toJSON(): string {
    return "[REDACTED]";
  }

  toString(): string {
    return "[REDACTED]";
  }
}

export interface EncryptionKey {
  readonly material: SecretValue;
  readonly version: string;
}

export interface EncryptionKeyRing {
  readonly activeVersion: string;
  readonly keys: readonly EncryptionKey[];
}

export interface CommonConfiguration {
  readonly environment: ApplicationEnvironment;
  readonly timeZone: string;
}
