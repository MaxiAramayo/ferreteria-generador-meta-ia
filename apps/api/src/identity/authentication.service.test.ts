import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { parseApiEnvironment } from "@aramayo/configuration/api";
import type {
  AuthenticatedSessionRecord,
  AuthenticationEventInput,
  ChangePasswordInput,
  ChangePasswordResult,
  CreateAuthenticationSessionInput,
  IdentityRepository,
  LoginIdentityRecord,
  PasswordCredentialRecord,
  ScopedMutationResult,
} from "@aramayo/domain";
import {
  BadRequestException,
  HttpException,
  UnauthorizedException,
} from "@nestjs/common";

import { AuthenticationService } from "./authentication.service.ts";
import type { PasswordHasher } from "./password-hasher.ts";

const configuration = parseApiEnvironment({
  APP_TIMEZONE: "America/Argentina/Cordoba",
  AUTH_SESSION_TTL_SECONDS: "3600",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test",
  NODE_ENV: "test",
  PORT: "3001",
  REDIS_URL: "redis://test:test@127.0.0.1:6379",
  TOKEN_ENCRYPTION_KEYS: "v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  TRUST_PROXY_HOPS: "0",
  WEB_ORIGIN: "http://localhost:3000",
});

const activeIdentity: LoginIdentityRecord = {
  displayName: "Editora Aramayo",
  email: "editora@aramayo.invalid",
  id: "user-1",
  memberships: [
    {
      id: "membership-1",
      organizationId: "organization-1",
      organizationSlug: "aramayo",
      roles: ["editor"],
      status: "active",
    },
  ],
  passwordHash: "hashed:correct-password",
  passwordHashVersion: 1,
  status: "active",
};

class FakePasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return Promise.resolve(`hashed:${password}`);
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return Promise.resolve(passwordHash === `hashed:${password}`);
  }
}

class FakeIdentityRepository implements IdentityRepository {
  createSessionInput: CreateAuthenticationSessionInput | undefined;
  csrfReplacement:
    | Readonly<{
        csrfTokenHash: string;
        sessionId: string;
        userId: string;
      }>
    | undefined;
  events: AuthenticationEventInput[] = [];
  identity: LoginIdentityRecord | null = activeIdentity;
  recentFailures = 0;
  replaceCsrfResult = true;
  changedPassword: ChangePasswordInput | undefined;
  credential: PasswordCredentialRecord | null = {
    email: "editora@aramayo.invalid",
    passwordHash: "hashed:correct-password",
    passwordHashVersion: 1,
    status: "active",
  };

  changeMembershipRoles(): Promise<ScopedMutationResult> {
    return Promise.resolve({ status: "updated" });
  }

  changePassword(input: ChangePasswordInput): Promise<ChangePasswordResult> {
    this.changedPassword = input;
    this.events.push(input.event);
    return Promise.resolve({ revokedSessions: 2, status: "changed" });
  }

  findPasswordCredential(): Promise<PasswordCredentialRecord | null> {
    return Promise.resolve(this.credential);
  }

  countRecentLoginFailures(): Promise<number> {
    return Promise.resolve(this.recentFailures);
  }

  createSession(
    input: CreateAuthenticationSessionInput,
  ): Promise<AuthenticatedSessionRecord> {
    this.createSessionInput = input;
    return Promise.resolve({
      actor: {
        displayName: "Editora Aramayo",
        email: "editora@aramayo.invalid",
        membershipId: input.membershipId,
        organizationId: input.organizationId,
        roles: ["editor"],
        sessionId: "session-1",
        userId: input.userId,
      },
      csrfTokenHash: input.csrfTokenHash,
      expiresAt: input.expiresAt,
    });
  }

  findLoginIdentity(): Promise<LoginIdentityRecord | null> {
    return Promise.resolve(this.identity);
  }

  findSessionByTokenHash(): Promise<AuthenticatedSessionRecord | null> {
    return Promise.resolve(null);
  }

