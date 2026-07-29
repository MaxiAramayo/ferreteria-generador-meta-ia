import type { CloudinaryCredentials } from "@aramayo/configuration";
import type {
  MediaDeliveryVariant,
  MediaStorage,
  StoredMediaObject,
  StoreMediaInput,
  SupportedMediaMimeType,
} from "@aramayo/domain";
import { v2 as cloudinary } from "cloudinary";

import { MediaLifecycleError } from "./media.errors.ts";

export interface CloudinaryGateway {
  buildUrl(
    publicId: string,
    options: Readonly<Record<string, unknown>>,
  ): string;
  destroy(publicId: string): Promise<unknown>;
  upload(bytes: Uint8Array, publicId: string): Promise<unknown>;
}

class OfficialCloudinaryGateway implements CloudinaryGateway {
  constructor(credentials: CloudinaryCredentials) {
    cloudinary.config({
      api_key: credentials.apiKey.reveal(),
      api_secret: credentials.apiSecret.reveal(),
      cloud_name: credentials.cloudName,
      secure: true,
    });
  }

  buildUrl(
    publicId: string,
    options: Readonly<Record<string, unknown>>,
  ): string {
    return cloudinary.url(publicId, options);
  }

  destroy(publicId: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      void cloudinary.uploader.destroy(
        publicId,
        {
          invalidate: true,
          resource_type: "image",
          type: "upload",
        },
        (cause: unknown, result: unknown) => {
          if (cause !== undefined && cause !== null) {
            reject(
              cause instanceof Error ? cause : new Error("Delete failed."),
            );
            return;
          }
          resolve(result);
        },
      );
    });
  }

  upload(bytes: Uint8Array, publicId: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          overwrite: false,
          public_id: publicId,
          resource_type: "image",
          type: "upload",
          unique_filename: false,
          use_filename: false,
        },
        (cause, result) => {
          if (cause !== undefined) {
            reject(new Error("Cloudinary upload failed."));
            return;
          }
          resolve(result);
        },
      );
      stream.once("error", reject);
      stream.end(Buffer.from(bytes));
    });
  }
}

function objectRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

function positiveInteger(
  record: Readonly<Record<string, unknown>>,
  field: string,
): number | null {
  const entry = record[field];
  return typeof entry === "number" && Number.isSafeInteger(entry) && entry > 0
    ? entry
    : null;
}

function responseMimeType(format: unknown): SupportedMediaMimeType | null {
  switch (format) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    default:
      return null;
  }
}

function safeFolder(folder: string): string {
  return folder.replace(/^\/+|\/+$/gu, "");
}

export class CloudinaryMediaStorage implements MediaStorage {
  readonly #cloudName: string;
  readonly #folder: string;
  readonly #gateway: CloudinaryGateway;

  constructor(
    credentials: CloudinaryCredentials,
    gateway: CloudinaryGateway = new OfficialCloudinaryGateway(credentials),
  ) {
    this.#cloudName = credentials.cloudName;
    this.#folder = safeFolder(credentials.folder);
    this.#gateway = gateway;
  }

  async store(input: StoreMediaInput): Promise<StoredMediaObject> {
    const expectedPublicId = `${this.#folder}/${input.organizationId}/${input.mediaAssetId}`;
    let rawResponse: unknown;
    try {
      rawResponse = await this.#gateway.upload(input.bytes, expectedPublicId);
    } catch {
      throw new MediaLifecycleError(
        "provider-failed",
        "Cloudinary no pudo almacenar la imagen.",
        true,
      );
    }
    const response = objectRecord(rawResponse);
    const byteSize =
      response === null ? null : positiveInteger(response, "bytes");
    const height =
      response === null ? null : positiveInteger(response, "height");
    const storageVersion =
      response === null ? null : positiveInteger(response, "version");
    const width = response === null ? null : positiveInteger(response, "width");
    const mimeType =
      response === null ? null : responseMimeType(response["format"]);
    const secureUrl =
      response !== null && typeof response["secure_url"] === "string"
        ? response["secure_url"]
        : null;
    const storageKey =
      response !== null && typeof response["public_id"] === "string"
        ? response["public_id"]
        : null;
    if (
      byteSize === null ||
      height === null ||
      storageVersion === null ||
      width === null ||
      mimeType === null ||
      secureUrl === null ||
      storageKey !== expectedPublicId ||
      !this.#isOwnedSecureUrl(secureUrl)
    ) {
      throw new MediaLifecycleError(
        "provider-contract-invalid",
        "Cloudinary devolvió metadatos que no se pueden confirmar.",
        true,
      );
    }
    return Object.freeze({
      byteSize,
      height,
      mimeType,
      secureUrl,
      storageKey,
      storageVersion,
      width,
    });
  }

  async delete(storageKey: string): Promise<"deleted" | "not-found"> {
    let rawResponse: unknown;
    try {
      rawResponse = await this.#gateway.destroy(storageKey);
    } catch {
      throw new MediaLifecycleError(
        "provider-failed",
        "Cloudinary no confirmó la eliminación.",
        true,
      );
    }
    const result = objectRecord(rawResponse)?.["result"];
    if (result === "ok") {
      return "deleted";
    }
    if (result === "not found") {
      return "not-found";
    }
    throw new MediaLifecycleError(
      "provider-contract-invalid",
      "Cloudinary devolvió un resultado de eliminación desconocido.",
      true,
    );
  }

  deliveryUrl(
    object: Readonly<{
      mimeType: SupportedMediaMimeType;
      storageKey: string;
      storageVersion: number;
    }>,
    variant: MediaDeliveryVariant,
  ): string {
    const baseOptions: Readonly<Record<string, unknown>> = {
      secure: true,
      version: object.storageVersion,
    };
    switch (variant) {
      case "original":
        return this.#gateway.buildUrl(object.storageKey, {
          ...baseOptions,
          format: object.mimeType === "image/png" ? "png" : "jpg",
        });
      case "editor-preview":
        return this.#gateway.buildUrl(object.storageKey, {
          ...baseOptions,
          crop: "limit",
          fetch_format: "auto",
          height: 1600,
          quality: "auto",
          width: 1600,
        });
      case "meta-feed":
        return this.#gateway.buildUrl(object.storageKey, {
          ...baseOptions,
          crop: "limit",
          fetch_format: "jpg",
          height: 1440,
          quality: "auto:good",
          width: 1440,
        });
    }
  }

  #isOwnedSecureUrl(secureUrl: string): boolean {
    try {
      const parsedUrl = new URL(secureUrl);
      return (
        parsedUrl.protocol === "https:" &&
        parsedUrl.hostname === "res.cloudinary.com" &&
        parsedUrl.pathname.startsWith(`/${this.#cloudName}/image/upload/`)
      );
    } catch {
      return false;
    }
  }
}

export class DisabledMediaStorage implements MediaStorage {
  delete(): Promise<"deleted" | "not-found"> {
    return Promise.reject(
      new MediaLifecycleError(
        "provider-disabled",
        "Cloudinary no está configurado en este ambiente.",
        false,
      ),
    );
  }

  deliveryUrl(): string {
    throw new MediaLifecycleError(
      "provider-disabled",
      "Cloudinary no está configurado en este ambiente.",
      false,
    );
  }

  store(): Promise<StoredMediaObject> {
    return Promise.reject(
      new MediaLifecycleError(
        "provider-disabled",
        "Cloudinary no está configurado en este ambiente.",
        false,
      ),
    );
  }
}
