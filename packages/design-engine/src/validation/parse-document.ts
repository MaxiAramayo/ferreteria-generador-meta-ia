import {
  contentLimits,
  DESIGN_SCHEMA_VERSION,
  inlineAssetLimits,
  mediaDefaults,
  mediaLimits,
  type AssetReference,
  type DesignContent,
  type DesignDocument,
  type MediaAsset,
  type MediaFit,
} from "../contracts/document.ts";
import { isFormatId, type FormatId } from "../formats/formats.ts";
import { isIconName } from "../registry/icons.ts";
import type { LayoutId } from "../registry/layout-id.ts";
import type { ContentFieldKey, LayoutSpec } from "../registry/layout-spec.ts";
import {
  isLayoutId,
  layoutSpecFor,
  supportsFormat,
} from "../registry/layouts.ts";
import { DEFAULT_THEME_ID, isThemeId, type ThemeId } from "../themes/themes.ts";
import { issue, type DesignIssue } from "./issues.ts";

/**
 * Validación de borde del motor.
 *
 * Todo lo que llega desde fuera —panel, base de datos, IA o un archivo del
 * generador anterior— pasa por acá antes de tocar un layout. La función nunca
 * lanza: devuelve un resultado discriminado con todos los problemas
 * encontrados, para poder mostrarlos juntos en una revisión.
 */

export type DesignDocumentParseResult =
  | { readonly document: DesignDocument; readonly ok: true }
  | { readonly issues: readonly DesignIssue[]; readonly ok: false };

const documentKeys: ReadonlySet<string> = new Set([
  "content",
  "format",
  "layout",
  "media",
  "schemaVersion",
  "slug",
  "theme",
]);

const mediaKeys: ReadonlySet<string> = new Set([
  "alt",
  "fit",
  "focus",
  "reference",
  "zoom",
]);

const contentFieldKeys: readonly ContentFieldKey[] = [
  "badge",
  "branch",
  "callToAction",
  "category",
  "disclaimer",
  "icon",
  "items",
  "phone",
  "previousPrice",
  "price",
  "subtitle",
  "title",
  "validity",
];

const knownContentFields: ReadonlySet<string> = new Set(contentFieldKeys);

const textFieldKeys: readonly ContentFieldKey[] = contentFieldKeys.filter(
  (key) => key !== "icon" && key !== "items",
);

const assetIdPattern = /^[a-z0-9][a-z0-9/_-]{2,127}$/u;

/**
 * Activo embebido: sólo mapa de bits en base64, y sólo de los tipos aprobados.
 * `image/svg+xml` queda deliberadamente afuera —un SVG ejecuta script dentro
 * del render— igual que cualquier `data:` sin `;base64`.
 *
 * La lista de tipos sale del contrato para que agregar uno no exija recordar
 * que además hay una expresión regular que lo repite.
 */
const inlineDataUrlPattern = new RegExp(
  `^data:(?:${inlineAssetLimits.mimeTypes.join("|")});base64,[A-Za-z0-9+/]+={0,2}$`,
  "u",
);

function asRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? { ...value }
    : undefined;
}

function collectUnknownKeys(
  record: Readonly<Record<string, unknown>>,
  known: ReadonlySet<string>,
  basePath: string,
  issues: DesignIssue[],
): void {
  for (const key of Object.keys(record)) {
    if (!known.has(key)) {
      issues.push(issue("unknown-field", `${basePath}${key}`));
    }
  }
}

function readText(
  value: unknown,
  path: string,
  issues: DesignIssue[],
): string | undefined {
  if (typeof value !== "string") {
    issues.push(issue("invalid-type", path));
    return undefined;
  }

  const text = value.trim();

  if (text.length === 0) {
    issues.push(issue("missing", path));
    return undefined;
  }

  if (text.length > contentLimits.textMaximum) {
    issues.push(issue("too-long", path));
    return undefined;
  }

  return text;
}

function readItems(
  value: unknown,
  path: string,
  issues: DesignIssue[],
): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    issues.push(issue("invalid-type", path));
    return undefined;
  }

  if (value.length === 0) {
    issues.push(issue("missing", path));
    return undefined;
  }

  if (value.length > contentLimits.itemsMaximum) {
    issues.push(issue("too-many", path));
    return undefined;
  }

  const items: string[] = [];

  for (const [index, entry] of value.entries()) {
    const text = readText(entry, `${path}[${index}]`, issues);
    if (text !== undefined) {
      items.push(text);
    }
  }

  return items.length === value.length ? Object.freeze(items) : undefined;
}

function readNumber(
  value: unknown,
  path: string,
  bounds: { readonly maximum: number; readonly minimum: number },
  issues: DesignIssue[],
): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push(issue("invalid-type", path));
    return undefined;
  }

  if (value < bounds.minimum || value > bounds.maximum) {
    issues.push(issue("invalid-value", path));
    return undefined;
  }

  return value;
}

