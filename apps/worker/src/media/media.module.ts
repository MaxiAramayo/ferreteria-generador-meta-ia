import type { WorkerConfiguration } from "@aramayo/configuration/worker";
import type {
  MediaAssetRepository,
  MediaInspector,
  MediaStorage,
} from "@aramayo/domain";
import { Module, type DynamicModule } from "@nestjs/common";

import {
  CloudinaryMediaStorage,
  DisabledMediaStorage,
} from "./cloudinary-media-storage.ts";
import { SharpMediaInspector } from "./media-inspector.ts";
import { MediaLifecycleService } from "./media-lifecycle.service.ts";
import { MediaRetentionSweepService } from "./media-retention-sweep.service.ts";
import {
  MEDIA_ASSET_REPOSITORY,
  MEDIA_INSPECTOR,
  MEDIA_STORAGE,
} from "./media.tokens.ts";

@Module({})
export class MediaModule {
  static forConfiguration(
    cloudinary: WorkerConfiguration["cloudinary"],
  ): DynamicModule {
    return {
      exports: [MediaLifecycleService],
      global: true,
      module: MediaModule,
      providers: [
        {
          provide: MEDIA_INSPECTOR,
          useFactory: (): MediaInspector => new SharpMediaInspector(),
        },
        {
          provide: MEDIA_STORAGE,
          useFactory: (): MediaStorage =>
            cloudinary.enabled
              ? new CloudinaryMediaStorage(cloudinary.credentials)
              : new DisabledMediaStorage(),
        },
        {
          inject: [MEDIA_ASSET_REPOSITORY, MEDIA_INSPECTOR, MEDIA_STORAGE],
          provide: MediaLifecycleService,
          useFactory: (
            repository: MediaAssetRepository,
            inspector: MediaInspector,
            storage: MediaStorage,
          ): MediaLifecycleService =>
            new MediaLifecycleService(repository, inspector, storage),
        },
        {
          inject: [MEDIA_ASSET_REPOSITORY, MediaLifecycleService],
          provide: MediaRetentionSweepService,
          useFactory: (
            repository: MediaAssetRepository,
            lifecycle: MediaLifecycleService,
          ): MediaRetentionSweepService =>
            new MediaRetentionSweepService(repository, lifecycle),
        },
      ],
    };
  }
}
