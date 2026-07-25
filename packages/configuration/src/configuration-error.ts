export type ConfigurationIssueCode =
  | "empty"
  | "forbidden-public-variable"
  | "invalid"
  | "missing"
  | "partial-group";

export interface ConfigurationIssue {
  readonly code: ConfigurationIssueCode;
  readonly variable: string;
}

const issueDescriptions: Readonly<Record<ConfigurationIssueCode, string>> =
  Object.freeze({
    empty: "no puede estar vacía",
    "forbidden-public-variable": "no pertenece al contrato público",
    invalid: "tiene un formato inválido",
    missing: "es obligatoria",
    "partial-group": "es obligatoria cuando se configura su integración",
  });

export class ConfigurationError extends Error {
  readonly issues: readonly ConfigurationIssue[];
  readonly processName: string;

  constructor(processName: string, issues: readonly ConfigurationIssue[]) {
    const issueSummary = issues
      .map(({ code, variable }) => `${variable} ${issueDescriptions[code]}`)
      .join("; ");

    super(`Configuración inválida para ${processName}: ${issueSummary}.`);
    this.name = "ConfigurationError";
    this.processName = processName;
    this.issues = Object.freeze(
      issues.map((issue) => Object.freeze({ ...issue })),
    );
  }
}
