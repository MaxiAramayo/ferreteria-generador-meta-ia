export const organizationRoles = [
  "admin",
  "editor",
  "approver",
  "publisher",
  "viewer",
] as const;

export type OrganizationRole = (typeof organizationRoles)[number];

export const organizationPermissions = [
  "content:read",
  "content:edit",
  "content:approve",
  "content:schedule",
  "publishing:execute",
  "connections:manage",
  "organization:manage",
  "identity:manage",
] as const;

export type OrganizationPermission = (typeof organizationPermissions)[number];

const rolePermissions: Readonly<
  Record<OrganizationRole, readonly OrganizationPermission[]>
> = {
  admin: [
    "content:read",
    "connections:manage",
    "organization:manage",
    "identity:manage",
  ],
  approver: ["content:read", "content:approve", "content:schedule"],
  editor: ["content:read", "content:edit"],
  publisher: ["content:read", "publishing:execute"],
  viewer: ["content:read"],
};

export interface AuthenticatedActor {
  readonly displayName: string;
  readonly email: string;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly roles: readonly OrganizationRole[];
  readonly sessionId: string;
  readonly userId: string;
}

export type AuthorizationDecision =
  | Readonly<{ allowed: true }>
  | Readonly<{
      allowed: false;
      reason: "different-organization" | "missing-permission";
    }>;

export function authorizeActor(
  actor: AuthenticatedActor,
  permission: OrganizationPermission,
  resourceOrganizationId: string,
): AuthorizationDecision {
  if (actor.organizationId !== resourceOrganizationId) {
    return Object.freeze({
      allowed: false,
      reason: "different-organization",
    });
  }

  const allowed = actor.roles.some((role) =>
    rolePermissions[role].includes(permission),
  );

  return allowed
    ? Object.freeze({ allowed: true })
    : Object.freeze({ allowed: false, reason: "missing-permission" });
}

export interface LoginMembershipRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly organizationSlug: string;
  readonly roles: readonly OrganizationRole[];
  readonly status: "active" | "revoked";
}

export interface LoginIdentityRecord {
  readonly displayName: string;
  readonly email: string;
  readonly id: string;
  readonly memberships: readonly LoginMembershipRecord[];
  readonly passwordHash?: string;
  readonly passwordHashVersion?: number;
  readonly status: "active" | "disabled";
}

export interface AuthenticatedSessionRecord {
  readonly actor: AuthenticatedActor;
  readonly csrfTokenHash: string;
  readonly expiresAt: string;
}

export type AuthenticationEventType =
  | "login_succeeded"
  | "login_failed"
  | "login_rate_limited"
  | "session_revoked"
  | "sessions_revoked"
  | "membership_roles_changed"
  | "membership_revoked";

export interface AuthenticationEventInput {
  readonly actorMembershipId?: string;
  readonly clientFingerprintHash?: string;
  readonly eventType: AuthenticationEventType;
  readonly metadata: Readonly<Record<string, boolean | number | string>>;
  readonly occurredAt: string;
  readonly organizationId?: string;
  readonly subjectHash?: string;
  readonly succeeded: boolean;
  readonly targetMembershipId?: string;
  readonly userId?: string;
}

export interface CreateAuthenticationSessionInput {
  readonly clientFingerprintHash?: string;
  readonly csrfTokenHash: string;
  readonly event: AuthenticationEventInput;
  readonly expiresAt: string;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly tokenHash: string;
  readonly userId: string;
}

export interface LoginFailureFilter {
  readonly clientFingerprintHash: string;
  readonly since: string;
  readonly subjectHash: string;
}

export interface RevokeSessionInput {
  readonly event: AuthenticationEventInput;
  readonly reason: string;
  readonly revokedAt: string;
  readonly sessionId: string;
  readonly userId: string;
}

export interface RevokeAllSessionsInput {
  readonly event: AuthenticationEventInput;
  readonly exceptSessionId?: string;
  readonly reason: string;
  readonly revokedAt: string;
  readonly userId: string;
}

export interface ChangeMembershipRolesInput {
  readonly actorMembershipId: string;
  readonly changedAt: string;
  readonly organizationId: string;
  readonly roles: readonly OrganizationRole[];
  readonly targetMembershipId: string;
}

export interface RevokeMembershipInput {
  readonly actorMembershipId: string;
  readonly organizationId: string;
  readonly reason: string;
  readonly revokedAt: string;
  readonly targetMembershipId: string;
}

export type ScopedMutationResult =
  Readonly<{ status: "not-found" }> | Readonly<{ status: "updated" }>;

export interface IdentityRepository {
  changeMembershipRoles(
    input: ChangeMembershipRolesInput,
  ): Promise<ScopedMutationResult>;
  countRecentLoginFailures(filter: LoginFailureFilter): Promise<number>;
  createSession(
    input: CreateAuthenticationSessionInput,
  ): Promise<AuthenticatedSessionRecord>;
  findLoginIdentity(email: string): Promise<LoginIdentityRecord | null>;
  findSessionByTokenHash(
    tokenHash: string,
    at: string,
  ): Promise<AuthenticatedSessionRecord | null>;
  recordAuthenticationEvent(event: AuthenticationEventInput): Promise<void>;
  revokeAllSessions(input: RevokeAllSessionsInput): Promise<number>;
  revokeMembership(input: RevokeMembershipInput): Promise<ScopedMutationResult>;
  revokeSession(input: RevokeSessionInput): Promise<boolean>;
}
