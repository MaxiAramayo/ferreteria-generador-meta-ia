/**
 * Volumen representativo para medir presupuestos (`P7-T05`).
 *
 * Reutiliza la siembra del E2E de publicación —organización, personas y una
 * pieza aprobada con su snapshot— y agrega encima el volumen que el panel va a
 * tener en uso: un listado que obliga a paginar, un calendario con turnos,
 * avisos acumulados en el outbox y una generación con su costo, para poder
 * atribuirlo.
 *
 * Medir contra una base vacía diría que todo es rápido y no probaría nada.
 */

import { randomUUID } from "node:crypto";

import { createDatabaseClient } from "@aramayo/database";

import {
  seedPublishingFixture,
  type PublishingFixture,
} from "../e2e-publishing/fixture.ts";

export { e2ePassword as budgetLoadPassword } from "../e2e-publishing/fixture.ts";

export interface BudgetLoadVolume {
  readonly occurrencesPerSchedule: number;
  readonly pendingOutboxMessages: number;
  readonly publications: number;
  readonly schedules: number;
}

export interface BudgetLoadFixture extends PublishingFixture {
  readonly briefRunId: string;
  readonly generationRunId: string;
  readonly volume: BudgetLoadVolume;
}

/** El costo observado en staging el 2026-09-12, en micro-USD. */
export const observedBriefCostMicrousd = 16_500;
export const observedVariantCostMicrousd = 54_800;

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
    content: { callToAction: "Consultanos por WhatsApp", title },
    format: "historia",
    layout: "historia-tip",
    media: [],
    schemaVersion: 1,
    slug,
    theme: "taller",
  };
}

