export type BrandThemeId = "taller" | "claro" | "promo" | "lubricentro";

export interface BrandConfigurationResponse {
  readonly claim: string;
  readonly handle: string;
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly themeId: BrandThemeId;
  readonly version: number;
}

export interface LocationConfigurationResponse {
  readonly addressLine: string;
  readonly city: string;
  readonly id: string;
  readonly isActive: boolean;
  readonly name: string;
  readonly openingHours: string;
  readonly phone?: string;
  readonly province: string;
  readonly timeZone: string;
  readonly version: number;
  readonly whatsapp?: string;
}

export interface OrganizationConfigurationResponse {
  readonly brand: BrandConfigurationResponse;
  readonly displayName: string;
  readonly id: string;
  readonly legalName: string;
  readonly locations: readonly LocationConfigurationResponse[];
  readonly version: number;
}
