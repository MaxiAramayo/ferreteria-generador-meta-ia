export const PUBLICATION_STATUSES = [
  'draft',
  'retrieving_context',
  'missing_information',
  'generating_assets',
  'ready_for_review',
  'approved',
  'scheduled',
  'publishing',
  'partially_published',
  'published',
  'generation_failed',
  'validation_failed',
  'publish_failed',
  'cancelled',
  'expired',
] as const

export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number]

export const PUBLICATION_TARGETS = [
  'instagram_feed',
  'instagram_story',
  'facebook_page',
] as const

export type PublicationTarget = (typeof PUBLICATION_TARGETS)[number]

export type PublicationTargetStatus =
  | 'pending'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'cancelled'

export type VerifiedFact = {
  key: string
  displayValue: string
  sourceType: 'knowledge_document' | 'commercial_system' | 'manual'
  sourceReference: string
  verifiedAt: string
  expiresAt?: string
}

export type PublicationSnapshot = {
  id: string
  organizationId: string
  status: PublicationStatus
  targets: ReadonlyArray<{
    target: PublicationTarget
    status: PublicationTargetStatus
    externalId?: string
  }>
  verifiedFacts: ReadonlyArray<VerifiedFact>
  approvedBy?: string
  approvedAt?: string
  scheduledFor?: string
  timezone: 'America/Argentina/Cordoba'
}
