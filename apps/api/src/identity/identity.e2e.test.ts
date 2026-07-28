import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { parseApiEnvironment } from "@aramayo/configuration/api";
import type {
  AuthenticatedSessionRecord,
  AuthenticationEventInput,
  CreateAuthenticationSessionInput,
  IdentityRepository,
  LoginIdentityRecord,
  OrganizationRole,
  RevokeAllSessionsInput,
  RevokeSessionInput,
  ScopedMutationResult,
} from "@aramayo/domain";
import {
  Controller,
  Get,
  Global,
  Module,
  ValidationPipe,
  type DynamicModule,
  type INestApplication,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import supertest from "supertest";

import { IDENTITY_REPOSITORY } from "../database/database.tokens.ts";
import { RequirePermission } from "./identity.decorators.ts";
import { IdentityModule } from "./identity.module.ts";
import { PASSWORD_HASHER } from "./identity.tokens.ts";
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

class FastPasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return Promise.resolve(`hashed:${password}`);
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return Promise.resolve(passwordHash === `hashed:${password}`);
  }
}

class InMemoryIdentityRepository implements IdentityRepository {
  readonly events: AuthenticationEventInput[] = [];
  identity: LoginIdentityRecord = {
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
  recentFailures = 0;
  readonly sessions = new Map<string, AuthenticatedSessionRecord>();

  changeMembershipRoles(): Promise<ScopedMutationResult> {
    return Promise.resolve({ status: "updated" });
  }

  countRecentLoginFailures(): Promise<number> {
    return Promise.resolve(this.recentFailures);
  }

  createSession(
    input: CreateAuthenticationSessionInput,
  ): Promise<AuthenticatedSessionRecord> {
    const membership = this.identity.memberships[0];
    if (membership === undefined) {
      throw new Error("La identidad de prueba requiere una membresía.");
    }
    const session: AuthenticatedSessionRecord = {
      actor: {
        displayName: this.identity.displayName,
        email: this.identity.email,
        membershipId: membership.id,
        organizationId: membership.organizationId,
        roles: membership.roles,
        sessionId: `session-${this.sessions.size + 1}`,
        userId: this.identity.id,
      },
      csrfTokenHash: input.csrfTokenHash,
      expiresAt: input.expiresAt,
    };
    this.sessions.set(input.tokenHash, session);
    this.events.push(input.event);
    return Promise.resolve(session);
  }

  findLoginIdentity(email: string): Promise<LoginIdentityRecord | null> {
    return Promise.resolve(
      email === this.identity.email ? this.identity : null,
    );
  }

  findSessionByTokenHash(
    tokenHash: string,
    at: string,
  ): Promise<AuthenticatedSessionRecord | null> {
    const session = this.sessions.get(tokenHash);
    return Promise.resolve(
      session !== undefined && session.expiresAt > at ? session : null,
    );
  }

  recordAuthenticationEvent(event: AuthenticationEventInput): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }

  revokeAllSessions(input: RevokeAllSessionsInput): Promise<number> {
    let revoked = 0;
    for (const [tokenHash, session] of this.sessions) {
      if (
        session.actor.userId === input.userId &&
        session.actor.sessionId !== input.exceptSessionId
      ) {
        this.sessions.delete(tokenHash);
        revoked += 1;
      }
    }
    this.events.push(input.event);
    return Promise.resolve(revoked);
  }

  revokeMembership(): Promise<ScopedMutationResult> {
    return Promise.resolve({ status: "updated" });
  }

  revokeSession(input: RevokeSessionInput): Promise<boolean> {
    for (const [tokenHash, session] of this.sessions) {
      if (
        session.actor.sessionId === input.sessionId &&
        session.actor.userId === input.userId
      ) {
        this.sessions.delete(tokenHash);
        this.events.push(input.event);
        return Promise.resolve(true);
      }
    }
    return Promise.resolve(false);
  }

  setRoles(roles: readonly OrganizationRole[]): void {
    for (const [tokenHash, session] of this.sessions) {
      this.sessions.set(tokenHash, {
        ...session,
        actor: {
          ...session.actor,
          roles,
        },
      });
    }
  }
}

@Global()
@Module({})
class TestPersistenceModule {
  static register(repository: IdentityRepository): DynamicModule {
    return {
      exports: [IDENTITY_REPOSITORY],
      global: true,
      module: TestPersistenceModule,
      providers: [{ provide: IDENTITY_REPOSITORY, useValue: repository }],
    };
  }
}

@Controller("permission-probe")
class PermissionProbeController {
  @Get("approve")
  @RequirePermission("content:approve")
  approve(): Readonly<{ allowed: true }> {
    return Object.freeze({ allowed: true });
  }
}

