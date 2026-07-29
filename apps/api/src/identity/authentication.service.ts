import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import type { ApiConfiguration } from "@aramayo/configuration/api";
import type {
  AuthenticatedActor,
  AuthenticatedSessionRecord,
  IdentityRepository,
  LoginMembershipRecord,
} from "@aramayo/domain";
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

import { API_CONFIGURATION } from "../configuration.tokens.ts";
import { IDENTITY_REPOSITORY } from "../database/database.tokens.ts";
import { PASSWORD_HASHER } from "./identity.tokens.ts";
import type { PasswordHasher } from "./password-hasher.ts";

const loginFailureLimit = 5;
const loginFailureWindowMilliseconds = 15 * 60 * 1_000;
const dummyPasswordHash =
  "$argon2id$v=19$m=19456,p=1,t=2$egpa3jqMjFk0yKctcifFjw$HEK+gq+kIFrJ9l5t6jb47QGQ8tbhceTapFSNgQwMft4";

export interface LoginCommand {
  readonly clientFingerprintHash: string;
  readonly email: string;
  readonly organizationSlug?: string;
  readonly password: string;
}

export interface LoginResult {
  readonly actor: AuthenticatedActor;
  readonly csrfToken: string;
  readonly expiresAt: string;
  readonly sessionToken: string;
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function selectMembership(
  memberships: readonly LoginMembershipRecord[],
  organizationSlug: string | undefined,
): LoginMembershipRecord | undefined {
  const activeMemberships = memberships.filter(
    (membership) => membership.status === "active",
  );
  if (organizationSlug !== undefined) {
    return activeMemberships.find(
      (membership) => membership.organizationSlug === organizationSlug,
    );
  }

  return activeMemberships.length === 1 ? activeMemberships[0] : undefined;
}

@Injectable()
export class AuthenticationService {
  readonly #configuration: ApiConfiguration;
  readonly #passwordHasher: PasswordHasher;
  readonly #repository: IdentityRepository;

  constructor(
    @Inject(IDENTITY_REPOSITORY)
    repository: IdentityRepository,
    @Inject(PASSWORD_HASHER)
    passwordHasher: PasswordHasher,
    @Inject(API_CONFIGURATION)
    configuration: ApiConfiguration,
  ) {
    this.#configuration = configuration;
    this.#passwordHasher = passwordHasher;
    this.#repository = repository;
  }

  async login(command: LoginCommand): Promise<LoginResult> {
    const normalizedEmail = normalizeEmail(command.email);
    const subjectHash = sha256(normalizedEmail);
    const now = new Date();
    const occurredAt = now.toISOString();
    const since = new Date(
      now.getTime() - loginFailureWindowMilliseconds,
    ).toISOString();
    const recentFailures = await this.#repository.countRecentLoginFailures({
      clientFingerprintHash: command.clientFingerprintHash,
      since,
      subjectHash,
    });

