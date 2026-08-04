interface FixturePrice {
  readonly amountMinor: number;
  readonly locationId: string;
}

interface FixtureStock {
  readonly locationId: string;
  readonly quantity?: number;
}

export interface FixtureProduct {
  readonly brand: string;
  readonly category: string;
  readonly externalId: string;
  readonly name: string;
  readonly observedAt: string;
  readonly organizationId: string;
  readonly presentation: string;
  readonly prices: readonly FixturePrice[];
  readonly saleUnit: string;
  readonly sku: string;
  readonly status: "active" | "discontinued";
  readonly stocks: readonly FixtureStock[];
}

export interface FixtureReceipt {
  readonly confirmedAt?: string;
  readonly externalReceiptId: string;
  readonly observedAt: string;
  readonly organizationId: string;
}

export interface FixturePromotionApproval {
  readonly approvalId: string;
  readonly approvedAt: string;
  readonly conditions: readonly string[];
  readonly effectiveFrom: string;
  readonly effectiveUntil: string;
  readonly organizationId: string;
  readonly publicationRevisionId: string;
}

const observedAt = "2026-07-29T15:00:00.000Z";

export const fixtureProducts: readonly FixtureProduct[] = Object.freeze([
  {
    brand: "Bosch",
    category: "Herramientas eléctricas",
    externalId: "odoo-product-101",
    name: "Amoladora angular",
    observedAt,
    organizationId: "organization-aramayo",
    presentation: "700 W, disco de 115 mm",
    prices: [{ amountMinor: 129_990_00, locationId: "casa-central" }],
    saleUnit: "unidad",
    sku: "AMO-BOS-700",
    status: "active",
    stocks: [
      { locationId: "casa-central", quantity: 0 },
      { locationId: "rivadavia" },
    ],
  },
  {
    brand: "Stanley",
    category: "Herramientas eléctricas",
    externalId: "odoo-product-102",
    name: "Amoladora angular",
    observedAt,
    organizationId: "organization-aramayo",
    presentation: "900 W, disco de 115 mm",
    prices: [{ amountMinor: 149_500_00, locationId: "casa-central" }],
    saleUnit: "unidad",
    sku: "AMO-STA-900",
    status: "active",
    stocks: [{ locationId: "casa-central", quantity: 7 }],
  },
  {
    brand: "Bosch",
    category: "Herramientas eléctricas",
    externalId: "odoo-product-103",
    name: "Amoladora angular con kit",
    observedAt,
    organizationId: "organization-aramayo",
    presentation: "700 W, disco de 115 mm y maletín",
    prices: [{ amountMinor: 139_990_00, locationId: "casa-central" }],
    saleUnit: "kit",
    sku: "AMO-BOS-700",
    status: "active",
    stocks: [{ locationId: "casa-central", quantity: 2 }],
  },
  {
    brand: "YPF",
    category: "Lubricantes",
    externalId: "odoo-product-201",
    name: "Aceite Elaion F50",
    observedAt,
    organizationId: "organization-aramayo",
    presentation: "Bidón de 4 litros, 5W-40",
    prices: [],
    saleUnit: "bidón",
    sku: "ELA-F50-4L",
    status: "active",
    stocks: [{ locationId: "casa-central", quantity: 4 }],
  },
  {
    brand: "Genérica",
    category: "Electricidad",
    externalId: "odoo-product-301",
    name: "Lámpara halógena",
    observedAt,
    organizationId: "organization-aramayo",
    presentation: "70 W",
    prices: [{ amountMinor: 8_900_00, locationId: "casa-central" }],
    saleUnit: "unidad",
    sku: "LAMP-HAL-70",
    status: "discontinued",
    stocks: [{ locationId: "casa-central", quantity: 0 }],
  },
  {
    brand: "Aislada",
    category: "Fixture de aislamiento",
    externalId: "other-organization-product",
    name: "Producto ajeno",
    observedAt,
    organizationId: "organization-other",
    presentation: "No visible",
    prices: [{ amountMinor: 1_00, locationId: "casa-central" }],
    saleUnit: "unidad",
    sku: "AJENO-001",
    status: "active",
    stocks: [{ locationId: "casa-central", quantity: 99 }],
  },
]);

export const fixtureReceipts: readonly FixtureReceipt[] = Object.freeze([
  {
    confirmedAt: "2026-07-29T14:30:00.000Z",
    externalReceiptId: "receipt-confirmed-001",
    observedAt,
    organizationId: "organization-aramayo",
  },
  {
    externalReceiptId: "receipt-draft-001",
    observedAt,
    organizationId: "organization-aramayo",
  },
]);

export const fixturePromotionApprovals: readonly FixturePromotionApproval[] =
  Object.freeze([
    {
      approvalId: "promotion-approval-001",
      approvedAt: "2026-07-29T14:00:00.000Z",
      conditions: [
        "Válida únicamente para pago contado.",
        "Aplicable en Casa central.",
      ],
      effectiveFrom: "2026-07-29T00:00:00.000Z",
      effectiveUntil: "2026-07-31T23:59:59.000Z",
      organizationId: "organization-aramayo",
      publicationRevisionId: "revision-promotion-001",
    },
  ]);
