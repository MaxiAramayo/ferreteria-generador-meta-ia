export interface ContentModerationResult {
  readonly categories: readonly string[];
  readonly model: string;
  readonly requestId: string | null;
  readonly status: "allowed" | "rejected";
}

export interface ContentModerationPort {
  moderateImage(
    input: Readonly<{
      bytes: Uint8Array;
      mimeType: string;
      text: string;
    }>,
  ): Promise<ContentModerationResult>;
  moderateText(text: string): Promise<ContentModerationResult>;
}

export class ContentModerationError extends Error {
  constructor() {
    super("La revisión de seguridad no pudo completarse.");
    this.name = "ContentModerationError";
  }
}
