import type { OpenAICredentials } from "@aramayo/configuration";
import {
  ContentModerationError,
  generationModerationModel,
  type ContentModerationPort,
  type ContentModerationResult,
} from "@aramayo/domain";
import OpenAI from "openai";

export class OpenAIContentModerationGateway implements ContentModerationPort {
  readonly #client: OpenAI;

  constructor(credentials: OpenAICredentials, timeoutMilliseconds = 30_000) {
    this.#client = new OpenAI({
      apiKey: credentials.apiKey.reveal(),
      maxRetries: 0,
      timeout: timeoutMilliseconds,
    });
  }

  moderateText(text: string): Promise<ContentModerationResult> {
    return this.#moderate(text);
  }

  moderateImage(
    input: Readonly<{
      bytes: Uint8Array;
      mimeType: string;
      text: string;
    }>,
  ): Promise<ContentModerationResult> {
    return this.#moderate([
      { text: input.text, type: "text" as const },
      {
        image_url: {
          url: `data:${input.mimeType};base64,${Buffer.from(input.bytes).toString("base64")}`,
        },
        type: "image_url" as const,
      },
    ]);
  }

  async #moderate(
    input:
      | string
      | readonly (
          | Readonly<{ text: string; type: "text" }>
          | Readonly<{
              image_url: Readonly<{ url: string }>;
              type: "image_url";
            }>
        )[],
  ): Promise<ContentModerationResult> {
    try {
      const request =
        typeof input === "string"
          ? this.#client.moderations.create({
              input,
              model: generationModerationModel,
            })
          : this.#client.moderations.create({
              input: input.map((entry) =>
                entry.type === "text"
                  ? { text: entry.text, type: "text" as const }
                  : {
                      image_url: { url: entry.image_url.url },
                      type: "image_url" as const,
                    },
              ),
              model: generationModerationModel,
            });
      const { data, request_id: requestId } = await request.withResponse();
      const result = data.results[0];
      if (result === undefined) throw new ContentModerationError();
      const categories = Object.entries(result.categories)
        .filter(([, flagged]) => flagged)
        .map(([category]) => category)
        .sort();
      return Object.freeze({
        categories: Object.freeze(categories),
        model: data.model,
        requestId: requestId ?? null,
        status: result.flagged ? ("rejected" as const) : ("allowed" as const),
      });
    } catch {
      throw new ContentModerationError();
    }
  }
}
