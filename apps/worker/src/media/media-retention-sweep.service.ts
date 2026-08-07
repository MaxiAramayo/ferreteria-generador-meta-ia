import type { MediaAssetRepository } from "@aramayo/domain";
import {
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import type { MediaLifecycleService } from "./media-lifecycle.service.ts";

const sweepIntervalMilliseconds = 60 * 60 * 1000;
const sweepBatchSize = 50;

export class MediaRetentionSweepService
  implements OnModuleInit, OnModuleDestroy
{
  readonly #logger = new Logger(MediaRetentionSweepService.name);
  readonly #media: MediaLifecycleService;
  readonly #repository: MediaAssetRepository;
  #running = false;
  #timer: ReturnType<typeof setInterval> | null = null;

  constructor(repository: MediaAssetRepository, media: MediaLifecycleService) {
    this.#media = media;
    this.#repository = repository;
  }

  onModuleInit(): void {
    this.#timer = setInterval(
      () => void this.sweep(),
      sweepIntervalMilliseconds,
    );
    this.#timer.unref();
  }

  onModuleDestroy(): void {
    if (this.#timer !== null) clearInterval(this.#timer);
  }

  async sweep(at = new Date()): Promise<number> {
    if (this.#running) return 0;
    this.#running = true;
    let deleted = 0;
    try {
      const candidates = await this.#repository.findExpiredUnreferenced({
        expiredBefore: at.toISOString(),
        limit: sweepBatchSize,
      });
      for (const candidate of candidates) {
        try {
          await this.#media.delete({
            mediaAssetId: candidate.id,
            organizationId: candidate.organizationId,
            requestedAt: at.toISOString(),
          });
          deleted += 1;
          await this.#repository.auditRetention({
            at: at.toISOString(),
            mediaAssetId: candidate.id,
            organizationId: candidate.organizationId,
            outcome: "deleted",
            reason: "retention-expired-unreferenced",
          });
        } catch (cause: unknown) {
          await this.#repository.auditRetention({
            at: at.toISOString(),
            mediaAssetId: candidate.id,
            organizationId: candidate.organizationId,
            outcome: "failed",
            reason:
              cause instanceof Error
                ? cause.name.slice(0, 80)
                : "unknown-error",
          });
          this.#logger.warn(`media.retention.failed asset=${candidate.id}`);
        }
      }
      return deleted;
    } finally {
      this.#running = false;
    }
  }
}
