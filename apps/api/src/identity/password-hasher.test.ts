import assert from "node:assert/strict";
import test from "node:test";

import { Argon2idPasswordHasher } from "./password-hasher.ts";

test("Argon2id genera salt único y verifica sin conservar texto plano", async () => {
  const hasher = new Argon2idPasswordHasher();
  const password = "frase-local-segura-de-prueba";
  const firstHash = await hasher.hash(password);
  const secondHash = await hasher.hash(password);

  assert.match(firstHash, /^\$argon2id\$v=19\$m=19456,p=1,t=2\$/u);
  assert.match(secondHash, /^\$argon2id\$v=19\$m=19456,p=1,t=2\$/u);
  assert.notEqual(firstHash, secondHash);
  assert.doesNotMatch(firstHash, new RegExp(password, "u"));
  assert.equal(await hasher.verify(firstHash, password), true);
  assert.equal(await hasher.verify(firstHash, "contraseña-incorrecta"), false);
});