function parseAssetReference(
  value: unknown,
  path: string,
  issues: DesignIssue[],
): AssetReference | undefined {
  const record = asRecord(value);

  if (record === undefined) {
    issues.push(issue("invalid-type", path));
    return undefined;
  }

  if (record["source"] === "brand-library") {
    collectUnknownKeys(
      record,
      new Set(["assetId", "source"]),
      `${path}.`,
      issues,
    );
    const assetId = record["assetId"];

    if (typeof assetId !== "string" || !assetIdPattern.test(assetId)) {
      issues.push(issue("invalid-format", `${path}.assetId`));
      return undefined;
    }

    return Object.freeze({ assetId, source: "brand-library" });
  }

  if (record["source"] === "inline") {
    collectUnknownKeys(
      record,
      new Set(["dataUrl", "source"]),
      `${path}.`,
      issues,
    );
    const dataUrl = record["dataUrl"];

    if (typeof dataUrl !== "string") {
      issues.push(issue("invalid-type", `${path}.dataUrl`));
      return undefined;
    }

    if (dataUrl.length > inlineAssetLimits.dataUrlMaximum) {
      issues.push(issue("too-long", `${path}.dataUrl`));
      return undefined;
    }

    // El tipo se comprueba contra la lista aprobada y no contra «cualquier
    // imagen»: un `data:` con SVG ejecutaría scripts dentro del render.
    if (!inlineDataUrlPattern.test(dataUrl)) {
      issues.push(issue("invalid-format", `${path}.dataUrl`));
      return undefined;
    }

    return Object.freeze({ dataUrl, source: "inline" });
  }

  if (record["source"] === "remote") {
    collectUnknownKeys(record, new Set(["source", "url"]), `${path}.`, issues);
    const rawUrl = record["url"];

    if (typeof rawUrl !== "string") {
      issues.push(issue("invalid-type", `${path}.url`));
      return undefined;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      issues.push(issue("invalid-format", `${path}.url`));
      return undefined;
    }

    // Meta exige medios accesibles por HTTPS y el render no debe leer disco.
    if (parsedUrl.protocol !== "https:") {
      issues.push(issue("invalid-value", `${path}.url`));
      return undefined;
    }

    return Object.freeze({ source: "remote", url: parsedUrl.toString() });
  }

  issues.push(issue("invalid-value", `${path}.source`));
  return undefined;
}

function parseMediaAsset(
  value: unknown,
  path: string,
  issues: DesignIssue[],
): MediaAsset | undefined {
  const record = asRecord(value);

  if (record === undefined) {
    issues.push(issue("invalid-type", path));
    return undefined;
  }

  collectUnknownKeys(record, mediaKeys, `${path}.`, issues);

  const reference = parseAssetReference(
    record["reference"],
    `${path}.reference`,
    issues,
  );
  const alt = readText(record["alt"], `${path}.alt`, issues);

  let fit: MediaFit = mediaDefaults.fit;
  if (record["fit"] !== undefined) {
    if (record["fit"] === "contain" || record["fit"] === "cover") {
      fit = record["fit"];
    } else {
      issues.push(issue("invalid-value", `${path}.fit`));
    }
  }

  let focus = mediaDefaults.focus;
  if (record["focus"] !== undefined) {
    const focusRecord = asRecord(record["focus"]);

    if (focusRecord === undefined) {
      issues.push(issue("invalid-type", `${path}.focus`));
    } else {
      collectUnknownKeys(
        focusRecord,
        new Set(["x", "y"]),
        `${path}.focus.`,
        issues,
      );
      const bounds = {
        maximum: mediaLimits.focusMaximum,
        minimum: mediaLimits.focusMinimum,
      };
      const x = readNumber(focusRecord["x"], `${path}.focus.x`, bounds, issues);
      const y = readNumber(focusRecord["y"], `${path}.focus.y`, bounds, issues);

      if (x !== undefined && y !== undefined) {
        focus = Object.freeze({ x, y });
      }
    }
  }

  let zoom = mediaDefaults.zoom;
  if (record["zoom"] !== undefined) {
    const parsedZoom = readNumber(
      record["zoom"],
      `${path}.zoom`,
      { maximum: mediaLimits.zoomMaximum, minimum: mediaLimits.zoomMinimum },
      issues,
    );

    if (parsedZoom !== undefined) {
      zoom = parsedZoom;
    }
  }

  if (reference === undefined || alt === undefined) {
    return undefined;
  }

  return Object.freeze({ alt, fit, focus, reference, zoom });
}

