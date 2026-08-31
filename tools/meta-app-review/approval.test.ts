import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import type { SafeJsonObject } from "@aramayo/domain";

import {
  hashAppReviewContent,
  metaAppReviewApprovalHash,
  requireMetaAppReviewApproval,
  type MetaAppReviewApprovalPackage,
} from "./approval.ts";
import { metaAppReviewPublicationDesignInput } from "./content.ts";
import { metaAppReviewPackage } from "./manifest.ts";

const fixtureBitmapSha256 = "a".repeat(64);
const publicationDesign = metaAppReviewPublicationDesignInput();

/** Aprobación sintética para pruebas; nunca modifica el manifiesto operativo. */
function approvedFixture(): MetaAppReviewApprovalPackage {
  return {
    ...metaAppReviewPackage,
    approvalStatus: "approved-for-single-app-review-order",
    publicationApproval: {
      ...metaAppReviewPackage.publicationApproval,
      approvedAt: "2026-08-31",
      packageSha256: metaAppReviewApprovalHash(
        metaAppReviewPackage,
        fixtureBitmapSha256,
        publicationDesign,
      ),
    },
    sha256: fixtureBitmapSha256,
  };
}

test("la aprobación operativa conserva exactamente la huella presentada al negocio", () => {
  assert.deepEqual(
    requireMetaAppReviewApproval(metaAppReviewPackage, publicationDesign),
    {
      approvedAt: "2026-08-31",
      bitmapSha256:
        "407de4f95c8e18f4c52fa0544785f06f81fe9832de1032a3ac7e977fa0ca7d43",
      packageSha256:
        "7e44022a2020875ba420e99736711b7f8953051d6afb6bb8d462f59a460b012e",
    },
  );
});

test("la huella candidata se conserva al registrar la aprobación exacta", () => {
  const approved = approvedFixture();
  assert.deepEqual(requireMetaAppReviewApproval(approved, publicationDesign), {
    approvedAt: "2026-08-31",
    bitmapSha256: fixtureBitmapSha256,
    packageSha256: approved.publicationApproval.packageSha256,
  });
});

test("volver a pendiente revoca el permiso aunque se conserve la huella anterior", () => {
  assert.throws(
    () =>
      requireMetaAppReviewApproval(
        {
          ...approvedFixture(),
          approvalStatus: "pending-business-approval",
        },
        publicationDesign,
      ),
    /no tiene aprobación humana/u,
  );
});

const changedScopes: readonly Readonly<{
  label: string;
  changes: SafeJsonObject;
}>[] = [
  {
    label: "copy",
    changes: { copy: `${metaAppReviewPackage.copy} Nuevo texto.` },
  },
  { label: "texto alternativo", changes: { altText: "Otra descripción" } },
  { label: "título", changes: { publicationTitle: "Otra publicación" } },
  { label: "bitmap", changes: { sha256: "b".repeat(64) } },
  { label: "versión", changes: { version: "meta-app-review/otra-version" } },
  { label: "formato", changes: { height: 1920 } },
  {
    label: "destinos",
    changes: { targets: ["instagram_story", "facebook_page"] },
  },
  { label: "límite de órdenes", changes: { maxOrders: 2 } },
  { label: "días de acceso", changes: { maxAccessDays: 31 } },
  {
    label: "URL pública",
    changes: { publicAssetUrl: "https://example.invalid/otro.png" },
  },
  {
    label: "evidencia comercial",
    changes: {
      commercialSnapshot: {
        ...metaAppReviewPackage.commercialSnapshot,
        price: {
          ...metaAppReviewPackage.commercialSnapshot.price,
          amountMinor: 1,
        },
      },
    },
  },
  {
    label: "stock por sucursal",
    changes: {
      commercialSnapshot: {
        ...metaAppReviewPackage.commercialSnapshot,
        stock: [
          { ...metaAppReviewPackage.commercialSnapshot.stock[0], quantity: 0 },
        ],
      },
    },
  },
  {
    label: "base ilustrativa",
    changes: {
      illustrativeBase: {
        ...metaAppReviewPackage.illustrativeBase,
        sha256: "c".repeat(64),
      },
    },
  },
  {
    label: "roles del revisor",
    changes: {
      reviewer: {
        ...metaAppReviewPackage.reviewer,
        roles: ["admin", "editor"],
      },
    },
  },
  {
    label: "permiso adicional",
    changes: {
      requiredMetaPermissions: [
        ...metaAppReviewPackage.requiredMetaPermissions,
        "business_management",
      ],
    },
  },
  {
    label: "campo futuro del paquete",
    changes: { additionalPublication: true },
  },
];

