import type {
  OpenAICredentials,
  OpenAIRuntimePolicy,
} from "@aramayo/configuration";
import type {
  KnowledgeFileAttributes,
  KnowledgeSearchMatch,
  KnowledgeSearchPort,
  KnowledgeVectorStoreFile,
  KnowledgeVectorStorePort,
  UploadKnowledgeFileInput,
} from "@aramayo/domain";
import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  RateLimitError,
  toFile,
} from "openai";

export type OpenAIFileSearchFailureCode =
  "provider-error" | "provider-not-found" | "timeout";

export class OpenAIFileSearchError extends Error {
  readonly code: OpenAIFileSearchFailureCode;
  readonly retryable: boolean;

  constructor(code: OpenAIFileSearchFailureCode, retryable: boolean) {
    super("OpenAI File Search no pudo completar la operación.");
    this.code = code;
    this.name = "OpenAIFileSearchError";
    this.retryable = retryable;
  }
}

function normalizeFile(
  file: Readonly<{
    readonly id: string;
    readonly last_error: { readonly code: string } | null;
    readonly status: "cancelled" | "completed" | "failed" | "in_progress";
  }>,
): KnowledgeVectorStoreFile {
  return Object.freeze({
    fileId: file.id,
    lastErrorCode: file.last_error?.code ?? null,
    status: file.status === "cancelled" ? "failed" : file.status,
  });
}

function normalizeError(cause: unknown): OpenAIFileSearchError {
  if (cause instanceof OpenAIFileSearchError) {
    return cause;
  }
  if (cause instanceof APIConnectionTimeoutError) {
    return new OpenAIFileSearchError("timeout", true);
  }
  if (cause instanceof RateLimitError || cause instanceof APIConnectionError) {
    return new OpenAIFileSearchError("provider-error", true);
  }
  if (cause instanceof APIError) {
    if (cause.status === 404) {
      return new OpenAIFileSearchError("provider-not-found", false);
    }
    return new OpenAIFileSearchError(
      "provider-error",
      cause.status === 408 ||
        cause.status === 409 ||
        (typeof cause.status === "number" && cause.status >= 500),
    );
  }
  return new OpenAIFileSearchError("provider-error", false);
}

function providerAttributes(
  attributes: KnowledgeFileAttributes,
): Record<string, boolean | number | string> {
  return {
    brand: attributes.brand,
    content_hash: attributes.content_hash,
    document_type: attributes.document_type,
    effective_from: attributes.effective_from,
    effective_until: attributes.effective_until,
    location_ids: attributes.location_ids,
    organization_id: attributes.organization_id,
    sensitivity: attributes.sensitivity,
    source_owner: attributes.source_owner,
    status: attributes.status,
    version: attributes.version,
  };
}

export class OfficialOpenAIFileSearchAdapter
  implements KnowledgeSearchPort, KnowledgeVectorStorePort
{
  readonly #client: OpenAI;

  constructor(credentials: OpenAICredentials, policy: OpenAIRuntimePolicy) {
    this.#client = new OpenAI({
      apiKey: credentials.apiKey.reveal(),
      logLevel: "off",
      maxRetries: 0,
      project: credentials.projectId,
      timeout: policy.requestTimeoutMilliseconds,
    });
  }

  async createVectorStore(name: string): Promise<string> {
    try {
      const vectorStore = await this.#client.vectorStores.create({
        description:
          "Conocimiento documental aprobado de Aramayo. No contiene datos comerciales en tiempo real.",
        name,
      });
      return vectorStore.id;
    } catch (cause: unknown) {
      throw normalizeError(cause);
    }
  }

  async uploadFile(input: UploadKnowledgeFileInput): Promise<string> {
    try {
      const uploadedFile = await this.#client.files.create({
        file: await toFile(input.content, input.filename, {
          type: input.mimeType,
        }),
        purpose: "assistants",
      });
      return uploadedFile.id;
    } catch (cause: unknown) {
      throw normalizeError(cause);
    }
  }

  async attachFile(
    vectorStoreId: string,
    fileId: string,
    attributes: KnowledgeFileAttributes,
  ): Promise<KnowledgeVectorStoreFile> {
    try {
      return normalizeFile(
        await this.#client.vectorStores.files.create(vectorStoreId, {
          attributes: providerAttributes(attributes),
          file_id: fileId,
        }),
      );
    } catch (cause: unknown) {
      throw normalizeError(cause);
    }
  }

  async getFile(
    vectorStoreId: string,
    fileId: string,
  ): Promise<KnowledgeVectorStoreFile> {
    try {
      return normalizeFile(
        await this.#client.vectorStores.files.retrieve(fileId, {
          vector_store_id: vectorStoreId,
        }),
      );
    } catch (cause: unknown) {
      throw normalizeError(cause);
    }
  }

  async updateFileAttributes(
    vectorStoreId: string,
    fileId: string,
    attributes: KnowledgeFileAttributes,
  ): Promise<void> {
    try {
      await this.#client.vectorStores.files.update(fileId, {
        attributes: providerAttributes(attributes),
        vector_store_id: vectorStoreId,
      });
    } catch (cause: unknown) {
      throw normalizeError(cause);
    }
  }

  async detachFile(vectorStoreId: string, fileId: string): Promise<void> {
    try {
      await this.#client.vectorStores.files.delete(fileId, {
        vector_store_id: vectorStoreId,
      });
    } catch (cause: unknown) {
      const normalized = normalizeError(cause);
      if (normalized.code !== "provider-not-found") {
        throw normalized;
      }
    }
  }

  async search(
    input: Parameters<KnowledgeSearchPort["search"]>[0],
  ): Promise<readonly KnowledgeSearchMatch[]> {
    try {
      const contentHashFilter =
        input.contentHashes.length === 1
          ? {
              key: "content_hash",
              type: "eq" as const,
              value: input.contentHashes[0] ?? "",
            }
          : {
              key: "content_hash",
              type: "in" as const,
              value: [...input.contentHashes],
            };
      const result = await this.#client.vectorStores.search(
        input.vectorStoreId,
        {
          filters: {
            filters: [
              {
                key: "organization_id",
                type: "eq",
                value: input.organizationId,
              },
              {
                key: "status",
                type: "eq",
                value: "approved",
              },
              contentHashFilter,
            ],
            type: "and",
          },
          max_num_results: input.maximumResults,
          query: input.query,
          rewrite_query: false,
        },
      );
      return Object.freeze(
        result.data.map((entry) =>
          Object.freeze({
            attributes: entry.attributes,
            content: Object.freeze(
              entry.content.map((content) => content.text),
            ),
            fileId: entry.file_id,
            filename: entry.filename,
            score: entry.score,
          }),
        ),
      );
    } catch (cause: unknown) {
      throw normalizeError(cause);
    }
  }
}