function readJsonObject(text: string): Readonly<Record<string, unknown>> {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Expected a JSON object.");
  }
  return parsed as Readonly<Record<string, unknown>>;
}

function requiredString(
  record: Readonly<Record<string, unknown>>,
  field: string,
): string {
  const fieldValue = record[field];
  if (typeof fieldValue !== "string") {
    throw new Error(`Expected ${field} to be a string.`);
  }
  return fieldValue;
}

const repository = new InMemoryIdentityRepository();
let application: INestApplication;
let baseUrl: string;

before(async () => {
  const testingModule = await Test.createTestingModule({
    controllers: [PermissionProbeController],
    imports: [
      TestPersistenceModule.register(repository),
      IdentityModule.forConfiguration(configuration),
    ],
  })
    .overrideProvider(PASSWORD_HASHER)
    .useValue(new FastPasswordHasher())
    .compile();

  application = testingModule.createNestApplication();
  application.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  await application.listen(0, "127.0.0.1");
  baseUrl = await application.getUrl();
});

after(async () => {
  await application.close();
});

test("el flujo HTTP aplica sesión, CSRF, permisos, validación y revocación", async () => {
  const missingSession = await supertest(baseUrl).get("/auth/session");
  assert.equal(missingSession.status, 401);

  const invalidPayload = await supertest(baseUrl)
    .post("/auth/login")
    .set("Origin", configuration.webOrigin)
    .send({
      email: "editora@aramayo.invalid",
      extra: true,
      password: "correct-password",
    });
  assert.equal(invalidPayload.status, 400);

  const wrongOrigin = await supertest(baseUrl)
    .post("/auth/login")
    .set("Origin", "https://attacker.invalid")
    .send({
      email: "editora@aramayo.invalid",
      password: "correct-password",
    });
  assert.equal(wrongOrigin.status, 403);

  const login = await supertest(baseUrl)
    .post("/auth/login")
    .set("Origin", configuration.webOrigin)
    .send({
      email: "editora@aramayo.invalid",
      password: "correct-password",
    });
  assert.equal(login.status, 201);
  const setCookie = login.get("Set-Cookie") ?? [];
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  const sessionCookie = cookies.find((cookie) =>
    cookie.startsWith("aramayo_session="),
  );
  const csrfCookie = cookies.find((cookie) =>
    cookie.startsWith("aramayo_csrf="),
  );
  if (sessionCookie === undefined || csrfCookie === undefined) {
    throw new Error("Login did not return a session cookie.");
  }
  assert.match(sessionCookie, /HttpOnly/u);
  assert.doesNotMatch(csrfCookie, /HttpOnly/u);
  assert.match(sessionCookie, /SameSite=Lax/u);
  assert.match(csrfCookie, /SameSite=Lax/u);
  assert.doesNotMatch(cookies.join(";"), /correct-password/u);
  const loginBody = readJsonObject(login.text);
  const csrfToken = requiredString(loginBody, "csrfToken");
  assert.match(csrfCookie, new RegExp(`aramayo_csrf=${csrfToken}`, "u"));

  const activeSession = await supertest(baseUrl)
    .get("/auth/session")
    .set("Cookie", sessionCookie);
  assert.equal(activeSession.status, 200);

  const missingCsrf = await supertest(baseUrl)
    .post("/auth/logout")
    .set("Cookie", sessionCookie)
    .set("Origin", configuration.webOrigin);
  assert.equal(missingCsrf.status, 403);

  const editorApproval = await supertest(baseUrl)
    .get("/permission-probe/approve")
    .set("Cookie", sessionCookie);
  assert.equal(editorApproval.status, 403);

  repository.setRoles(["approver"]);
  const approverApproval = await supertest(baseUrl)
    .get("/permission-probe/approve")
    .set("Cookie", sessionCookie);
  assert.equal(approverApproval.status, 200);

  const logout = await supertest(baseUrl)
    .post("/auth/logout")
    .set("Cookie", sessionCookie)
    .set("Origin", configuration.webOrigin)
    .set("X-CSRF-Token", csrfToken);
  assert.equal(logout.status, 201);

  const revokedSession = await supertest(baseUrl)
    .get("/auth/session")
    .set("Cookie", sessionCookie);
  assert.equal(revokedSession.status, 401);
});

test("un usuario deshabilitado no puede iniciar sesión", async () => {
  repository.identity = { ...repository.identity, status: "disabled" };
  const login = await supertest(baseUrl)
    .post("/auth/login")
    .set("Origin", configuration.webOrigin)
    .send({
      email: "editora@aramayo.invalid",
      password: "correct-password",
    });

  assert.equal(login.status, 401);
});
