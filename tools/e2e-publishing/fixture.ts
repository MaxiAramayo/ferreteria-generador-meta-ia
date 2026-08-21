/**
 * Datos mínimos para que la vertical de publicación sea navegable.
 *
 * El E2E no puede empezar desde una base vacía: publicar exige un snapshot
 * aprobado con su PNG y una conexión de Meta habilitada, y sin las dos cosas el
 * panel no ofrece el control que se quiere probar. Sembrarlo acá es lo que
 * permite que la prueba mire lo que importa —quién puede publicar y en qué
 * estado— en vez de pelearse con precondiciones.
 *
 * Las personas se siembran con contraseña real, hasheada con el mismo hasher
 * que usa la API. Una sesión falsificada probaría el panel contra un guard que
 * no corrió, que es justamente lo que este E2E existe para no hacer.
 */

import { randomUUID } from "node:crypto";

import type { OrganizationRole } from "@aramayo/domain";
import { createDatabaseClient } from "@aramayo/database";
import { Argon2idPasswordHasher } from "../../apps/api/src/identity/password-hasher.ts";

export const e2ePassword = "Publicaci0n-E2E-Segura";

export interface SeededPerson {
  readonly email: string;
  readonly membershipId: string;
  readonly roles: readonly OrganizationRole[];
}

export interface PublishingFixture {
  readonly approvedPublicationId: string;
  readonly draftPublicationId: string;
  readonly organizationId: string;
  readonly people: Readonly<Record<"editor" | "publisher", SeededPerson>>;
}

const checksum = "a".repeat(64);

/**
 * Documento de diseño válido para el motor.
 *
 * La API lo valida al leer la revisión y responde 500 si no cumple, así que un
 * `{ layout }` de mentira deja la confirmación sin nada que mostrar por un
 * motivo que no tiene nada que ver con lo que se está probando.
 */
type DesignDocumentSeed = Readonly<{
  content: Readonly<{ callToAction: string; title: string }>;
  format: string;
  layout: string;
  media: readonly string[];
  schemaVersion: number;
  slug: string;
  theme: string;
}>;

function designDocument(title: string, slug: string): DesignDocumentSeed {
  return {
    content: {
      callToAction: "Consultanos por WhatsApp",
      title,
    },
    format: "historia",
    layout: "historia-tip",
    media: [],
    schemaVersion: 1,
    slug,
    theme: "taller",
  };
}

/**
 * Credencial de relleno con la forma que la base exige.
 *
 * Los cuatro campos van juntos o no va ninguno, y una conexión sana no puede
 * tener ninguno en nulo.
 */
const cipherPlaceholder = Object.freeze({
  accessCiphertext: Buffer.from("token-e2e").toString("base64"),
  accessIv: Buffer.alloc(12).toString("base64"),
  accessKeyVersion: "v1",
  accessTag: Buffer.alloc(16).toString("base64"),
});

/**
 * Permisos que `metaConnectionCanPublish` exige. Se listan completos porque una
 * conexión a la que le falta uno no habilita el control, y entonces la prueba
 * mediría la ausencia del permiso en vez del rol.
 */
const grantedPermissions = Object.freeze([
  "instagram_basic",
  "instagram_content_publish",
  "pages_manage_posts",
  "pages_read_engagement",
  "pages_show_list",
]);

