/**
 * Datos mínimos para recorrer «Cambiar marco y textos» (`ADR-029`).
 *
 * El workspace de variantes sólo aparece sobre una ejecución de brief
 * generada, así que se siembra una ya resuelta: pedir un brief de verdad
 * gastaría tokens y dependería de OpenAI, y lo que se prueba acá empieza
 * después. La generación, en cambio, no se siembra: la pide el panel y la
 * resuelve el worker, porque es la variante que produce el sistema la que
 * después se recompone.
 *
 * La persona se siembra con contraseña real, hasheada con el mismo hasher que
 * usa la API: una sesión falsificada probaría el panel contra un guard que no
 * corrió.
 */

import { randomUUID } from "node:crypto";

import { createDatabaseClient } from "@aramayo/database";

import { Argon2idPasswordHasher } from "../../apps/api/src/identity/password-hasher.ts";

export const compositionEditPassword = "Composicion-E2E-Segura";

export interface CompositionEditFixture {
  readonly brief: Readonly<{
    callToAction: string;
    request: string;
    subtitle: string;
    title: string;
  }>;
  readonly briefRunId: string;
  readonly email: string;
  readonly membershipId: string;
  readonly organizationId: string;
}

export async function seedCompositionEditFixture(
  databaseUrl: string,
): Promise<CompositionEditFixture> {
  const database = createDatabaseClient(databaseUrl);
  const hasher = new Argon2idPasswordHasher();

  const organizationId = randomUUID();
  const brandId = randomUUID();
  const locationId = randomUUID();
  const membershipId = randomUUID();
  const userId = randomUUID();
  const briefRunId = randomUUID();
  const email = "editora.marcos.e2e@aramayo.invalid";
  const brief = Object.freeze({
    callToAction: "Consultanos por WhatsApp",
    request: "Pieza para tornillos autoperforantes.",
    subtitle: "Punta mecha y cabeza hexagonal.",
    title: "Tornillos para tu obra",
  });

  try {
    await database.organization.create({
      data: {
        displayName: "Aramayo E2E marcos",
        id: organizationId,
        legalName: "Aramayo E2E marcos",
        slug: `aramayo-marcos-${organizationId.slice(0, 8)}`,
      },
    });
    await database.user.create({
      data: {
        displayName: "Editora E2E",
        email,
        id: userId,
        passwordChangedAt: new Date("2026-09-14T09:00:00.000Z"),
        passwordHash: await hasher.hash(compositionEditPassword),
        passwordHashVersion: 1,
      },
    });
    await database.organizationMembership.create({
      data: { id: membershipId, organizationId, roles: ["editor"], userId },
    });
    await database.brand.create({
      data: {
        id: brandId,
        name: "Aramayo",
        organizationId,
        profile: { themeId: "taller" },
      },
    });
    await database.location.create({
      data: {
        addressLine: "Avenida Belgrano 100",
        brandId,
        city: "Frías",
        id: locationId,
        name: "Casa central",
        openingHours: { display: "Lun a sáb · 08:30 a 13:00 y 17:00 a 20:30" },
        organizationId,
        province: "Santiago del Estero",
      },
    });

    // Sin hechos verificados a propósito: un precio escrito en el copy tiene
    // que rechazarse, y ése es uno de los caminos que recorre la prueba.
    await database.contentBriefRun.create({
      data: {
        actorMembershipId: membershipId,
        attempts: 1,
        brief: {
          brand: "ferreteria",
          callToAction: { kind: "whatsapp", label: brief.callToAction },
          caption:
            "Tenemos tornillos autoperforantes para tu obra; pasá por el local y consultanos.",
          creativeProposal: "Tono directo, foco en el uso real del artículo.",
          missingInformation: [],
          objective: "product",
          products: [
            {
              evidenceId: "C1",
              externalProductId: "odoo-product-101",
              label: "Tornillos autoperforantes",
            },
          ],
          requiresHumanApproval: false,
          subtitle: brief.subtitle,
          title: brief.title,
          verifiedFacts: [],
          visualDirection: "clean_product",
        },
        cachedInputTokens: 0,
        completedAt: new Date("2026-09-14T09:05:00.000Z"),
        evidence: [],
        id: briefRunId,
        inputTokens: 0,
        knowledgeStatus: "grounded",
        latencyMilliseconds: 1,
        locationId,
        model: "gpt-5.6-terra",
        organizationId,
        outputTokens: 0,
        promptHash: "b".repeat(64),
        promptVersion: "content-brief/2026-07-30.2",
        reasoningTokens: 0,
        request: brief.request,
        requestHash: "a".repeat(64),
        requestedAt: new Date("2026-09-14T09:00:00.000Z"),
        schemaVersion: "content-brief/2026-07-30.1",
        status: "generated",
        toolInvocations: [],
        toolNames: [],
        totalTokens: 0,
      },
    });

    return Object.freeze({
      brief,
      briefRunId,
      email,
      membershipId,
      organizationId,
    });
  } finally {
    await database.$disconnect();
  }
}
