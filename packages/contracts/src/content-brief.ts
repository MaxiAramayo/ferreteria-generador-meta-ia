export type ContentObjective =
  | 'product'
  | 'promotion'
  | 'informative'
  | 'daily_story'

export type BrandVariant = 'ferreteria' | 'lubricentro'

export type VisualDirection =
  | 'deterministic_template'
  | 'clean_product'
  | 'workshop_context'
  | 'construction_context'
  | 'lubricentro_context'
  | 'seasonal_promotion'

export type ContentBrief = {
  objective: ContentObjective
  brand: BrandVariant
  title: string
  subtitle: string | null
  caption: string
  callToAction: string
  verifiedFactReferences: string[]
  missingInformation: string[]
  visualDirection: VisualDirection
  requiresHumanApproval: boolean
}
