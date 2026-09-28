import assert from "node:assert/strict";
import test from "node:test";

import {
  approvalTargetsFor,
  canPublishNow,
  canScheduleFromCard,
  editorFor,
  pieceFormatLabel,
  primaryActionFor,
  publishBlockNotice,
  type CardPermissions,
} from "./publication-card.ts";
import type { PublishGate } from "./publication-publishing-presentation.ts";

const everything: CardPermissions = {
  canApprove: true,
  canEdit: true,
  canSchedule: true,
};
const ready: PublishGate = {
  accountName: "@ferreteriaaramayo",
  kind: "ready",
  targets: ["instagram_feed", "instagram_story"],
};
const notApproved: PublishGate = {
  kind: "blocked",
  message: "La pieza todavía no está aprobada.",
  reason: "not-approved",
};
const noConnection: PublishGate = {
  kind: "blocked",
  message: "No hay una conexión de Meta sana.",
  reason: "no-healthy-connection",
};

test("cada estado ofrece la acción que sigue en el camino de la pieza", () => {
  assert.deepEqual(
    primaryActionFor({ status: "draft" }, everything, notApproved),
    { kind: "render", label: "Preparar imagen" },
  );
  assert.deepEqual(
    primaryActionFor({ status: "generating_assets" }, everything, notApproved),
    { kind: "wait", label: "Preparando la imagen…" },
  );
  // Lista la imagen, lo que sigue es sacarla: la hoja publica o programa.
  assert.deepEqual(
    primaryActionFor({ status: "ready_for_review" }, everything, notApproved),
    { kind: "release", label: "Publicar…" },
  );
  assert.deepEqual(
    primaryActionFor({ status: "published" }, everything, notApproved),
    { kind: "result", label: "Ver resultado" },
  );
  assert.equal(
    primaryActionFor({ status: "cancelled" }, everything, notApproved),
    null,
  );
});

test("una aprobada que no salió se vuelve a publicar antes que a programar", () => {
  assert.deepEqual(
    primaryActionFor({ status: "approved" }, everything, ready),
    { kind: "publish", label: "Publicar…" },
  );
  // Sin conexión no se puede publicar: queda programarla.
  assert.deepEqual(
    primaryActionFor({ status: "approved" }, everything, noConnection),
    { kind: "schedule", label: "Programar" },
  );
  const primary = primaryActionFor({ status: "approved" }, everything, ready);
  assert.equal(
    canScheduleFromCard({ status: "approved" }, primary, everything),
    true,
  );
  assert.equal(canPublishNow({ status: "approved" }, primary, ready), false);
});

test("quien no edita ni aprueba no recibe acciones que no puede hacer", () => {
  const readOnly: CardPermissions = {
    canApprove: false,
    canEdit: false,
    canSchedule: false,
  };
  assert.equal(
    primaryActionFor({ status: "draft" }, readOnly, notApproved),
    null,
  );
  assert.deepEqual(
    primaryActionFor({ status: "ready_for_review" }, readOnly, notApproved),
    { kind: "preview", label: "Ver imagen" },
  );
  assert.equal(
    editorFor({ layout: "foto-producto-cartel", status: "draft" }, readOnly),
    null,
  );
});

test("un post sale en el feed y una historia en historias", () => {
  assert.deepEqual(approvalTargetsFor("feed"), ["instagram_feed"]);
  assert.deepEqual(approvalTargetsFor("cuadrado"), ["instagram_feed"]);
  assert.deepEqual(approvalTargetsFor("historia"), ["instagram_story"]);
  assert.deepEqual(approvalTargetsFor(undefined), ["instagram_story"]);
  assert.equal(pieceFormatLabel("feed"), "Post");
  assert.equal(pieceFormatLabel("historia"), "Historia");
});

test("un producto se edita en su compositor aunque ya esté en revisión", () => {
  assert.equal(
    editorFor(
      { layout: "foto-producto-vidriera", status: "ready_for_review" },
      everything,
    ),
    "product",
  );
  assert.equal(
    editorFor(
      { layout: "foto-producto-vidriera", status: "approved" },
      everything,
    ),
    null,
  );
  assert.equal(
    editorFor(
      { layout: "historia-apertura-placa", status: "draft" },
      everything,
    ),
    "recurring",
  );
  assert.equal(
    editorFor(
      { layout: "historia-apertura-placa", status: "ready_for_review" },
      everything,
    ),
    null,
  );
  // Una plantilla no tiene editor: el botón que antes terminaba en un error
  // ya no aparece.
  assert.equal(
    editorFor({ layout: "historia-tip", status: "draft" }, everything),
    null,
  );
});

test("el motivo de no poder publicar se muestra sólo si hay algo que hacer", () => {
  assert.equal(publishBlockNotice(notApproved), null);
  assert.equal(publishBlockNotice(ready), null);
  assert.equal(
    publishBlockNotice(noConnection),
    "No hay una conexión de Meta sana.",
  );
});