function parseContent(
  value: unknown,
  spec: LayoutSpec,
  issues: DesignIssue[],
): DesignContent | undefined {
  const record = asRecord(value);

  if (record === undefined) {
    issues.push(issue("invalid-type", "content"));
    return undefined;
  }

  collectUnknownKeys(record, knownContentFields, "content.", issues);

  const allowedFields: ReadonlySet<string> = new Set([
    ...spec.requiredFields,
    ...spec.optionalFields,
  ]);

  for (const key of Object.keys(record)) {
    if (knownContentFields.has(key) && !allowedFields.has(key)) {
      issues.push(issue("field-not-supported", `content.${key}`));
    }
  }

  for (const key of spec.requiredFields) {
    if (record[key] === undefined) {
      issues.push(issue("missing", `content.${key}`));
    }
  }

  const texts = new Map<ContentFieldKey, string>();

  for (const key of textFieldKeys) {
    const rawValue = record[key];

    if (rawValue === undefined || !allowedFields.has(key)) {
      continue;
    }

    const text = readText(rawValue, `content.${key}`, issues);
    if (text !== undefined) {
      texts.set(key, text);
    }
  }

  let icon: DesignContent["icon"];
  if (record["icon"] !== undefined && allowedFields.has("icon")) {
    if (isIconName(record["icon"])) {
      icon = record["icon"];
    } else {
      issues.push(issue("invalid-value", "content.icon"));
    }
  }

  let items: readonly string[] | undefined;
  if (record["items"] !== undefined && allowedFields.has("items")) {
    items = readItems(record["items"], "content.items", issues);
  }

  const title = texts.get("title");

  if (title === undefined) {
    return undefined;
  }

  return Object.freeze({
    ...Object.fromEntries(texts),
    ...(icon === undefined ? {} : { icon }),
    ...(items === undefined ? {} : { items }),
    title,
  });
}

function parseMedia(
  value: unknown,
  spec: LayoutSpec,
  issues: DesignIssue[],
): readonly MediaAsset[] | undefined {
  if (value === undefined) {
    if (spec.media.minimum > 0) {
      issues.push(issue("missing", "media"));
      return undefined;
    }

    return Object.freeze([]);
  }

  if (!Array.isArray(value)) {
    issues.push(issue("invalid-type", "media"));
    return undefined;
  }

  if (spec.media.maximum === 0 && value.length > 0) {
    issues.push(issue("media-not-supported", "media"));
    return undefined;
  }

  if (value.length > spec.media.maximum) {
    issues.push(issue("too-many", "media"));
    return undefined;
  }

  if (value.length < spec.media.minimum) {
    issues.push(issue("missing", "media"));
    return undefined;
  }

  const media: MediaAsset[] = [];

  for (const [index, entry] of value.entries()) {
    const asset = parseMediaAsset(entry, `media[${index}]`, issues);
    if (asset !== undefined) {
      media.push(asset);
    }
  }

  return media.length === value.length ? Object.freeze(media) : undefined;
}

function parseLayout(
  value: unknown,
  issues: DesignIssue[],
): LayoutId | undefined {
  if (!isLayoutId(value)) {
    issues.push(issue("unknown-layout", "layout"));
    return undefined;
  }

  return value;
}

function parseFormat(
  value: unknown,
  spec: LayoutSpec | undefined,
  issues: DesignIssue[],
): FormatId | undefined {
  if (value === undefined) {
    issues.push(issue("missing", "format"));
    return undefined;
  }

  if (!isFormatId(value)) {
    issues.push(issue("invalid-value", "format"));
    return undefined;
  }

  if (spec !== undefined && !supportsFormat(spec, value)) {
    issues.push(issue("layout-format-mismatch", "format"));
    return undefined;
  }

  return value;
}

function parseTheme(
  value: unknown,
  issues: DesignIssue[],
): ThemeId | undefined {
  if (value === undefined) {
    return DEFAULT_THEME_ID;
  }

  if (!isThemeId(value)) {
    issues.push(issue("unknown-theme", "theme"));
    return undefined;
  }

  return value;
}

function parseSlug(value: unknown, issues: DesignIssue[]): string | undefined {
  if (typeof value !== "string") {
    issues.push(issue("invalid-type", "slug"));
    return undefined;
  }

  if (!contentLimits.slugPattern.test(value)) {
    issues.push(issue("invalid-format", "slug"));
    return undefined;
  }

  return value;
}

export function parseDesignDocument(value: unknown): DesignDocumentParseResult {
  const issues: DesignIssue[] = [];
  const record = asRecord(value);

  if (record === undefined) {
    return {
      issues: Object.freeze([issue("invalid-type", "document")]),
      ok: false,
    };
  }

  collectUnknownKeys(record, documentKeys, "", issues);

  if (record["schemaVersion"] !== DESIGN_SCHEMA_VERSION) {
    issues.push(issue("schema-version-unsupported", "schemaVersion"));
  }

  const slug = parseSlug(record["slug"], issues);
  const layout = parseLayout(record["layout"], issues);
  const spec = layout === undefined ? undefined : layoutSpecFor(layout);
  const format = parseFormat(record["format"], spec, issues);
  const theme = parseTheme(record["theme"], issues);
  const content =
    spec === undefined
      ? undefined
      : parseContent(record["content"], spec, issues);
  const media =
    spec === undefined ? undefined : parseMedia(record["media"], spec, issues);

  if (
    issues.length > 0 ||
    slug === undefined ||
    layout === undefined ||
    format === undefined ||
    theme === undefined ||
    content === undefined ||
    media === undefined
  ) {
    return { issues: Object.freeze([...issues]), ok: false };
  }

  return {
    document: Object.freeze({
      content,
      format,
      layout,
      media,
      schemaVersion: DESIGN_SCHEMA_VERSION,
      slug,
      theme,
    }),
    ok: true,
  };
}