  recordAuthenticationEvent(event: AuthenticationEventInput): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }

  replaceSessionCsrfHash(
    sessionId: string,
    userId: string,
    csrfTokenHash: string,
  ): Promise<boolean> {
    this.csrfReplacement = { csrfTokenHash, sessionId, userId };
    return Promise.resolve(this.replaceCsrfResult);
  }

  revokeAllSessions(): Promise<number> {
    return Promise.resolve(0);
  }

  revokeMembership(): Promise<ScopedMutationResult> {
    return Promise.resolve({ status: "updated" });
  }

  revokeSession(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

const editorSession: AuthenticatedSessionRecord = {
  actor: {
    displayName: "Editora Aramayo",
    email: "editora@aramayo.invalid",
    membershipId: "membership-1",
    organizationId: "organization-1",
    roles: ["editor"],
    sessionId: "session-1",
    userId: "user-1",
  },
  csrfTokenHash: "a".repeat(64),
  expiresAt: "2026-09-11T20:00:00.000Z",
};

function passwordService(
  repository: FakeIdentityRepository,
): AuthenticationService {
  return new AuthenticationService(
    repository,
    new FakePasswordHasher(),
    configuration,
  );
}

test("cambiar la contraseña exige la actual, guarda sólo el hash nuevo y cierra las sesiones", async () => {
  const repository = new FakeIdentityRepository();

  const revoked = await passwordService(repository).changePassword(
    editorSession,
    {
      clientFingerprintHash: "fingerprint",
      currentPassword: "correct-password",
      newPassword: "una-frase-nueva-y-larga",
    },
  );

  assert.equal(revoked, 2);
  const changed = repository.changedPassword;
  assert.ok(changed !== undefined);
  assert.equal(changed.passwordHash, "hashed:una-frase-nueva-y-larga");
  assert.equal(changed.passwordHashVersion, 1);
  assert.equal(changed.userId, "user-1");
  const event = repository.events.at(-1);
  assert.ok(event !== undefined);
  assert.equal(event.eventType, "password_changed");
  assert.equal(event.succeeded, true);
  assert.equal(
    event.subjectHash,
    createHash("sha256").update("editora@aramayo.invalid").digest("hex"),
  );
  assert.doesNotMatch(
    JSON.stringify(repository.events),
    /correct-password|una-frase-nueva/u,
  );
});

test("una contraseña actual equivocada no cambia nada y cuenta como intento fallido", async () => {
  const repository = new FakeIdentityRepository();

  await assert.rejects(
    passwordService(repository).changePassword(editorSession, {
      clientFingerprintHash: "fingerprint",
      currentPassword: "incorrect-password",
      newPassword: "una-frase-nueva-y-larga",
    }),
    BadRequestException,
  );

  assert.equal(repository.changedPassword, undefined);
  assert.equal(repository.events.at(-1)?.eventType, "password_change_failed");
  assert.equal(repository.events.at(-1)?.succeeded, false);
});

test("la contraseña nueva tiene que ser distinta de la actual", async () => {
  const repository = new FakeIdentityRepository();

  await assert.rejects(
    passwordService(repository).changePassword(editorSession, {
      clientFingerprintHash: "fingerprint",
      currentPassword: "correct-password",
      newPassword: "correct-password",
    }),
    /distinta de la actual/u,
  );
  assert.equal(repository.changedPassword, undefined);
});

test("el límite de intentos del login también frena el cambio de contraseña", async () => {
  const repository = new FakeIdentityRepository();
  repository.recentFailures = 5;

  await assert.rejects(
    passwordService(repository).changePassword(editorSession, {
      clientFingerprintHash: "fingerprint",
      currentPassword: "correct-password",
      newPassword: "una-frase-nueva-y-larga",
    }),
    (error: unknown) =>
      error instanceof HttpException && error.getStatus() === 429,
  );
  assert.equal(repository.changedPassword, undefined);
  assert.equal(repository.events.at(-1)?.eventType, "login_rate_limited");
  assert.equal(
    repository.events.at(-1)?.metadata["operation"],
    "password_change",
  );
});

test("una sesión sin credencial activa no puede cambiar la contraseña", async () => {
  for (const credential of [
    null,
    {
      email: "editora@aramayo.invalid",
      passwordHash: "hashed:correct-password",
      passwordHashVersion: 1,
      status: "disabled" as const,
    },
  ]) {
    const repository = new FakeIdentityRepository();
    repository.credential = credential;

    await assert.rejects(
      passwordService(repository).changePassword(editorSession, {
        clientFingerprintHash: "fingerprint",
        currentPassword: "correct-password",
        newPassword: "una-frase-nueva-y-larga",
      }),
      UnauthorizedException,
    );
    assert.equal(repository.changedPassword, undefined);
  }
});

test("login normaliza identidad y persiste sólo hashes de tokens", async () => {
  const repository = new FakeIdentityRepository();
  const service = new AuthenticationService(
    repository,
    new FakePasswordHasher(),
    configuration,
  );

  const result = await service.login({
    clientFingerprintHash: "a".repeat(64),
    email: "  EDITORA@ARAMAYO.INVALID ",
    password: "correct-password",
  });

  assert.equal(result.actor.organizationId, "organization-1");
  assert.match(result.sessionToken, /^[A-Za-z0-9_-]{43}$/u);
  assert.match(result.csrfToken, /^[A-Za-z0-9_-]{43}$/u);
  assert.match(
    repository.createSessionInput?.tokenHash ?? "",
    /^[a-f0-9]{64}$/u,
  );
  assert.match(
    repository.createSessionInput?.csrfTokenHash ?? "",
    /^[a-f0-9]{64}$/u,
  );
  assert.notEqual(
    repository.createSessionInput?.tokenHash,
    result.sessionToken,
  );
  assert.notEqual(
    repository.createSessionInput?.csrfTokenHash,
    result.csrfToken,
  );
});

test("credenciales, usuario deshabilitado y organización inválida comparten rechazo seguro", async () => {
  const scenarios: readonly (LoginIdentityRecord | null)[] = [
    null,
    { ...activeIdentity, status: "disabled" },
    {
      ...activeIdentity,
      memberships: [
        {
          id: "membership-1",
          organizationId: "organization-1",
          organizationSlug: "aramayo",
          roles: ["editor"],
          status: "revoked",
        },
      ],
    },
  ];

  for (const identity of scenarios) {
    const repository = new FakeIdentityRepository();
    repository.identity = identity;
    const service = new AuthenticationService(
      repository,
      new FakePasswordHasher(),
      configuration,
    );

    await assert.rejects(
      service.login({
        clientFingerprintHash: "b".repeat(64),
        email: "editora@aramayo.invalid",
        password: "incorrect-password",
      }),
      (cause: unknown) =>
        cause instanceof UnauthorizedException &&
        cause.message.includes("email, la contraseña o la organización"),
    );
    assert.equal(repository.events.at(-1)?.eventType, "login_failed");
    assert.equal(repository.createSessionInput, undefined);
  }
});

test("el límite de intentos bloquea antes de consultar credenciales", async () => {
  const repository = new FakeIdentityRepository();
  repository.recentFailures = 5;
  const service = new AuthenticationService(
    repository,
    new FakePasswordHasher(),
    configuration,
  );

  await assert.rejects(
    service.login({
      clientFingerprintHash: "c".repeat(64),
      email: "editora@aramayo.invalid",
      password: "correct-password",
    }),
    (cause: unknown) =>
      cause instanceof HttpException && cause.getStatus() === 429,
  );
  assert.equal(repository.events.at(-1)?.eventType, "login_rate_limited");
  assert.equal(repository.createSessionInput, undefined);
});

test("la comparación CSRF acepta sólo el token de la sesión", () => {
  const repository = new FakeIdentityRepository();
  const service = new AuthenticationService(
    repository,
    new FakePasswordHasher(),
    configuration,
  );
  const token = "csrf-token";
  const session: AuthenticatedSessionRecord = {
    actor: {
      displayName: "Editora Aramayo",
      email: "editora@aramayo.invalid",
      membershipId: "membership-1",
      organizationId: "organization-1",
      roles: ["editor"],
      sessionId: "session-1",
      userId: "user-1",
    },
    csrfTokenHash: createHash("sha256").update(token).digest("hex"),
    expiresAt: "2030-01-01T00:00:00.000Z",
  };

  assert.equal(service.verifyCsrf(session, token), true);
  assert.equal(service.verifyCsrf(session, "otro-token"), false);
});

test("la rotación CSRF invalida el hash anterior sin exponerlo", async () => {
  const repository = new FakeIdentityRepository();
  const service = new AuthenticationService(
    repository,
    new FakePasswordHasher(),
    configuration,
  );
  const session: AuthenticatedSessionRecord = {
    actor: {
      displayName: "Editora Aramayo",
      email: "editora@aramayo.invalid",
      membershipId: "membership-1",
      organizationId: "organization-1",
      roles: ["editor"],
      sessionId: "session-1",
      userId: "user-1",
    },
    csrfTokenHash: "a".repeat(64),
    expiresAt: "2030-01-01T00:00:00.000Z",
  };

  const token = await service.issueCsrfToken(session);

  assert.match(token, /^[A-Za-z0-9_-]{43}$/u);
  assert.deepEqual(repository.csrfReplacement, {
    csrfTokenHash: createHash("sha256").update(token).digest("hex"),
    sessionId: session.actor.sessionId,
    userId: session.actor.userId,
  });
  assert.notEqual(repository.csrfReplacement.csrfTokenHash, token);
});

test("la rotación CSRF rechaza una sesión que desapareció", async () => {
  const repository = new FakeIdentityRepository();
  repository.replaceCsrfResult = false;
  const service = new AuthenticationService(
    repository,
    new FakePasswordHasher(),
    configuration,
  );

  await assert.rejects(
    service.issueCsrfToken({
      actor: {
        displayName: "Editora Aramayo",
        email: "editora@aramayo.invalid",
        membershipId: "membership-1",
        organizationId: "organization-1",
        roles: ["editor"],
        sessionId: "session-1",
        userId: "user-1",
      },
      csrfTokenHash: "a".repeat(64),
      expiresAt: "2030-01-01T00:00:00.000Z",
    }),
    UnauthorizedException,
  );
});
