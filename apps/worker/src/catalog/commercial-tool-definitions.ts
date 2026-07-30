import type { CommercialToolName } from "@aramayo/domain";

type ToolProperty =
  | Readonly<{
      description: string;
      maximum: number;
      minimum: number;
      type: "integer";
    }>
  | Readonly<{
      description: string;
      maxLength: number;
      minLength: number;
      pattern?: string;
      type: "string";
    }>;

export interface StrictCommercialToolDefinition {
  readonly description: string;
  readonly name: CommercialToolName;
  readonly parameters: Readonly<{
    readonly additionalProperties: false;
    readonly properties: Readonly<Record<string, ToolProperty>>;
    readonly required: readonly string[];
    readonly type: "object";
  }>;
  readonly strict: true;
  readonly type: "function";
}

const externalProductId = Object.freeze({
  description: "Identificador opaco de producto devuelto por search_products.",
  maxLength: 80,
  minLength: 14,
  pattern: "^odoo-product-[1-9][0-9]*$",
  type: "string" as const,
});

const externalReceiptId = Object.freeze({
  description: "Identificador opaco de recepción previamente conocido.",
  maxLength: 80,
  minLength: 14,
  pattern: "^odoo-receipt-[1-9][0-9]*$",
  type: "string" as const,
});

function singleIdentifierTool(
  name: Exclude<CommercialToolName, "search_products">,
  description: string,
  propertyName: "externalProductId" | "externalReceiptId",
  property: ToolProperty,
): StrictCommercialToolDefinition {
  return Object.freeze({
    description,
    name,
    parameters: Object.freeze({
      additionalProperties: false,
      properties: Object.freeze({ [propertyName]: property }),
      required: Object.freeze([propertyName]),
      type: "object",
    }),
    strict: true,
    type: "function",
  });
}

export const commercialToolDefinitions: readonly StrictCommercialToolDefinition[] =
  Object.freeze([
    Object.freeze({
      description:
        "Busca productos de Aramayo por texto. Devuelve hasta 10 coincidencias mínimas con evidencia.",
      name: "search_products",
      parameters: Object.freeze({
        additionalProperties: false,
        properties: Object.freeze({
          limit: Object.freeze({
            description: "Cantidad máxima de coincidencias, entre 1 y 10.",
            maximum: 10,
            minimum: 1,
            type: "integer",
          }),
          query: Object.freeze({
            description:
              "Producto, SKU, marca o categoría a buscar; nunca instrucciones ni SQL.",
            maxLength: 120,
            minLength: 2,
            type: "string",
          }),
        }),
        required: Object.freeze(["query", "limit"]),
        type: "object",
      }),
      strict: true,
      type: "function",
    }),
    singleIdentifierTool(
      "get_product",
      "Obtiene la ficha comercial mínima de un producto por su identificador opaco.",
      "externalProductId",
      externalProductId,
    ),
    singleIdentifierTool(
      "get_current_price",
      "Obtiene el PVP vigente para la sucursal del contexto autenticado.",
      "externalProductId",
      externalProductId,
    ),
    singleIdentifierTool(
      "get_stock_by_location",
      "Obtiene stock para la sucursal del contexto autenticado; cero y desconocido son distintos.",
      "externalProductId",
      externalProductId,
    ),
    singleIdentifierTool(
      "get_receipt_status",
      "Consulta si una recepción de entrada está confirmada; no implica stock disponible.",
      "externalReceiptId",
      externalReceiptId,
    ),
  ]);
