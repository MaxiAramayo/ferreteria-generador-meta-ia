/**
 * Smoke de publicación real en los activos de Meta.
 *
 * A diferencia de los demás smokes, este **escribe**: deja publicaciones
 * visibles en la cuenta de Instagram y en la Page de Aramayo. `ADR-019` prohíbe
 * que un smoke escriba en los activos existentes salvo autorización posterior y
 * concreta con activo, media, copy, destino y efecto esperado. Por eso no
 * alcanza con ejecutarlo: hay que declarar esa autorización en la línea de
 * comandos, y sin ella el proceso termina sin haber llamado a Meta.
 *
 * Lo que ejercita es el adaptador contra el proveedor real, que es la
 * verificación que les falta a `P5-T03` y `P5-T04`. Lo que **no** ejercita es el
 * producto: no hay brief ni snapshot aprobado, ni orquestación multidestino, ni
 * estado de publicación. Eso es `P5-T05` y este smoke no lo reemplaza.
 *
 * El diario vive en un archivo y no en memoria a propósito. Repetir el comando
 * tiene que encontrar lo que dejó la corrida anterior y no publicar de nuevo;
 * con un diario que muere con el proceso, la segunda corrida duplicaría en una
 * cuenta real.
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";

import {
  parseCloudinaryIntegration,
  parseEncryptionKeyRing,
  parseMetaIntegration,
} from "@aramayo/configuration";
import {
  createDatabaseClient,
  PrismaMetaConnectionRepository,
} from "@aramayo/database";
import {
  metaConnectionCanPublish,
  type MetaConnectionRecord,
} from "@aramayo/domain";
import sharp from "sharp";

import { CloudinaryMediaStorage } from "../media/cloudinary-media-storage.ts";
import { deterministicMediaId } from "../media/deterministic-media-id.ts";
import { FacebookGraphPublishingAdapter } from "./facebook-graph.adapter.ts";
import { FacebookPublisher } from "./facebook-publisher.service.ts";
import { FileMetaPublishingAttemptJournal } from "./file-publishing-attempts.ts";
import {
  HttpPublicMediaProbe,
  InstagramGraphAdapter,
} from "./instagram-graph.adapter.ts";
import { InstagramPublisher } from "./instagram-publisher.service.ts";
import { TokenDecipher } from "./token-decipher.ts";

/**
 * Frase exacta que declara la autorización. No es una contraseña: es una
 * afirmación difícil de tipear por accidente y fácil de encontrar en el
 * historial de comandos cuando haya que reconstruir quién autorizó qué.
 */
const authorizationPhrase = "publicar-en-activos-reales-autorizado";

const stagingFolderPattern = /(?:^|\/)staging(?:\/|$)/u;

/** Caja a la que la variante `meta-feed` limita el lado largo de la pieza. */
const deliveryLongestSide = 1440;

interface SmokeArguments {
  readonly copy: string;
  readonly imagePath: string;
  readonly runId: string;
  readonly targets: readonly ("facebook_page" | "instagram_feed")[];
}

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .slice(2)
    .find((entry) => entry.startsWith(prefix))
    ?.slice(prefix.length);
}

function parseArguments(): SmokeArguments {
  if (argument("autorizacion") !== authorizationPhrase) {
    throw new Error(
      `Este smoke publica en los activos reales de Aramayo. Requiere --autorizacion=${authorizationPhrase} conforme a ADR-019.`,
    );
  }
  const imagePath = argument("imagen");
  const copy = argument("copy");
  const runId = argument("corrida");
  const destinations = argument("destinos");
  if (
    imagePath === undefined ||
    copy === undefined ||
    runId === undefined ||
    destinations === undefined
  ) {
    throw new Error(
      "Faltan argumentos: --imagen, --copy, --corrida y --destinos son obligatorios.",
    );
  }
  const targets = destinations.split(",").map((entry) => entry.trim());
  for (const target of targets) {
    if (target !== "facebook_page" && target !== "instagram_feed") {
      throw new Error(`Destino no soportado por este smoke: ${target}.`);
    }
  }
  if (targets.length === 0) {
    throw new Error("Hay que declarar al menos un destino.");
  }
  return Object.freeze({
    copy,
    imagePath,
    runId,
    targets: Object.freeze([
      ...new Set(targets as ("facebook_page" | "instagram_feed")[]),
    ]),
  });
}

function requireStaging(): void {
  if (process.env["NODE_ENV"] !== "staging") {
    throw new Error("El smoke sólo puede ejecutarse con NODE_ENV=staging.");
  }
}

/**
 * Medidas que va a entregar la URL.
 *
 * La variante `meta-feed` recorta con `limit`: nunca agranda, y sólo achica lo
 * que excede la caja, conservando la proporción. Validar las medidas del activo
 * en vez de éstas dejaría pasar un tamaño que nunca se envía.
 */
function deliveredSize(
  width: number,
  height: number,
): Readonly<{ height: number; width: number }> {
  const longest = Math.max(width, height);
  if (longest <= deliveryLongestSide) {
    return Object.freeze({ height, width });
  }
  const factor = deliveryLongestSide / longest;
  return Object.freeze({
    height: Math.round(height * factor),
    width: Math.round(width * factor),
  });
}

