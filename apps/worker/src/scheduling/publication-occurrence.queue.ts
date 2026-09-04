import {
  publicationOccurrenceJobName,
  publicationOccurrenceQueueName,
  type PublicationOccurrenceDispatchJob,
} from "@aramayo/domain";
import { Queue, createNodeRedisClient } from "bullmq";
import { createClient } from "redis";

export interface PublicationOccurrenceQueue {
  enqueue(job: PublicationOccurrenceDispatchJob): Promise<void>;
}

export interface ManagedPublicationOccurrenceQueue extends PublicationOccurrenceQueue {
  shutdown(): Promise<void>;
}

function publicationOccurrenceJobId(occurrenceId: string): string {
  // BullMQ no admite `:` en jobId. El prefijo evita además una identidad
  // puramente numérica y deja claro qué agregado se está deduplicando.
  return `occurrence-${occurrenceId}`;
}

/** Transporte descartable: la identidad y el estado siguen en PostgreSQL. */
export class BullMqPublicationOccurrenceQueue implements ManagedPublicationOccurrenceQueue {
  readonly #client: ReturnType<typeof createClient>;
  readonly #queue: Queue<
    PublicationOccurrenceDispatchJob,
    void,
    typeof publicationOccurrenceJobName
  >;

  constructor(
    redisUrl: string,
    queueName: string = publicationOccurrenceQueueName,
  ) {
    this.#client = createClient({ url: redisUrl });
    // node-redis emite `error`; sin listener, EventEmitter termina el proceso.
    // El dispatcher persiste y registra el fallo de enqueue por su propio canal.
    this.#client.on("error", () => undefined);
    this.#queue = new Queue<
      PublicationOccurrenceDispatchJob,
      void,
      typeof publicationOccurrenceJobName
    >(queueName, {
      connection: createNodeRedisClient(this.#client),
    });
    this.#queue.on("error", () => undefined);
  }

  async enqueue(job: PublicationOccurrenceDispatchJob): Promise<void> {
    await this.#queue.add(publicationOccurrenceJobName, job, {
      attempts: 1,
      jobId: publicationOccurrenceJobId(job.occurrenceId),
      removeOnComplete: false,
      removeOnFail: false,
    });
  }

  shutdown(): Promise<void> {
    // Es un productor sin trabajo activo que drenar. `Queue.close()` y
    // `Queue.disconnect()` esperan el handshake incluso cuando Redis está
    // caído y pueden bloquear SIGTERM. Destruir el cliente poseído corta tanto
    // una conexión lista como una que todavía está reconectando; la intención
    // no se pierde porque ya quedó en PostgreSQL.
    this.#client.destroy();
    return Promise.resolve();
  }
}

export { publicationOccurrenceJobId };