export async function seedPublishingFixture(
  databaseUrl: string,
): Promise<PublishingFixture> {
  const database = createDatabaseClient(databaseUrl);
  const hasher = new Argon2idPasswordHasher();
  const passwordHash = await hasher.hash(e2ePassword);

  const organizationId = randomUUID();
  const brandId = randomUUID();
  const locationId = randomUUID();
  const approvedPublicationId = randomUUID();
  const draftPublicationId = randomUUID();
  const revisionId = randomUUID();
  const mediaAssetId = randomUUID();

  const people = {
    editor: {
      email: "editora.e2e@aramayo.invalid",
      membershipId: randomUUID(),
      roles: ["editor"] as const,
    },
    publisher: {
      email: "publicadora.e2e@aramayo.invalid",
      membershipId: randomUUID(),
      roles: ["publisher"] as const,
    },
  };

  try {
    await database.organization.create({
      data: {
        displayName: "Aramayo E2E",
        id: organizationId,
        legalName: "Aramayo E2E",
        slug: `aramayo-e2e-${organizationId.slice(0, 8)}`,
      },
    });

    for (const person of Object.values(people)) {
      const userId = randomUUID();
      await database.user.create({
        data: {
          displayName: person.email,
          email: person.email,
          id: userId,
          // La credencial es indivisible: hash, versión e instante van juntos
          // o no va ninguno.
          passwordChangedAt: new Date("2026-08-20T09:00:00.000Z"),
          passwordHash,
          passwordHashVersion: 1,
        },
      });
      await database.organizationMembership.create({
        data: {
          id: person.membershipId,
          organizationId,
          roles: [...person.roles],
          userId,
        },
      });
    }

    await database.brand.create({
      data: {
        id: brandId,
        name: "Aramayo",
        organizationId,
        profile: { claim: "Ferretería y Lubricentro" },
      },
    });
    await database.location.create({
      data: {
        addressLine: "Avenida Belgrano 100",
        brandId,
        city: "Frías",
        id: locationId,
        name: "Casa central",
        openingHours: { display: "08:00 a 20:00" },
        organizationId,
        province: "Santiago del Estero",
      },
    });

    // El activo que el snapshot fija. Sin PNG confirmado la confirmación no
    // tiene nada que mostrar y el botón queda deshabilitado por otro motivo.
    await database.mediaAsset.create({
      data: {
        byteSize: 2048n,
        checksumSha256: checksum,
        height: 1350,
        id: mediaAssetId,
        mimeType: "image/png",
        organizationId,
        origin: "generated",
        originalFileName: "pieza.png",
        ownerMembershipId: people.publisher.membershipId,
        secureUrl: "https://res.cloudinary.com/demo/image/upload/v1/pieza.png",
        status: "available",
        storageKey: "aramayo-e2e/pieza",
        storageProvider: "cloudinary",
        storageVersion: 1,
        width: 1080,
      },
    });

    await database.publication.createMany({
      data: [
        {
          createdByMembershipId: people.publisher.membershipId,
          id: approvedPublicationId,
          locationId,
          organizationId,
          status: "approved",
          title: "Promoción de amoladoras",
        },
        // La segunda existe para comprobar el estado y no sólo el rol: aprobada
        // se puede publicar y en borrador no, con la misma persona.
        {
          createdByMembershipId: people.publisher.membershipId,
          id: draftPublicationId,
          locationId,
          organizationId,
          status: "draft",
          title: "Borrador sin aprobar",
        },
      ],
    });

    await database.publicationRevision.create({
      data: {
        content: {
          caption: "Amoladora angular 850 W.\nConsultá stock en el local.",
          products: [],
        },
        contentHash: checksum,
        createdByMembershipId: people.publisher.membershipId,
        designDocument: designDocument(
          "Amoladora angular 850 W",
          "amoladora-angular",
        ),
        id: revisionId,
        organizationId,
        publicationId: approvedPublicationId,
        renderedAt: new Date("2026-08-20T10:00:00.000Z"),
        renderedMediaAssetId: mediaAssetId,
        revisionNumber: 1,
        schemaVersion: 1,
        status: "approved",
      },
    });
    // El borrador también necesita revisión: el listado del panel describe cada
    // pieza por su última revisión, y una publicación sin ninguna llega con
    // campos ausentes y el panel entero rechaza el listado.
    await database.publicationRevision.create({
      data: {
        content: { caption: "Borrador sin aprobar.", products: [] },
        contentHash: "b".repeat(64),
        createdByMembershipId: people.publisher.membershipId,
        designDocument: designDocument("Borrador sin aprobar", "borrador-e2e"),
        id: randomUUID(),
        organizationId,
        publicationId: draftPublicationId,
        revisionNumber: 1,
        schemaVersion: 1,
      },
    });

    // La revisión gana su `approvalSnapshotId` por la relación inversa: el
    // snapshot apunta a ella, no al revés.
    await database.approvalSnapshot.create({
      data: {
        approvedAt: new Date("2026-08-20T11:00:00.000Z"),
        approvedByMembershipId: people.publisher.membershipId,
        contentHash: checksum,
        id: randomUUID(),
        organizationId,
        publicationId: approvedPublicationId,
        revisionId,
        snapshot: { contentHash: checksum, revisionId },
      },
    });
    const connectionId = randomUUID();
    await database.metaConnection.create({
      data: {
        accountName: "Ferretería y Lubricentro Aramayo",
        // Una conexión sana exige credencial guardada: la base no admite una
        // que pueda publicar sin nada cifrado detrás. El E2E nunca la descifra
        // —no publica de verdad, el worker no corre— pero tiene que existir,
        // porque falsear la forma del dato haría que la prueba pase sobre un
        // estado que la base no permite.
        ...cipherPlaceholder,
        connectedByMembershipId: people.publisher.membershipId,
        grantedPermissions: [...grantedPermissions],
        health: "healthy",
        id: connectionId,
        lastCheckedAt: new Date("2026-08-20T09:00:00.000Z"),
        organizationId,
        providerAccountId: `cuenta-${connectionId.slice(0, 8)}`,
      },
    });
    await database.metaConnectionAsset.createMany({
      data: [
        {
          metaConnectionId: connectionId,
          kind: "page",
          name: "Aramayo",
          organizationId,
          providerAssetId: "page-e2e",
          status: "active",
        },
        {
          metaConnectionId: connectionId,
          kind: "instagram_business",
          name: "@ferreteria_aramayo",
          organizationId,
          providerAssetId: "ig-e2e",
          status: "active",
        },
      ],
    });

    return Object.freeze({
      approvedPublicationId,
      draftPublicationId,
      organizationId,
      people: Object.freeze(people),
    });
  } finally {
    await database.$disconnect();
  }
}
