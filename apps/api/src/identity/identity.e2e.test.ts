import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { parseApiEnvironment } from "@aramayo/configuration/api";
import type {
  AuthenticatedSessionRecord,
  AuthenticationEventInput,
  ConfigurationMutationResult,
  CreateAuthenticationSessionInput,
  IdentityRepository,
  GenerationPolicyRepository,
  LoginIdentityRecord,
  OrganizationConfiguration,
  OrganizationConfigurationRepository,
  OrganizationRole,
  PersistBrandConfigurationInput,
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

import {
  GENERATION_POLICY_REPOSITORY,
  IDENTITY_REPOSITORY,
  ORGANIZATION_CONFIGURATION_REPOSITORY,
} from "../database/database.tokens.ts";
import { OrganizationsModule } from "../organizations/organizations.module.ts";
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
  TRUST_PROXY_HOPS: "0",
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

  replaceSessionCsrfHash(
    sessionId: string,
    userId: string,
    csrfTokenHash: string,
  ): Promise<boolean> {
    for (const [tokenHash, session] of this.sessions) {
      if (
        session.actor.sessionId === sessionId &&
        session.actor.userId === userId
      ) {
        this.sessions.set(tokenHash, { ...session, csrfTokenHash });
        return Promise.resolve(true);
      }
    }
    return Promise.resolve(false);
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

const organizationConfiguration: OrganizationConfiguration = {
  brand: {
    claim: "Ferretería, hogar y automotor",
    handle: "@LubricentroAramayo",
    id: "10000000-0000-4000-8000-000000000003",
    name: "Aramayo",
    shortName: "Aramayo",
    themeId: "taller",
    version: 1,
  },
  displayName: "Ferretería y Lubricentro Aramayo",
  id: "organization-1",
  legalName: "Ferretería y Lubricentro Aramayo",
  locations: [],
  version: 1,
};

class InMemoryOrganizationConfigurationRepository implements OrganizationConfigurationRepository {
  findByOrganizationId(
    organizationId: string,
  ): Promise<OrganizationConfiguration | null> {
    return Promise.resolve(
      organizationId === organizationConfiguration.id
        ? organizationConfiguration
        : null,
    );
  }

  updateBrand(
    input: PersistBrandConfigurationInput,
  ): Promise<ConfigurationMutationResult> {
    return Promise.resolve({
      configuration: {
        ...organizationConfiguration,
        brand: {
          ...organizationConfiguration.brand,
          claim: input.update.claim,
          version: input.update.brandVersion + 1,
        },
        version: input.update.organizationVersion + 1,
      },
      status: "updated" as const,
    });
  }

  updateLocation(): Promise<ConfigurationMutationResult> {
    return Promise.resolve({ status: "not-found" as const });
  }
}

@Global()
@Module({})
class TestPersistenceModule {
  static register(
    identityRepository: IdentityRepository,
    configurationRepository: OrganizationConfigurationRepository,
  ): DynamicModule {
    return {
      exports: [
        GENERATION_POLICY_REPOSITORY,
        IDENTITY_REPOSITORY,
        ORGANIZATION_CONFIGURATION_REPOSITORY,
      ],
      global: true,
      module: TestPersistenceModule,
      providers: [
        {
          provide: GENERATION_POLICY_REPOSITORY,
          useValue: generationPolicyRepository,
        },
        { provide: IDENTITY_REPOSITORY, useValue: identityRepository },
        {
          provide: ORGANIZATION_CONFIGURATION_REPOSITORY,
          useValue: configurationRepository,
        },
      ],
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
const configurationRepository =
  new InMemoryOrganizationConfigurationRepository();
const generationPolicyRepository: GenerationPolicyRepository = {
  find: (): Promise<never> => Promise.reject(new Error("no usado")),
  preflight: (): Promise<never> => Promise.reject(new Error("no usado")),
  update: (): Promise<never> => Promise.reject(new Error("no usado")),
};
let application: INestApplication;
let baseUrl: string;

before(async () => {
  const testingModule = await Test.createTestingModule({
    controllers: [PermissionProbeController],
    imports: [
      TestPersistenceModule.register(repository, configurationRepository),
      IdentityModule.forConfiguration(configuration),
      OrganizationsModule,
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
  if (sessionCookie === undefined) {
    throw new Error("Login did not return a session cookie.");
  }
  assert.match(sessionCookie, /HttpOnly/u);
  assert.match(sessionCookie, /SameSite=Lax/u);
  assert.doesNotMatch(cookies.join(";"), /correct-password/u);
  const loginBody = readJsonObject(login.text);
  assert.match(requiredString(loginBody, "csrfToken"), /^[A-Za-z0-9_-]{43}$/u);

  const activeSession = await supertest(baseUrl)
    .get("/auth/session")
    .set("Cookie", sessionCookie);
  assert.equal(activeSession.status, 200);

  const rotatedCsrf = await supertest(baseUrl)
    .get("/auth/csrf")
    .set("Cookie", sessionCookie);
  assert.equal(rotatedCsrf.status, 200);
  const csrfToken = requiredString(
    readJsonObject(rotatedCsrf.text),
    "csrfToken",
  );

  const readableConfiguration = await supertest(baseUrl)
    .get("/organization/configuration")
    .set("Cookie", sessionCookie);
  assert.equal(readableConfiguration.status, 200);

  const forbiddenUpdate = await supertest(baseUrl)
    .patch("/organization/configuration/brand")
    .set("Cookie", sessionCookie)
    .set("Origin", configuration.webOrigin)
    .set("X-CSRF-Token", csrfToken)
    .send({
      brandVersion: 1,
      claim: "Nuevo claim",
      displayName: "Aramayo",
      handle: "@Aramayo",
      legalName: "Aramayo",
      name: "Aramayo",
      organizationVersion: 1,
      shortName: "Aramayo",
      themeId: "taller",
    });
  assert.equal(forbiddenUpdate.status, 403);

  repository.setRoles(["admin"]);
  const authorizedUpdate = await supertest(baseUrl)
    .patch("/organization/configuration/brand")
    .set("Cookie", sessionCookie)
    .set("Origin", configuration.webOrigin)
    .set("X-CSRF-Token", csrfToken)
    .send({
      brandVersion: 1,
      claim: "Nuevo claim",
      displayName: "Aramayo",
      handle: "@Aramayo",
      legalName: "Aramayo",
      name: "Aramayo",
      organizationVersion: 1,
      shortName: "Aramayo",
      themeId: "taller",
    });
  assert.equal(authorizedUpdate.status, 200);

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