for (const { label, changes } of changedScopes) {
  test(`cambiar ${label} invalida la aprobación previa`, () => {
    assert.throws(
      () =>
        requireMetaAppReviewApproval(
          { ...approvedFixture(), ...changes },
          publicationDesign,
        ),
      /cambió después de aprobarse/u,
    );
  });
}

for (const changes of [
  { maximumWindowDays: 31 },
  { startsAt: "immediately" },
  { supervision: "none" },
  { removal: "automatic" },
  { ambiguousOutcome: "retry" },
]) {
  test(`cambiar la condición ${Object.keys(changes).join(",")} exige aprobación nueva`, () => {
    const approved = approvedFixture();
    assert.throws(
      () =>
        requireMetaAppReviewApproval(
          {
            ...approved,
            publicationApproval: {
              ...approved.publicationApproval,
              ...changes,
            },
          },
          publicationDesign,
        ),
      /cambió después de aprobarse/u,
    );
  });
}

test("un cambio del documento determinista invalida aunque el manifiesto no cambie", () => {
  assert.throws(
    () =>
      requireMetaAppReviewApproval(approvedFixture(), {
        ...publicationDesign,
        theme: "papel",
      }),
    /cambió después de aprobarse/u,
  );
});

test("el orden de claves JSON no cambia la huella ni el hash de revisión", () => {
  const reversedDesign = Object.fromEntries(
    Object.entries(publicationDesign).reverse(),
  );
  const approved = approvedFixture();
  assert.equal(
    hashAppReviewContent(reversedDesign),
    hashAppReviewContent(publicationDesign),
  );
  assert.equal(
    requireMetaAppReviewApproval(approved, reversedDesign).packageSha256,
    approved.publicationApproval.packageSha256,
  );
  assert.equal(
    hashAppReviewContent({ b: [true, null], a: 1 }),
    "1cc69c7fa23616ca2ec3ee70d24390a6225c8832db8a4c814c7e0e7f942f8668",
  );
});

for (const approvedAt of [null, "", "2026-02-30", "ayer"]) {
  test(`rechaza una fecha de aprobación ausente o inválida: ${String(approvedAt)}`, () => {
    const approved = approvedFixture();
    assert.throws(
      () =>
        requireMetaAppReviewApproval(
          {
            ...approved,
            publicationApproval: {
              ...approved.publicationApproval,
              approvedAt,
            },
          },
          publicationDesign,
        ),
      /aprobación/u,
    );
  });
}

for (const checksum of [null, "", "incorrecto", "a".repeat(63)]) {
  test(`rechaza checksum o huella incompletos: ${String(checksum)}`, () => {
    const approved = approvedFixture();
    assert.throws(
      () =>
        requireMetaAppReviewApproval(
          {
            ...approved,
            sha256: checksum,
          },
          publicationDesign,
        ),
      /aprobación|checksum/u,
    );
    assert.throws(
      () =>
        requireMetaAppReviewApproval(
          {
            ...approved,
            publicationApproval: {
              ...approved.publicationApproval,
              packageSha256: checksum,
            },
          },
          publicationDesign,
        ),
      /aprobación|huella/u,
    );
  });
}

for (const entrypoint of ["cli.ts", "provision.ts"]) {
  test(`${entrypoint} rechaza argumentos desconocidos antes de operar`, () => {
    const result = spawnSync(
      process.execPath,
      [new URL(entrypoint, import.meta.url).pathname, "--unknown"],
      {
        cwd: new URL("../../", import.meta.url),
        encoding: "utf8",
        env: {
          DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
          WEB_ORIGIN: "https://staging.content.ferreteriaaramayo.com.ar",
        },
        timeout: 15_000,
      },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Argumentos no admitidos/u);
    assert.equal(result.stdout, "");
  });
}
