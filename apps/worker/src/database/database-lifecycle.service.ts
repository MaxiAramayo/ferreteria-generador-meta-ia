import type { DatabaseClient } from "@aramayo/database";
import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common";

import { WORKER_DATABASE_CLIENT } from "./database.tokens.ts";

@Injectable()
export class DatabaseLifecycleService implements OnApplicationShutdown {
  readonly #database: DatabaseClient;

  constructor(@Inject(WORKER_DATABASE_CLIENT) database: DatabaseClient) {
    this.#database = database;
  }

  onApplicationShutdown(): Promise<void> {
    return this.#database.$disconnect();
  }
}
