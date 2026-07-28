import type { DatabaseClient } from "@aramayo/database";
import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common";

import { DATABASE_CLIENT } from "./database.tokens.ts";

@Injectable()
export class DatabaseLifecycleService implements OnApplicationShutdown {
  readonly #database: DatabaseClient;

  constructor(
    @Inject(DATABASE_CLIENT)
    database: DatabaseClient,
  ) {
    this.#database = database;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.#database.$disconnect();
  }
}