async function publishableConnection(
  repository: PrismaMetaConnectionRepository,
  organizationId: string,
): Promise<MetaConnectionRecord> {
  const connections = await repository.list(organizationId);
  const connection = connections.find(metaConnectionCanPublish);
  if (connection === undefined) {
    throw new Error(
      "La organización no tiene una conexión Meta habilitada para publicar.",
    );
  }
  return connection;
}

async function runPublishSmoke(): Promise<void> {
  requireStaging();
  const options = parseArguments();

  const cloudinary = parseCloudinaryIntegration(process.env, "publish-smoke");
  if (!cloudinary.enabled) {
    throw new Error("El smoke requiere las cuatro variables de Cloudinary.");
  }
  if (!stagingFolderPattern.test(cloudinary.credentials.folder)) {
    throw new Error(
      "CLOUDINARY_FOLDER debe identificar explícitamente un directorio staging.",
    );
  }
  const meta = parseMetaIntegration(process.env, "publish-smoke", "staging");
  if (!meta.enabled) {
    throw new Error("El smoke requiere el grupo completo de variables Meta.");
  }
  const decipher = new TokenDecipher(
    parseEncryptionKeyRing(process.env, "publish-smoke"),
  );

  const databaseUrl = process.env["DATABASE_URL"];
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error("El smoke requiere DATABASE_URL.");
  }
  const database = createDatabaseClient(databaseUrl);
  const storage = new CloudinaryMediaStorage(cloudinary.credentials);
  const journal = new FileMetaPublishingAttemptJournal(
    process.env["PUBLISH_SMOKE_JOURNAL"] ?? "/tmp/publish-smoke-journal.json",
  );

  try {
    const organization = await database.organization.findFirst({
      orderBy: { createdAt: "asc" },
      select: { displayName: true, id: true },
    });
    if (organization === null) {
      throw new Error("La base de staging no tiene organizaciones.");
    }
    const repository = new PrismaMetaConnectionRepository(database);
    const connection = await publishableConnection(repository, organization.id);
    const pageSecret = await repository.findAssetSecret(
      organization.id,
      connection.id,
      "page",
    );
    if (pageSecret === null) {
      throw new Error(
        "La conexión no guarda el token de la Page, que es el que publica.",
      );
    }
    const pageAccessToken = decipher.decrypt(pageSecret.accessSecret);

    // La pieza se sube una sola vez y los dos destinos publican la misma URL.
    const bytes = new Uint8Array(readFileSync(options.imagePath));
    const metadata = await sharp(bytes).metadata();
    if (metadata.width <= 0 || metadata.height <= 0) {
      throw new Error("La pieza no declara medidas utilizables.");
    }
    const mediaAssetId = deterministicMediaId(
      "publish-smoke",
      `${options.runId}:${basename(options.imagePath)}`,
    );
    const stored = await storage.store({
      bytes,
      mediaAssetId,
      mimeType: metadata.format === "png" ? "image/png" : "image/jpeg",
      organizationId: organization.id,
    });
    const imageUrl = storage.deliveryUrl(stored, "meta-feed");
    const media = {
      ...deliveredSize(metadata.width, metadata.height),
      url: imageUrl,
    };
    process.stdout.write(
      `Pieza publicada en almacenamiento: ${String(metadata.width)}×${String(metadata.height)} → entrega ${String(media.width)}×${String(media.height)}\nURL: ${imageUrl}\n\n`,
    );

    const probe = new HttpPublicMediaProbe();
    for (const target of options.targets) {
      const publicationTargetId = `${options.runId}:${target}`;
      if (target === "instagram_feed") {
        const publisher = new InstagramPublisher(
          new InstagramGraphAdapter(meta.credentials.graphApiVersion),
          journal,
          probe,
        );
        const outcome = await publisher.publish({
          accessToken: pageAccessToken,
          attemptId: `${options.runId}-instagram`,
          caption: options.copy,
          connection,
          media,
          organizationId: organization.id,
          publicationTargetId,
          target: "instagram_feed",
        });
        process.stdout.write(
          `instagram_feed → ${JSON.stringify(outcome, null, 2)}\n\n`,
        );
        continue;
      }
      const publisher = new FacebookPublisher(
        new FacebookGraphPublishingAdapter(meta.credentials.graphApiVersion),
        journal,
        probe,
      );
      const outcome = await publisher.publish({
        accessToken: pageAccessToken,
        attemptId: `${options.runId}-facebook`,
        connection,
        copy: options.copy,
        media,
        organizationId: organization.id,
        publicationTargetId,
      });
      process.stdout.write(
        `facebook_page → ${JSON.stringify(outcome, null, 2)}\n\n`,
      );
    }
  } finally {
    await database.$disconnect();
  }
}

try {
  await runPublishSmoke();
} catch (cause: unknown) {
  process.stderr.write(
    `Publish smoke failed: ${
      cause instanceof Error ? cause.message : "Error desconocido."
    }\n`,
  );
  process.exitCode = 1;
}
