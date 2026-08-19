import assert from "node:assert/strict";
import test from "node:test";

import {
  isPubliclyFetchableMediaUrl,
  metaPublishingAttemptStates,
  metaPublishingFailureCodes,
  MetaPublishingError,
} from "./index.ts";

test("el fallo no expone la respuesta del proveedor", () => {
  const error = new MetaPublishingError(
    "media-unreachable",
    "Meta no pudo descargar la pieza.",
    true,
  );
  assert.equal(error.message, "La publicación no pudo completarse.");
  assert.equal(error.name, "MetaPublishingError");
  assert.equal(error.code, "media-unreachable");
  assert.equal(error.retryable, true);
});

test("una dirección que Meta puede descargar se acepta", () => {
  for (const url of [
    "https://res.cloudinary.com/m73l9k4c/image/upload/v3/pieza.jpg",
    "https://content.aramayo.example.com/media/pieza.jpg",
    "https://8.8.8.8/pieza.jpg",
  ]) {
    assert.ok(isPubliclyFetchableMediaUrl(url), url);
  }
});

test("una dirección que Meta no alcanza desde afuera se rechaza", () => {
  for (const url of [
    "http://res.cloudinary.com/pieza.jpg",
    "https://localhost/pieza.jpg",
    "https://almacenamiento/pieza.jpg",
    "https://almacenamiento.local/pieza.jpg",
    "https://127.0.0.1/pieza.jpg",
    "https://10.0.0.4/pieza.jpg",
    "https://169.254.169.254/pieza.jpg",
    "https://172.16.9.9/pieza.jpg",
    "https://172.31.255.1/pieza.jpg",
    "https://192.168.1.10/pieza.jpg",
    "https://usuario:clave@res.cloudinary.com/pieza.jpg",
    "no-es-una-url",
    "",
  ]) {
    assert.ok(!isPubliclyFetchableMediaUrl(url), url);
  }
});

test("un rango privado vecino que sí es público no se rechaza de más", () => {
  // `172.15` y `172.32` quedan fuera del bloque privado `172.16/12`.
  assert.ok(isPubliclyFetchableMediaUrl("https://172.15.0.1/pieza.jpg"));
  assert.ok(isPubliclyFetchableMediaUrl("https://172.32.0.1/pieza.jpg"));
});

test("los estados y códigos compartidos no se duplican", () => {
  assert.equal(
    new Set(metaPublishingAttemptStates).size,
    metaPublishingAttemptStates.length,
  );
  assert.equal(
    new Set(metaPublishingFailureCodes).size,
    metaPublishingFailureCodes.length,
  );
});