    if (recentFailures >= loginFailureLimit) {
      await this.#repository.recordAuthenticationEvent({
        clientFingerprintHash: command.clientFingerprintHash,
        eventType: "login_rate_limited",
        metadata: { windowSeconds: loginFailureWindowMilliseconds / 1_000 },
        occurredAt,
        subjectHash,
        succeeded: false,
      });
      throw new HttpException(
        "Demasiados intentos. Esperá unos minutos antes de volver a intentar.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const identity = await this.#repository.findLoginIdentity(normalizedEmail);
    const passwordHash = identity?.passwordHash ?? dummyPasswordHash;
    const passwordMatches = await this.#passwordHasher.verify(
      passwordHash,
      command.password,
    );
    const membership =
      identity === null
        ? undefined
        : selectMembership(identity.memberships, command.organizationSlug);
    if (
      identity !== null &&
      identity.status === "active" &&
      identity.passwordHash !== undefined &&
      identity.passwordHashVersion === 1 &&
      passwordMatches &&
      membership !== undefined
    ) {
      return this.#createAuthenticatedSession({
        clientFingerprintHash: command.clientFingerprintHash,
        membership,
        now,
        occurredAt,
        passwordHashVersion: identity.passwordHashVersion,
        subjectHash,
        userId: identity.id,
      });
    }

    await this.#repository.recordAuthenticationEvent({
      clientFingerprintHash: command.clientFingerprintHash,
      eventType: "login_failed",
      metadata: { reason: "credentials_rejected" },
      occurredAt,
      subjectHash,
      succeeded: false,
      ...(identity === null ? {} : { userId: identity.id }),
    });
    throw new UnauthorizedException(
      "El email, la contraseña o la organización no son válidos.",
    );
  }

  async #createAuthenticatedSession(input: {
    readonly clientFingerprintHash: string;
    readonly membership: LoginMembershipRecord;
    readonly now: Date;
    readonly occurredAt: string;
    readonly passwordHashVersion: number;
    readonly subjectHash: string;
    readonly userId: string;
  }): Promise<LoginResult> {
    const sessionToken = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(
      input.now.getTime() +
        this.#configuration.authenticationSessionTtlSeconds * 1_000,
    ).toISOString();
    const session = await this.#repository.createSession({
      clientFingerprintHash: input.clientFingerprintHash,
      csrfTokenHash: sha256(csrfToken),
      event: {
        clientFingerprintHash: input.clientFingerprintHash,
        eventType: "login_succeeded",
        metadata: { passwordHashVersion: input.passwordHashVersion },
        occurredAt: input.occurredAt,
        organizationId: input.membership.organizationId,
        subjectHash: input.subjectHash,
        succeeded: true,
        userId: input.userId,
      },
      expiresAt,
      membershipId: input.membership.id,
      organizationId: input.membership.organizationId,
      tokenHash: sha256(sessionToken),
      userId: input.userId,
    });

    return Object.freeze({
      actor: session.actor,
      csrfToken,
      expiresAt: session.expiresAt,
      sessionToken,
    });
  }

  authenticate(
    sessionToken: string,
  ): Promise<AuthenticatedSessionRecord | null> {
    return this.#repository.findSessionByTokenHash(
      sha256(sessionToken),
      new Date().toISOString(),
    );
  }

  verifyCsrf(session: AuthenticatedSessionRecord, csrfToken: string): boolean {
    const actual = Buffer.from(sha256(csrfToken), "hex");
    const expected = Buffer.from(session.csrfTokenHash, "hex");
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }

  async issueCsrfToken(session: AuthenticatedSessionRecord): Promise<string> {
    const csrfToken = randomBytes(32).toString("base64url");
    const replaced = await this.#repository.replaceSessionCsrfHash(
      session.actor.sessionId,
      session.actor.userId,
      sha256(csrfToken),
    );
    if (!replaced) {
      throw new UnauthorizedException("La sesión no es válida.");
    }
    return csrfToken;
  }

  async logout(session: AuthenticatedSessionRecord): Promise<void> {
    const revokedAt = new Date().toISOString();
    await this.#repository.revokeSession({
      event: {
        actorMembershipId: session.actor.membershipId,
        eventType: "session_revoked",
        metadata: { reason: "user_logout" },
        occurredAt: revokedAt,
        organizationId: session.actor.organizationId,
        succeeded: true,
        userId: session.actor.userId,
      },
      reason: "user_logout",
      revokedAt,
      sessionId: session.actor.sessionId,
      userId: session.actor.userId,
    });
  }

  async logoutAll(session: AuthenticatedSessionRecord): Promise<number> {
    const revokedAt = new Date().toISOString();
    return this.#repository.revokeAllSessions({
      event: {
        actorMembershipId: session.actor.membershipId,
        eventType: "sessions_revoked",
        metadata: { reason: "user_logout_all" },
        occurredAt: revokedAt,
        organizationId: session.actor.organizationId,
        succeeded: true,
        userId: session.actor.userId,
      },
      reason: "user_logout_all",
      revokedAt,
      userId: session.actor.userId,
    });
  }
}
