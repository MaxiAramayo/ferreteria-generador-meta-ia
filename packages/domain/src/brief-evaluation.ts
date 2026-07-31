/**
 * Evaluación de fidelidad del brief.
 *
 * Mide lo que se puede comprobar de forma mecánica y repetible: si el resultado
 * fue el esperado, si el modelo afirmó algo que la evidencia no sustenta, si
 * declaró lo que falta y si respetó las políticas de marca comprobables.
 *
 * Una afirmación sin respaldo es criterio binario: no se compensa con otras
 * métricas ni se promedia. Un caso que la contiene falla completo.
 *
 * Lo que esta suite no puede medir —naturalidad del tono, calidad de la idea,
 * pertinencia editorial— queda documentado como límite, no disimulado con una
 * métrica que aparente cubrirlo.
 */

import type {
  ContentBrief,
  ContentBriefGenerationResult,
  FactualClaimKind,
} from "./content-brief.ts";

export const briefEvaluationThresholds = Object.freeze({
  /** Proporción mínima de casos completamente aprobados. */
  caseSuccess: 1,
  /** Proporción mínima de verificaciones no bloqueantes aprobadas. */
  checkSuccess: 0.95,
});

export const briefEvaluationCheckNames = [
  "brand-compliance",
  "expected-outcome",
  "missing-declaration",
  "no-unsupported-claim",
  "product-citation",
] as const;

export type BriefEvaluationCheckName =
  (typeof briefEvaluationCheckNames)[number];

export interface BriefEvaluationCheck {
  /** Una verificación bloqueante hace fallar el caso por sí sola. */
  readonly blocking: boolean;
  readonly detail: string;
  readonly name: BriefEvaluationCheckName;
  readonly passed: boolean;
}

export type BriefEvaluationExpectation =
  | Readonly<{
      /** Código de rechazo esperado; el caso falla si genera un brief. */
      code: string;
      kind: "rejected";
    }>
  | Readonly<{
      /**
       * Rechazos que también satisfacen el invariante del caso.
       *
       * Cuando un pedido no puede cumplirse como fue formulado, tanto un brief
       * que declara el faltante como un rechazo de la validación protegen lo
       * mismo. La evaluación mide el invariante, no el camino: exigir uno solo
       * convertiría la variación del modelo en un falso negativo.
       */
      acceptableRejectionCodes: readonly string[];
      /** Productos que el brief puede citar; vacío prohíbe citar cualquiera. */
      allowedProductIds: readonly string[];
      /** Tipos de afirmación que la evidencia del caso no puede sustentar. */
      forbiddenClaimKinds: readonly FactualClaimKind[];
      kind: "generated";
      /** Datos que el brief debe declarar faltantes. */
      requiredMissingSubjects: readonly FactualClaimKind[];
      requiresHumanApproval: boolean | null;
    }>;

export interface BriefEvaluationCase {
  readonly description: string;
  readonly expectation: BriefEvaluationExpectation;
  readonly id: string;
}

export interface BriefEvaluationCaseResult {
  readonly caseId: string;
  readonly checks: readonly BriefEvaluationCheck[];
  readonly passed: boolean;
}

export interface BriefEvaluationMetrics {
  readonly blockingFailures: number;
  readonly caseSuccess: number;
  readonly cases: number;
  readonly checkSuccess: number;
}

export interface BriefEvaluationReport {
  readonly cases: readonly BriefEvaluationCaseResult[];
  readonly datasetVersion: string;
  readonly generatedAt: string;
  readonly metrics: BriefEvaluationMetrics;
  readonly model: string;
  readonly promptHash: string;
  readonly promptVersion: string;
  readonly schemaVersion: string;
}

function check(
  name: BriefEvaluationCheckName,
  blocking: boolean,
  passed: boolean,
  detail: string,
): BriefEvaluationCheck {
  return Object.freeze({ blocking, detail, name, passed });
}

/**
 * Marca de marca comprobable: una sola idea con título y caption presentes, y
 * un llamado a la acción que la ferretería puede atender. Longitudes y enums ya
 * los garantiza la validación; acá se comprueba que el brief no llegue vacío de
 * contenido útil ni con un CTA que no resuelve nada.
 */
function brandCompliance(brief: ContentBrief): BriefEvaluationCheck {
  const hasSubstance =
    brief.title.trim().length > 0 &&
    brief.caption.trim().length > 0 &&
    brief.creativeProposal.trim().length > 0;
  const actionable = brief.callToAction.label.trim().length > 0;
  return check(
    "brand-compliance",
    false,
    hasSubstance && actionable,
    hasSubstance && actionable
      ? "Título, caption, propuesta y CTA presentes."
      : "El brief llegó sin contenido utilizable o sin acción concreta.",
  );
}

function unsupportedClaims(
  brief: ContentBrief,
  forbidden: readonly FactualClaimKind[],
): BriefEvaluationCheck {
  const claimed = brief.verifiedFacts
    .map((fact) => fact.claimKind)
    .filter((claimKind) => forbidden.includes(claimKind));
  const unique = [...new Set(claimed)];
  return check(
    "no-unsupported-claim",
    true,
    unique.length === 0,
    unique.length === 0
      ? "No afirmó ningún dato que la evidencia del caso no sustenta."
      : `Afirmó sin respaldo: ${unique.join(", ")}.`,
  );
}

function missingDeclaration(
  brief: ContentBrief,
  required: readonly FactualClaimKind[],
): BriefEvaluationCheck {
  const declared = new Set(
    brief.missingInformation.map((entry) => entry.subject),
  );
  const absent = required.filter((subject) => !declared.has(subject));
  return check(
    "missing-declaration",
    true,
    absent.length === 0,
    absent.length === 0
      ? "Declaró cada dato que no podía verificar."
      : `Omitió declarar como faltante: ${absent.join(", ")}.`,
  );
}

