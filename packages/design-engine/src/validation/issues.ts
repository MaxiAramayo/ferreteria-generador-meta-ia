/**
 * Problemas de validación de un documento.
 *
 * Un problema nombra el campo y la causa, nunca el valor recibido: un
 * documento puede contener texto comercial o datos de contacto que no deben
 * duplicarse en logs.
 */

export type DesignIssueCode =
  | "field-not-supported"
  | "invalid-format"
  | "invalid-type"
  | "invalid-value"
  | "layout-format-mismatch"
  | "media-not-supported"
  | "missing"
  | "schema-version-unsupported"
  | "too-long"
  | "too-many"
  | "unknown-field"
  | "unknown-layout"
  | "unknown-theme";

export interface DesignIssue {
  readonly code: DesignIssueCode;
  /** Ruta del campo dentro del documento, por ejemplo `content.title`. */
  readonly path: string;
}

export function issue(code: DesignIssueCode, path: string): DesignIssue {
  return Object.freeze({ code, path });
}

export function describeIssues(issues: readonly DesignIssue[]): string {
  return issues.map(({ code, path }) => `${path}: ${code}`).join("; ");
}