export async function seedBudgetLoadFixture(
  databaseUrl: string,
  volume: BudgetLoadVolume,
): Promise<BudgetLoadFixture> {
  const base = await seedPublishingFixture(databaseUrl);
  const database = createDatabaseClient(databaseUrl);
  const briefRunId = randomUUID();
  const generationRunId = randomUUID();

  try {
    const publications = Array.from(
      { length: volume.publications },
      (_unused, index) => ({ id: randomUUID(), index }),
    );
    await database.publication.createMany({
      data: publications.map(({ id, index }) => ({
        createdByMembershipId: base.people.editor.membershipId,
        id,
        organizationId: base.organizationId,
        // Un listado real mezcla estados: el panel pinta cada fila según el suyo.
        status:
          index % 5 === 0 ? ("ready_for_review" as const) : ("draft" as const),
        title: `Pieza de carga ${String(index + 1).padStart(4, "0")}`,
      })),
    });
    await database.publicationRevision.createMany({
      data: publications.map(({ id, index }) => ({
        content: {
          caption: `Texto de la pieza ${String(index + 1)}.`,
          products: [],
        },
        contentHash: `${"c".repeat(60)}${String(index).padStart(4, "0")}`.slice(
          0,
          64,
        ),
        createdByMembershipId: base.people.editor.membershipId,
        designDocument: designDocument(
          `Pieza de carga ${String(index + 1)}`,
          `carga-${String(index + 1)}`,
        ),
        id: randomUUID(),
        organizationId: base.organizationId,
        publicationId: id,
        revisionNumber: 1,
        schemaVersion: 1,
        status: "draft" as const,
      })),
    });

    // Las programaciones cuelgan del snapshot que ya dejó aprobado la siembra
    // base: una regla sin snapshot no existe para el dominio.
    const snapshot = await database.approvalSnapshot.findFirst({
      select: { id: true },
      where: { organizationId: base.organizationId },
    });
    if (snapshot === null) {
      throw new Error("La siembra base no dejó un snapshot aprobado.");
    }

    const schedules = Array.from(
      { length: volume.schedules },
      (_unused, index) => ({ id: randomUUID(), index }),
    );
    await database.publicationSchedule.createMany({
      data: schedules.map(({ id }) => ({
        approvalSnapshotId: snapshot.id,
        createdByMembershipId: base.people.scheduler.membershipId,
        effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
        id,
        kind: "weekly" as const,
        lateToleranceMinutes: 30,
        localTime: "10:30",
        organizationId: base.organizationId,
        publicationId: base.approvedPublicationId,
        recurrenceInterval: 1,
        targets: ["instagram_feed", "facebook_page"],
        timeZone: "America/Argentina/Cordoba",
        weekdays: [1, 3],
      })),
    });
    await database.publicationScheduleOccurrence.createMany({
      data: schedules.flatMap(({ id }) =>
        Array.from(
          { length: volume.occurrencesPerSchedule },
          (_unused, position) => {
            // La clave de una ocurrencia es su fecha y hora civil local: la
            // regla sale 10:30 en Córdoba, que en UTC son las 13:30.
            const day = String(15 + position).padStart(2, "0");
            return {
              id: randomUUID(),
              occurrenceKey: `2026-09-${day}T10:30`,
              organizationId: base.organizationId,
              scheduleId: id,
              scheduledAt: new Date(`2026-09-${day}T13:30:00.000Z`),
              status: "planned" as const,
            };
          },
        ),
      ),
    });

    // Avisos acumulados y ya viejos: el escenario de backlog necesita empezar
    // incumpliendo el presupuesto para poder medir la recuperación.
    const accumulatedAt = new Date(Date.now() - 12 * 60 * 1_000);
    await database.outboxMessage.createMany({
      data: Array.from(
        { length: volume.pendingOutboxMessages },
        (_unused, index) => ({
          aggregateId: `carga-${String(index)}`,
          aggregateType: "publication",
          availableAt: accumulatedAt,
          createdAt: accumulatedAt,
          id: randomUUID(),
          organizationId: base.organizationId,
          payload: { index, kind: "budget-load" },
          topic: "aramayo.budget.load",
        }),
      ),
    });

    // Una generación con su costo liquidado, para atribuir por operación.
    await database.contentBriefRun.create({
      data: {
        actorMembershipId: base.people.editor.membershipId,
        attempts: 1,
        cachedInputTokens: 0,
        brief: {
          brand: "ferreteria",
          callToAction: {
            kind: "whatsapp",
            label: "Consultanos por WhatsApp",
          },
          caption: "Aceite sintético 5W40 x 4 litros, en Frías.",
          creativeProposal: "Producto sobre fondo de taller.",
          objective: "product",
          products: [],
          subtitle: "Para servicio con fosa.",
          title: "Aceite sintético 5W40",
          verifiedFacts: [],
          visualDirection: "clean_product",
        },
        completedAt: new Date("2026-09-12T12:00:05.400Z"),
        estimatedCostUsd: "0.016500",
        evidence: [],
        id: briefRunId,
        inputTokens: 4_200,
        knowledgeStatus: "grounded",
        latencyMilliseconds: 5_400,
        model: "gpt-5-mini",
        organizationId: base.organizationId,
        outputTokens: 1_431,
        reasoningTokens: 0,
        request: "Pieza para el aceite sintético 5W40 x 4 litros.",
        requestHash: "d".repeat(64),
        requestedAt: new Date("2026-09-12T12:00:00.000Z"),
        status: "generated",
        toolInvocations: [],
        toolNames: [],
        totalTokens: 5_631,
      },
    });
    await database.generationRun.create({
      data: {
        actorMembershipId: base.people.editor.membershipId,
        admissionMode: "provider",
        completedAt: new Date("2026-09-12T12:01:30.000Z"),
        contentBriefRunId: briefRunId,
        estimatedCostUsd: "0.110000",
        format: "feed",
        id: generationRunId,
        lineageRootId: generationRunId,
        organizationId: base.organizationId,
        referenceCostMicrousd: 2 * observedVariantCostMicrousd,
        requestedAt: new Date("2026-09-12T12:01:00.000Z"),
        reservedCostMicrousd: 2 * observedVariantCostMicrousd,
        status: "completed",
        subjectKind: "branded",
        totalTokens: 3_200,
      },
    });
    // Cada variante salió con su imagen: la base no admite una exitosa sin
    // activo, y sin variante no habría a qué atribuirle el costo.
    const variants = [0, 1].map((index) => ({
      checksum: `${"e".repeat(62)}${String(index).padStart(2, "0")}`,
      id: randomUUID(),
      mediaAssetId: randomUUID(),
      position: index,
    }));
    await database.mediaAsset.createMany({
      data: variants.map((variant) => ({
        byteSize: 2_048n,
        checksumSha256: variant.checksum,
        height: 1_536,
        id: variant.mediaAssetId,
        mimeType: "image/png",
        organizationId: base.organizationId,
        origin: "generated",
        originalFileName: `variante-${String(variant.position + 1)}.png`,
        ownerMembershipId: base.people.editor.membershipId,
        secureUrl: `https://res.cloudinary.com/demo/image/upload/v1/variante-${String(variant.position + 1)}.png`,
        status: "available" as const,
        storageKey: `carga/variante-${String(variant.position + 1)}`,
        storageProvider: "cloudinary",
        storageVersion: 1,
        width: 1_024,
      })),
    });
    await database.generationRunVariant.createMany({
      data: variants.map((variant) => ({
        attempts: 1,
        completedAt: new Date("2026-09-12T12:01:28.000Z"),
        height: 1_536,
        id: variant.id,
        latencyMilliseconds: 18_000,
        mediaAssetId: variant.mediaAssetId,
        model: "gpt-image-2",
        organizationId: base.organizationId,
        position: variant.position,
        runId: generationRunId,
        sha256: variant.checksum,
        source: "generated",
        status: "succeeded" as const,
        width: 1_024,
      })),
    });
    await database.generationAttempt.createMany({
      data: variants.map((variant) => ({
        actorMembershipId: base.people.editor.membershipId,
        attemptNumber: 1,
        completedAt: new Date("2026-09-12T12:01:28.000Z"),
        id: randomUUID(),
        imageInputTokens: 0,
        inputTokens: 900,
        model: "gpt-image-2",
        organizationId: base.organizationId,
        outputTokens: 700,
        pricingVersion: "openai-gpt-image-2-standard-2026-08-05",
        quality: "standard",
        reservedAt: new Date("2026-09-12T12:01:01.000Z"),
        reservedMicrousd: 55_000,
        startedAt: new Date("2026-09-12T12:01:02.000Z"),
        runId: generationRunId,
        settledMicrousd: observedVariantCostMicrousd,
        size: "1024x1536",
        status: "settled" as const,
        textInputTokens: 900,
        totalTokens: 1_600,
        variantId: variant.id,
      })),
    });

    // La pieza aprobada queda atada a su brief: sin ese hilo no se puede
    // atribuir a la pieza lo que costó producirla.
    await database.publicationRevision.updateMany({
      data: { contentBriefRunId: briefRunId },
      where: {
        organizationId: base.organizationId,
        publicationId: base.approvedPublicationId,
      },
    });

    return Object.freeze({ ...base, briefRunId, generationRunId, volume });
  } finally {
    await database.$disconnect();
  }
}