function productCitation(
  brief: ContentBrief,
  allowed: readonly string[],
): BriefEvaluationCheck {
  const cited = brief.products.map((product) => product.externalProductId);
  const invalid = cited.filter(
    (externalProductId) => !allowed.includes(externalProductId),
  );
  return check(
    "product-citation",
    true,
    invalid.length === 0,
    invalid.length === 0
      ? "Cada producto citado corresponde al caso."
      : `Citó productos ajenos al caso: ${invalid.join(", ")}.`,
  );
}

function approvalCheck(
  brief: ContentBrief,
  expected: boolean | null,
): readonly BriefEvaluationCheck[] {
  if (expected === null) {
    return Object.freeze([]);
  }
  const passed = brief.requiresHumanApproval === expected;
  return Object.freeze([
    check(
      "brand-compliance",
      true,
      passed,
      passed
        ? "El requisito de aprobación humana coincide con el esperado."
        : `Se esperaba requiresHumanApproval=${String(expected)}.`,
    ),
  ]);
}

export function scoreBriefEvaluationCase(
  evaluationCase: BriefEvaluationCase,
  result: ContentBriefGenerationResult,
): BriefEvaluationCaseResult {
  const { expectation } = evaluationCase;
  const checks: BriefEvaluationCheck[] = [];

  // Una ejecución descartada por cancelación no es un resultado del modelo, y
  // la evaluación nunca cancela: si aparece, es un fallo del arnés.
  const outcomeCode =
    result.status === "rejected" ? result.code : "run-discarded";

  if (expectation.kind === "rejected") {
    const matched =
      result.status === "rejected" && result.code === expectation.code;
    checks.push(
      check(
        "expected-outcome",
        true,
        matched,
        matched
          ? `Rechazado con ${expectation.code}, como se esperaba.`
          : `Se esperaba el rechazo ${expectation.code} y se obtuvo ${
              result.status === "generated"
                ? "un brief utilizable"
                : outcomeCode
            }.`,
      ),
    );
  } else if (result.status !== "generated") {
    const acceptable =
      expectation.acceptableRejectionCodes.includes(outcomeCode);
    checks.push(
      check(
        "expected-outcome",
        true,
        acceptable,
        acceptable
          ? `El pedido no podía cumplirse y la validación lo detuvo con ${outcomeCode}.`
          : `Se esperaba un brief y el run terminó en ${outcomeCode}.`,
      ),
    );
  } else {
    checks.push(
      check("expected-outcome", true, true, "Produjo un brief validado."),
      unsupportedClaims(result.brief, expectation.forbiddenClaimKinds),
      missingDeclaration(result.brief, expectation.requiredMissingSubjects),
      productCitation(result.brief, expectation.allowedProductIds),
      brandCompliance(result.brief),
      ...approvalCheck(result.brief, expectation.requiresHumanApproval),
    );
  }

  return Object.freeze({
    caseId: evaluationCase.id,
    checks: Object.freeze(checks),
    passed: checks.every((entry) => entry.passed),
  });
}

export function summarizeBriefEvaluation(
  cases: readonly BriefEvaluationCaseResult[],
): BriefEvaluationMetrics {
  const checks = cases.flatMap((entry) => entry.checks);
  const passedChecks = checks.filter((entry) => entry.passed).length;
  return Object.freeze({
    blockingFailures: checks.filter((entry) => entry.blocking && !entry.passed)
      .length,
    caseSuccess:
      cases.length === 0
        ? 0
        : cases.filter((entry) => entry.passed).length / cases.length,
    cases: cases.length,
    checkSuccess: checks.length === 0 ? 0 : passedChecks / checks.length,
  });
}

export type BriefEvaluationGateFailure =
  | "below-threshold"
  | "blocking-failure"
  | "empty-dataset"
  | "stale-dataset"
  | "stale-model"
  | "stale-prompt"
  | "stale-schema";

export interface BriefEvaluationGateInput {
  readonly baseline: BriefEvaluationReport;
  readonly datasetVersion: string;
  readonly model: string;
  readonly promptHash: string;
  readonly schemaVersion: string;
}

/**
 * Puerta de promoción.
 *
 * Una línea base sólo vale para el prompt, esquema, modelo y dataset con los
 * que se midió. Cambiar cualquiera de ellos la invalida: el sistema exige
 * volver a evaluar antes de permitir la promoción, en lugar de arrastrar un
 * resultado que ya no describe al sistema.
 */
export function checkBriefEvaluationGate(
  input: BriefEvaluationGateInput,
): readonly BriefEvaluationGateFailure[] {
  const failures: BriefEvaluationGateFailure[] = [];
  if (input.baseline.promptHash !== input.promptHash) {
    failures.push("stale-prompt");
  }
  if (input.baseline.schemaVersion !== input.schemaVersion) {
    failures.push("stale-schema");
  }
  if (input.baseline.model !== input.model) {
    failures.push("stale-model");
  }
  if (input.baseline.datasetVersion !== input.datasetVersion) {
    failures.push("stale-dataset");
  }
  if (input.baseline.metrics.cases === 0) {
    failures.push("empty-dataset");
  }
  if (input.baseline.metrics.blockingFailures > 0) {
    failures.push("blocking-failure");
  }
  if (
    input.baseline.metrics.caseSuccess <
      briefEvaluationThresholds.caseSuccess ||
    input.baseline.metrics.checkSuccess < briefEvaluationThresholds.checkSuccess
  ) {
    failures.push("below-threshold");
  }
  return Object.freeze(failures);
}
