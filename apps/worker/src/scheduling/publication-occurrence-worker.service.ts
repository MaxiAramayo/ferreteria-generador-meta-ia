import { randomUUID } from "node:crypto";

import {
  publicationOccurrenceJobName,
  publicationOccurrenceQueueName,
  type PublicationOccurrenceDispatchJob,
} from "@aramayo/domain";
import {
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { DelayedError, Worker, createNodeRedisClient, type Job } from "bullmq";
import { createClient } from "redis";

import {
  PublicationOccurrenceExecutionError,
  type PublicationOccurrenceExecutionResult,
  type PublicationOccurrenceExecutionService,
} from "./publication-occurrence-execution.service.ts";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function requiredUuid(
  candidate: unknown,
  field: keyof PublicationOccurrenceDispatchJob,
): string {
  if (typeof candidate !== "string" || !uuidPattern.test(candidate)) {
    throw new TypeError(`El job de programación no conserva ${field}.`);
  }
  return candidate;
}

export function parsePublicationOccurrenceJob(
  candidate: unknown,
): PublicationOccurrenceDispatchJob {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    Array.isArray(candidate)
  ) {
    throw new TypeError("El job de programación no tiene un payload válido.");
  }
  const payload = candidate as Readonly<Record<string, unknown>>;
  return Object.freeze({
    dispatchEventId: requiredUuid(
      payload["dispatchEventId"],
      "dispatchEventId",
    ),
    occurrenceId: requiredUuid(payload["occurrenceId"], "occurrenceId"),
    organizationId: requiredUuid(payload["organizationId"], "organizationId"),
    scheduleId: requiredUuid(payload["scheduleId"], "scheduleId"),
  });
}

/** Consumidor BullMQ; el lock de Bull no reemplaza la lease de negocio. */
export class PublicationOccurrenceWorkerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  readonly #concurrency: number;
  readonly #executor: PublicationOccurrenceExecutionService;
  readonly #logger = new Logger("worker");
  readonly #processId = randomUUID();
  readonly #queueName: string;
  readonly #redisUrl: string;
  #destroyClient: (() => void) | undefined;
  #worker:
    | Worker<
        PublicationOccurrenceDispatchJob,
        void,
        typeof publicationOccurrenceJobName
      >
    | undefined;

  constructor(
    redisUrl: string,
    concurrency: number,
    executor: PublicationOccurrenceExecutionService,
    queueName: string = publicationOccurrenceQueueName,
  ) {
    this.#concurrency = concurrency;
    this.#executor = executor;
    this.#queueName = queueName;
    this.#redisUrl = redisUrl;
  }

  onApplicationBootstrap(): void {
    const client = createClient({ url: this.#redisUrl });
    client.on("error", () => undefined);
    const worker = new Worker<
      PublicationOccurrenceDispatchJob,
      void,
      typeof publicationOccurrenceJobName
    >(
      this.#queueName,
      async (job: Job<PublicationOccurrenceDispatchJob>): Promise<void> => {
        if (job.name !== publicationOccurrenceJobName) {
          throw new TypeError("El nombre del job de programación no coincide.");
        }
        const payload = parsePublicationOccurrenceJob(job.data);
        let result: PublicationOccurrenceExecutionResult;
        try {
          result = await this.#executor.execute(
            payload,
            `${this.#processId}:${String(job.id)}`,
          );
        } catch (error: unknown) {
          if (
            error instanceof PublicationOccurrenceExecutionError &&
            error.code === "busy" &&
            error.retryAt !== undefined
          ) {
            const retryAt = Date.parse(error.retryAt);
            if (Number.isFinite(retryAt) && retryAt > Date.now()) {
              // No quema intentos mientras otra lease siga vigente. BullMQ
              // conserva el mismo job y lo despierta cuando PostgreSQL permite
              // volver a disputar ownership.
              await job.moveToDelayed(retryAt, job.token);
              throw new DelayedError();
            }
          }
          throw error;
        }
        if (result.status !== "ignored") {
          this.#logger.log(
            `scheduling.execution status=${result.status} occurrenceId=${payload.occurrenceId} orderId=${result.orderId}`,
          );
        }
      },
      {
        concurrency: this.#concurrency,
        connection: createNodeRedisClient(client),
      },
    );
    worker.on("error", () => undefined);
    worker.on("failed", (job, error) => {
      this.#logger.warn(
        `scheduling.execution.failed jobId=${job?.id ?? "unknown"} reason=${error.name}`,
      );
    });
    this.#destroyClient = (): void => {
      client.destroy();
    };
    this.#worker = worker;
  }

  async onApplicationShutdown(): Promise<void> {
    const worker = this.#worker;
    const destroyClient = this.#destroyClient;
    this.#worker = undefined;
    this.#destroyClient = undefined;
    if (worker !== undefined) {
      const closing = worker.close(true);
      destroyClient?.();
      await closing.catch(() => undefined);
      return;
    }
    destroyClient?.();
  }
}
