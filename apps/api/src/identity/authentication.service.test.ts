import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { parseApiEnvironment } from "@aramayo/configuration/api";
import type {
  AuthenticatedSessionRecord,
  AuthenticationEventInput,
  CreateAuthenticationSessionInput,
  IdentityRepository,
  LoginIdentityRecord,
  ScopedMutationResult,
} from "@aramayo/domain";
import { HttpException, UnauthorizedException } from "@nestjs/common";

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
  events: AuthenticationEventInput[] = [];
  identity: LoginIdentityRecord | null = activeIdentity;
  recentFailures = 0;

  changeMembershipRoles(): Promise<ScopedMutationResult> {
    return Promise.resolve({ status: "updated" });
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
