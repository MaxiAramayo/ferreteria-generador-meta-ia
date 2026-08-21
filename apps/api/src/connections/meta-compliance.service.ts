import { randomUUID } from "node:crypto";

import type { ApiConfiguration } from "@aramayo/configuration/api";
import type {
  MetaDataDeletionCallbackResponse,
  MetaDataDeletionStatusResponse,
  MetaDeauthorizationResponse,
} from "@aramayo/contracts";
import type {
  AuditEventInput,
  MetaComplianceRepository,
  MetaConnectionRecord,
  MetaExternalRemovalReason,
} from "@aramayo/domain";
import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";

import { API_CONFIGURATION } from "../configuration.tokens.ts";
import { META_COMPLIANCE_REPOSITORY } from "../database/database.tokens.ts";
import {
  createMetaDeletionConfirmation,
  MetaSignedRequestError,
  parseMetaDeletionConfirmation,
  parseMetaSignedRequest,
} from "./meta-signed-request.ts";

@Injectable()
export class MetaComplianceService {
  readonly #configuration: ApiConfiguration;
  readonly #repository: MetaComplianceRepository;

  constructor(
    @Inject(API_CONFIGURATION) configuration: ApiConfiguration,
    @Inject(META_COMPLIANCE_REPOSITORY)
    repository: MetaComplianceRepository,
  ) {
    this.#configuration = configuration;
    this.#repository = repository;
  }

  async deleteData(
    signedRequest: string,
    at = new Date(),
  ): Promise<MetaDataDeletionCallbackResponse> {
    const appSecret = this.#appSecret();
    const providerAccountId = this.#providerAccountId(signedRequest, appSecret);
    await this.#removeConnections(providerAccountId, "data-deletion", at);
    const completedAt = at.toISOString();
    const confirmationCode = createMetaDeletionConfirmation(
      completedAt,
      appSecret,
    );
    const statusUrl = new URL(
      "/legal/data-deletion",
      this.#configuration.webOrigin,
    );
    statusUrl.searchParams.set("code", confirmationCode);
    return Object.freeze({
      confirmation_code: confirmationCode,
      url: statusUrl.toString(),
    });
  }

  async deauthorize(
    signedRequest: string,
    at = new Date(),
  ): Promise<MetaDeauthorizationResponse> {
    const appSecret = this.#appSecret();
    const providerAccountId = this.#providerAccountId(signedRequest, appSecret);
    await this.#removeConnections(providerAccountId, "deauthorization", at);
    return Object.freeze({ status: "acknowledged" });
  }

  deletionStatus(confirmationCode: string): MetaDataDeletionStatusResponse {
    try {
      const confirmation = parseMetaDeletionConfirmation(
        confirmationCode,
        this.#appSecret(),
      );
      return Object.freeze({
        completedAt: confirmation.completedAt,
        status: "completed",
      });
    } catch (cause: unknown) {
      if (cause instanceof MetaSignedRequestError) {
        return Object.freeze({ status: "not-found" });
      }
      throw cause;
    }
  }

  async #removeConnections(
    providerAccountId: string,
    reason: MetaExternalRemovalReason,
    at: Date,
  ): Promise<void> {
    const connections =
      await this.#repository.findByProviderAccountId(providerAccountId);
    for (const connection of connections) {
      await this.#repository.removeFromProvider({
        audit: this.#audit(connection, reason, at),
        metaConnectionId: connection.id,
        organizationId: connection.organizationId,
        providerAccountId,
        reason,
        removedAt: at.toISOString(),
      });
    }
  }

  #audit(
    connection: MetaConnectionRecord,
    reason: MetaExternalRemovalReason,
    at: Date,
  ): AuditEventInput {
    return Object.freeze({
      entityId: connection.id,
      entityType: "meta_connection",
      eventId: randomUUID(),
      metadata: Object.freeze({
        initiatedBy: "meta",
        provider: "meta",
        reason,
      }),
      occurredAt: at.toISOString(),
      operation:
        reason === "data-deletion"
          ? "meta.connection.data_deleted"
          : "meta.connection.deauthorized",
      organizationId: connection.organizationId,
      outcome: "success",
    });
  }

  #providerAccountId(signedRequest: string, appSecret: string): string {
    try {
      return parseMetaSignedRequest(signedRequest, appSecret).userId;
    } catch (cause: unknown) {
      if (cause instanceof MetaSignedRequestError) {
        throw new BadRequestException(
          "La solicitud firmada de Meta no es válida.",
        );
      }
      throw cause;
    }
  }

  #appSecret(): string {
    if (!this.#configuration.meta.enabled) {
      throw new ServiceUnavailableException(
        "La integración Meta no está configurada en este entorno.",
      );
    }
    return this.#configuration.meta.credentials.appSecret.reveal();
  }
}
