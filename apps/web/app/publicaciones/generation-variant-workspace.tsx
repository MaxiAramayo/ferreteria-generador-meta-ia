"use client";

import type {
  ContentBriefRunResponse,
  GenerationRunResponse,
  GenerationVariantResponse,
} from "@aramayo/contracts";
import {
  composedCopyCapacityFor,
  composedTitleBudget,
  contentBriefLimits,
  frameLayoutIds,
  generationRunLimits,
  type ComposedLayoutId,
  type FrameLayoutId,
} from "@aramayo/domain";
import Image from "next/image";
import {
  startTransition,
  useCallback,
  useEffect,
  useState,
  type SyntheticEvent,
} from "react";

import {
  loadContentBriefRun,
  requestContentBrief,
} from "../../lib/content-brief-api";
import {
  loadGenerationLineage,
  loadGenerationRun,
  requestGenerationCompositionEdit,
  requestGenerationEdit,
  requestGenerationRun,
  selectGenerationVariant,
  shouldPollGenerationRun,
} from "../../lib/generation-run-api";
import { availableGenerationVariantActions } from "../../lib/generation-variant-presentation";

/** Nombre de cada marco tal como lo elige quien revisa la variante. */
const frameLayoutLabels: Readonly<Record<FrameLayoutId, string>> = {
  "marco-columna-derecha": "Columna a la derecha",
  "marco-columna-izquierda": "Columna a la izquierda",
  "marco-etiqueta": "Etiqueta",
  "marco-firma": "Firma",
  "marco-sello": "Sello",
  "marco-velo-inferior": "Velo inferior",
  "marco-velo-superior": "Velo superior",
  "marco-vitrina": "Vitrina",
  "marco-zocalo": "Zócalo",
};

/** Cómo se nombra cada tipo de edición en el historial. */
const editKindLabels: Readonly<
  Record<NonNullable<GenerationRunResponse["edit"]>["kind"], string>
> = {
  composition: "Cambio de marco y textos",
  factual: "Cambio de datos",
  visual: "Cambio de imagen",
};

function isFrameLayoutId(value: string): value is FrameLayoutId {
  return (frameLayoutIds as readonly string[]).includes(value);
}

/** Lo que se completa al abrir el formulario de marco y textos. */
type CompositionDraft = Readonly<{
  badge: string;
  callToAction: string;
  layout: FrameLayoutId;
  runId: string;
  subtitle: string;
  title: string;
  variantId: string;
}>;

/**
 * Copy con que arranca el formulario.
 *
 * Si la variante ya viene de cambiar marco y textos, se sigue editando ese
 * mismo copy. Si no, se parte del brief: es lo que hoy se ve en la pieza.
 */
function compositionDraftFor(
  run: GenerationRunResponse,
  variant: GenerationVariantResponse,
  briefRun: ContentBriefRunResponse,
): CompositionDraft {
  const composedLayout = variant.composition?.layout ?? "";
  const layout = isFrameLayoutId(composedLayout)
    ? composedLayout
    : frameLayoutIds[0];
  if (run.edit?.kind === "composition") {
    return {
      badge: run.edit.copy.badge ?? "",
      callToAction: run.edit.copy.callToAction,
      layout,
      runId: run.id,
      subtitle: run.edit.copy.subtitle ?? "",
      title: run.edit.copy.title,
      variantId: variant.id,
    };
  }
  return {
    badge: "",
    callToAction: briefRun.brief?.callToAction.label ?? "",
    layout,
    runId: run.id,
    subtitle: briefRun.brief?.subtitle ?? "",
    title: briefRun.brief?.title ?? "",
    variantId: variant.id,
  };
}

/** Cuánto texto sostiene el marco elegido, para mostrarlo junto al campo. */
function titleBudgetFor(layout: FrameLayoutId): number {
  return Math.min(
    contentBriefLimits.titleMaximum,
    composedTitleBudget[layout as ComposedLayoutId],
  );
}

function editSummary(run: GenerationRunResponse): string {
  if (run.edit === null) {
    return "Generación original";
  }
  if (run.edit.kind === "composition") {
    const label = isFrameLayoutId(run.edit.layout)
      ? frameLayoutLabels[run.edit.layout]
      : run.edit.layout;
    return `${label}: ${run.edit.copy.title}`;
  }
  return run.edit.instruction;
}

const pollMilliseconds = 2_000;

function mutationMessage(
  result: Awaited<ReturnType<typeof requestGenerationRun>>,
): string {
  switch (result.kind) {
    case "conflict":
    case "error":
      return result.message;
    case "forbidden":
      return "La sesión no permite esta acción.";
    case "accepted":
    case "selected":
      return "La API devolvió un resultado inesperado.";
  }
}

type VariantRef = Readonly<{
  run: GenerationRunResponse;
  variant: GenerationVariantResponse;
}>;

type EditDraft = Readonly<{
  kind: "factual" | "visual";
  runId: string;
  variantId: string;
}>;

function money(run: GenerationRunResponse): string {
  return run.usage.estimatedCostUsd === null
    ? "Costo pendiente"
    : `USD ${run.usage.estimatedCostUsd.toFixed(4)}`;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function awaitRevalidatedBrief(
  apiBaseUrl: string,
  runId: string,
): Promise<ContentBriefRunResponse | null> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const loaded = await loadContentBriefRun(apiBaseUrl, runId);
    if (loaded.kind !== "ready") return null;
    if (loaded.run.status !== "pending") return loaded.run;
    await wait(pollMilliseconds);
  }
  return null;
}

function VariantActions({
  busy,
  canEdit,
  onCompare,
  onEdit,
  onEditComposition,
  onSelect,
  selectedForComparison,
  run,
  variant,
}: {
  readonly busy: boolean;
  readonly canEdit: boolean;
  readonly onCompare: () => void;
  readonly onEdit: (kind: "factual" | "visual") => void;
  readonly onEditComposition: () => void;
  readonly onSelect: () => void;
  readonly run: GenerationRunResponse;
  readonly selectedForComparison: boolean;
  readonly variant: GenerationVariantResponse;
}) {
  const availableActions = availableGenerationVariantActions(variant);
  if (availableActions.size === 0) return null;
  return (
    <div className="generation-variant-actions">
      <label>
        <input
          checked={selectedForComparison}
          disabled={busy}
          onChange={onCompare}
          type="checkbox"
        />
        Comparar
      </label>
      <button disabled={!canEdit || busy} onClick={onSelect} type="button">
        {run.selectedVariantId === variant.id ? "Seleccionada" : "Seleccionar"}
      </button>
      {availableActions.has("edit-composition") ? (
        <button
          disabled={!canEdit || busy}
          onClick={onEditComposition}
          type="button"
        >
          Cambiar marco y textos
        </button>
      ) : null}
      {availableActions.has("edit-visual") ? (
        <button
          disabled={!canEdit || busy}
          onClick={() => {
            onEdit("visual");
          }}
          type="button"
        >
          Cambiar imagen
        </button>
      ) : null}
      <button
        disabled={!canEdit || busy}
        onClick={() => {
          onEdit("factual");
        }}
        type="button"
      >
        Cambiar datos o producto
      </button>
    </div>
  );
}

function VariantCard({
  busy,
  canEdit,
  onCompare,
  onEdit,
  onEditComposition,
  onSelect,
  run,
  selectedForComparison,
  variant,
}: {
  readonly busy: boolean;
  readonly canEdit: boolean;
  readonly onCompare: () => void;
  readonly onEdit: (kind: "factual" | "visual") => void;
  readonly onEditComposition: () => void;
  readonly onSelect: () => void;
  readonly run: GenerationRunResponse;
  readonly selectedForComparison: boolean;
  readonly variant: GenerationVariantResponse;
}) {
  return (
    <article className="generation-variant-card" data-status={variant.status}>
      {variant.composition === null ? (
        <div className="generation-variant-placeholder">
          <strong>{variant.status}</strong>
          <p>
            {variant.failure?.correction ?? "La variante todavía no terminó."}
          </p>
        </div>
      ) : (
        <Image
          alt={`Variante ${String(variant.index + 1)} de la pieza generada`}
          height={variant.composition.height}
          src={variant.composition.previewUrl}
          unoptimized
          width={variant.composition.width}
        />
      )}
      <div>
        <p className="workspace-eyebrow">
          Variante {variant.index + 1} · {variant.source}
        </p>
        <h4>{editSummary(run)}</h4>
        <dl>
          <div>
            <dt>Prompt</dt>
            <dd>{run.plan?.promptVersion ?? "Pendiente"}</dd>
          </div>
          <div>
            <dt>Perfil</dt>
            <dd>
              {run.plan === null
                ? "Pendiente"
                : `${run.plan.profileId} · ${run.plan.profileVersion}`}
            </dd>
          </div>
          <div>
            <dt>Costo</dt>
            <dd>{money(run)}</dd>
          </div>
        </dl>
        <VariantActions
          busy={busy}
          canEdit={canEdit}
          onCompare={onCompare}
          onEdit={onEdit}
          onEditComposition={onEditComposition}
          onSelect={onSelect}
          run={run}
          selectedForComparison={selectedForComparison}
          variant={variant}
        />
      </div>
    </article>
  );
}

function Comparison({ entries }: { readonly entries: readonly VariantRef[] }) {
  if (entries.length === 0) return null;
  return (
    <section
      aria-labelledby="generation-comparison-title"
      className="generation-comparison"
    >
      <p className="workspace-eyebrow">Comparación</p>
      <h3 id="generation-comparison-title">
        {entries.length === 1
          ? "Elegí una segunda variante"
          : "Dos resultados, con su contexto completo"}
      </h3>
      <div>
        {entries.map(({ run, variant }) => (
          <article key={variant.id}>
            {variant.composition === null ? null : (
              <Image
                alt={`Resultado comparado ${String(variant.index + 1)}`}
                height={variant.composition.height}
                src={variant.composition.previewUrl}
                unoptimized
                width={variant.composition.width}
              />
            )}
            <strong>{editSummary(run)}</strong>
            <span>{run.plan?.promptVersion ?? "Prompt pendiente"}</span>
            <span>{run.plan?.profileId ?? "Perfil pendiente"}</span>
            <span>{money(run)}</span>
            <code>{variant.composition?.compositionHash.slice(0, 12)}</code>
          </article>
        ))}
      </div>
    </section>
  );
}

export function GenerationVariantWorkspace({
  apiBaseUrl,
  briefRun,
  canEdit,
}: {
  readonly apiBaseUrl: string;
  readonly briefRun: ContentBriefRunResponse;
  readonly canEdit: boolean;
}) {
  const [activeRun, setActiveRun] = useState<GenerationRunResponse | null>(
    null,
  );
  const [lineage, setLineage] = useState<readonly GenerationRunResponse[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [format, setFormat] = useState("feed");
  const [subjectKind, setSubjectKind] = useState("branded");
  const [variants, setVariants] = useState(2);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [instruction, setInstruction] = useState("");
  const [compositionDraft, setCompositionDraft] =
    useState<CompositionDraft | null>(null);
  const [comparisonIds, setComparisonIds] = useState<readonly string[]>([]);

  const refreshLineage = useCallback(
    (rootId: string) => {
      void loadGenerationLineage(apiBaseUrl, rootId).then((result) => {
        if (result.kind === "ready") {
          startTransition(() => {
            setLineage(result.history.items);
          });
        }
      });
    },
    [apiBaseUrl],
  );

  useEffect(() => {
    if (activeRun === null || !shouldPollGenerationRun(activeRun)) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void loadGenerationRun(apiBaseUrl, activeRun.id).then((result) => {
        if (cancelled) return;
        if (result.kind === "ready") {
          startTransition(() => {
            setActiveRun(result.run);
            if (!shouldPollGenerationRun(result.run)) {
              refreshLineage(result.run.lineageRootId);
            }
          });
        }
      });
    }, pollMilliseconds);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeRun, apiBaseUrl, refreshLineage]);

  const loadAccepted = useCallback(
    (runId: string) => {
      void loadGenerationRun(apiBaseUrl, runId).then((loaded) => {
        startTransition(() => {
          setBusy(false);
          if (loaded.kind === "ready") {
            setActiveRun(loaded.run);
            setLineage((current) =>
              current.some((entry) => entry.id === loaded.run.id)
                ? current
                : [loaded.run, ...current],
            );
            setNotice(
              "Ejecución creada. El worker está preparando las variantes.",
            );
          } else {
            setNotice(
              "La ejecución fue aceptada, pero todavía no se pudo consultar.",
            );
          }
        });
      });
    },
    [apiBaseUrl],
  );

  const requestRoot = useCallback(() => {
    setBusy(true);
    setNotice("Reservando variantes…");
    void requestGenerationRun(apiBaseUrl, {
      contentBriefRunId: briefRun.id,
      format,
      idempotencyKey: crypto.randomUUID(),
      subjectKind,
      variants,
    }).then((result) => {
      if (result.kind === "accepted") loadAccepted(result.runId);
      else {
        startTransition(() => {
          setBusy(false);
          setNotice(
            result.kind === "forbidden"
              ? "La sesión no permite generar imágenes."
              : mutationMessage(result),
          );
        });
      }
    });
  }, [apiBaseUrl, briefRun.id, format, loadAccepted, subjectKind, variants]);

  const submitEdit = useCallback(
    (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (editDraft === null) return;
      const normalized = instruction.replaceAll(/\s+/gu, " ").trim();
      if (normalized.length < 8) {
        setNotice("Describí el cambio con al menos 8 caracteres.");
        return;
      }
      setBusy(true);
      setNotice(
        editDraft.kind === "factual"
          ? "Revalidando evidencia comercial antes de generar…"
          : "Creando una ejecución hija para editar la imagen…",
      );

      const createEdit = (contentBriefRunId?: string): void => {
        void requestGenerationEdit(apiBaseUrl, {
          ...(contentBriefRunId === undefined ? {} : { contentBriefRunId }),
          idempotencyKey: crypto.randomUUID(),
          instruction: normalized,
          kind: editDraft.kind,
          parentRunId: editDraft.runId,
          parentVariantId: editDraft.variantId,
          variants,
        }).then((result) => {
          if (result.kind === "accepted") {
            setEditDraft(null);
            setInstruction("");
            loadAccepted(result.runId);
          } else {
            startTransition(() => {
              setBusy(false);
              setNotice(
                result.kind === "forbidden"
                  ? "La sesión no permite editar variantes."
                  : mutationMessage(result),
              );
            });
          }
        });
      };

      if (editDraft.kind === "visual") {
        createEdit();
        return;
      }
      const baseRequest = briefRun.request.replaceAll(/\s+/gu, " ").trim();
      const revalidationRequest =
        `Revalidá todos los hechos y aplicá este cambio: ${normalized}. Pedido base: ${baseRequest}`.slice(
          0,
          600,
        );
      void requestContentBrief(apiBaseUrl, {
        idempotencyKey: crypto.randomUUID(),
        request: revalidationRequest,
      }).then(async (result) => {
        if (result.kind !== "accepted") {
          startTransition(() => {
            setBusy(false);
            setNotice("No se pudo iniciar la revalidación factual.");
          });
          return;
        }
        const revalidated = await awaitRevalidatedBrief(
          apiBaseUrl,
          result.runId,
        );
        if (revalidated?.status !== "generated" || revalidated.brief === null) {
          startTransition(() => {
            setBusy(false);
            setNotice(
              "La evidencia nueva no produjo un brief utilizable. Revisá sus faltantes antes de editar.",
            );
          });
          return;
        }
        createEdit(revalidated.id);
      });
    },
    [
      apiBaseUrl,
      briefRun.request,
      editDraft,
      instruction,
      loadAccepted,
      variants,
    ],
  );

  const submitCompositionEdit = useCallback(
    (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (compositionDraft === null) return;
      const title = compositionDraft.title.replaceAll(/\s+/gu, " ").trim();
      const callToAction = compositionDraft.callToAction
        .replaceAll(/\s+/gu, " ")
        .trim();
      const subtitle = compositionDraft.subtitle
        .replaceAll(/\s+/gu, " ")
        .trim();
      const badge = compositionDraft.badge.replaceAll(/\s+/gu, " ").trim();
      const capacity = composedCopyCapacityFor(compositionDraft.layout);
      if (
        title.length < contentBriefLimits.titleMinimum ||
        title.length > titleBudgetFor(compositionDraft.layout)
      ) {
        setNotice(
          `El título debe tener entre ${String(contentBriefLimits.titleMinimum)} y ${String(titleBudgetFor(compositionDraft.layout))} caracteres para este marco.`,
        );
        return;
      }
      if (
        callToAction.length < contentBriefLimits.callToActionLabelMinimum ||
        callToAction.length > contentBriefLimits.callToActionLabelMaximum
      ) {
        setNotice(
          `El botón debe tener entre ${String(contentBriefLimits.callToActionLabelMinimum)} y ${String(contentBriefLimits.callToActionLabelMaximum)} caracteres.`,
        );
        return;
      }
      setBusy(true);
      setNotice("Recomponiendo la pieza con el marco y los textos elegidos…");
      void requestGenerationCompositionEdit(apiBaseUrl, {
        badge: capacity.badge && badge.length > 0 ? badge : null,
        callToAction,
        idempotencyKey: crypto.randomUUID(),
        layout: compositionDraft.layout,
        parentRunId: compositionDraft.runId,
        parentVariantId: compositionDraft.variantId,
        subtitle:
          capacity.subtitleMaximum > 0 && subtitle.length > 0 ? subtitle : null,
        title,
      }).then((result) => {
        if (result.kind === "accepted") {
          setCompositionDraft(null);
          loadAccepted(result.runId);
        } else {
          startTransition(() => {
            setBusy(false);
            setNotice(
              result.kind === "forbidden"
                ? "La sesión no permite editar variantes."
                : mutationMessage(result),
            );
          });
        }
      });
    },
    [apiBaseUrl, compositionDraft, loadAccepted],
  );

  const allVariants: readonly VariantRef[] = lineage.flatMap((run) =>
    run.variants.map((variant) => ({ run, variant })),
  );
  const compared = comparisonIds.flatMap((id) => {
    const entry = allVariants.find(({ variant }) => variant.id === id);
    return entry === undefined ? [] : [entry];
  });

  return (
    <section
      aria-labelledby="generation-variants-title"
      className="generation-workspace"
    >
      <div className="generation-workspace-heading">
        <div>
          <p className="workspace-eyebrow">Fase 4</p>
          <h3 id="generation-variants-title">Variantes visuales trazables</h3>
          <p>
            Generar, editar y seleccionar son acciones separadas. Ninguna
            aprueba ni publica la pieza.
          </p>
        </div>
        <div className="generation-controls">
          <label>
            Formato
            <select
              disabled={busy || activeRun !== null}
              onChange={(event) => {
                setFormat(event.currentTarget.value);
              }}
              value={format}
            >
              <option value="feed">Feed vertical</option>
              <option value="cuadrado">Cuadrado</option>
              <option value="historia">Historia</option>
            </select>
          </label>
          <label>
            Producto
            <select
              disabled={busy || activeRun !== null}
              onChange={(event) => {
                setSubjectKind(event.currentTarget.value);
              }}
              value={subjectKind}
            >
              <option value="branded">De marca: exige foto real</option>
              <option value="generic">Genérico: puede generarse</option>
            </select>
          </label>
          <label>
            Variantes
            <select
              disabled={busy}
              onChange={(event) => {
                setVariants(Number(event.currentTarget.value));
              }}
              value={variants}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </label>
          {activeRun === null ? (
            <button
              className="workspace-primary-action"
              disabled={!canEdit || busy}
              onClick={requestRoot}
              type="button"
            >
              Generar variantes
            </button>
          ) : null}
        </div>
      </div>

      {notice === null ? null : (
        <p aria-live="polite" className="composer-notice" role="status">
          {notice}
        </p>
      )}

      {editDraft === null ? null : (
        <form className="generation-edit-form" onSubmit={submitEdit}>
          <div>
            <p className="workspace-eyebrow">
              {editDraft.kind === "visual" ? "Cambio visual" : "Cambio factual"}
            </p>
            <h4>
              {editDraft.kind === "visual"
                ? "La imagen cambia; el brief se conserva"
                : "Producto, precio o promoción vuelven a validar evidencia"}
            </h4>
          </div>
          <label>
            Instrucción
            <textarea
              disabled={busy}
              maxLength={600}
              onChange={(event) => {
                setInstruction(event.currentTarget.value);
              }}
              rows={3}
              value={instruction}
            />
          </label>
          <div className="composer-form-actions">
            <button
              disabled={busy}
              onClick={() => {
                setEditDraft(null);
              }}
              type="button"
            >
              Cancelar
            </button>
            <button
              className="workspace-primary-action"
              disabled={busy}
              type="submit"
            >
              {editDraft.kind === "factual"
                ? "Revalidar y generar"
                : "Crear edición"}
            </button>
          </div>
        </form>
      )}

      {compositionDraft === null ? null : (
        <form
          className="generation-edit-form generation-composition-form"
          onSubmit={submitCompositionEdit}
        >
          <div>
            <p className="workspace-eyebrow">Marco y textos</p>
            <h4>El precio y la vigencia se recomponen solos, desde el brief</h4>
          </div>
          <label>
            Marco
            <select
              disabled={busy}
              onChange={(event) => {
                const layout = event.currentTarget.value;
                if (isFrameLayoutId(layout)) {
                  setCompositionDraft((current) =>
                    current === null ? current : { ...current, layout },
                  );
                }
              }}
              value={compositionDraft.layout}
            >
              {frameLayoutIds.map((layout) => (
                <option key={layout} value={layout}>
                  {frameLayoutLabels[layout]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Título ({compositionDraft.title.length}/
            {titleBudgetFor(compositionDraft.layout)})
            <input
              disabled={busy}
              maxLength={titleBudgetFor(compositionDraft.layout)}
              onChange={(event) => {
                const title = event.currentTarget.value;
                setCompositionDraft((current) =>
                  current === null ? current : { ...current, title },
                );
              }}
              type="text"
              value={compositionDraft.title}
            />
          </label>
          {composedCopyCapacityFor(compositionDraft.layout).subtitleMaximum ===
          0 ? null : (
            <label>
              Bajada
              <input
                disabled={busy}
                maxLength={Math.min(
                  contentBriefLimits.subtitleMaximum,
                  composedCopyCapacityFor(compositionDraft.layout)
                    .subtitleMaximum,
                )}
                onChange={(event) => {
                  const subtitle = event.currentTarget.value;
                  setCompositionDraft((current) =>
                    current === null ? current : { ...current, subtitle },
                  );
                }}
                type="text"
                value={compositionDraft.subtitle}
              />
            </label>
          )}
          {!composedCopyCapacityFor(compositionDraft.layout).badge ? null : (
            <label>
              Etiqueta (opcional)
              <input
                disabled={busy}
                maxLength={generationRunLimits.compositionBadgeMaximum}
                onChange={(event) => {
                  const badge = event.currentTarget.value;
                  setCompositionDraft((current) =>
                    current === null ? current : { ...current, badge },
                  );
                }}
                type="text"
                value={compositionDraft.badge}
              />
            </label>
          )}
          <label>
            Llamado a la acción
            <input
              disabled={busy}
              maxLength={contentBriefLimits.callToActionLabelMaximum}
              onChange={(event) => {
                const callToAction = event.currentTarget.value;
                setCompositionDraft((current) =>
                  current === null ? current : { ...current, callToAction },
                );
              }}
              type="text"
              value={compositionDraft.callToAction}
            />
          </label>
          <div className="composer-form-actions">
            <button
              disabled={busy}
              onClick={() => {
                setCompositionDraft(null);
              }}
              type="button"
            >
              Cancelar
            </button>
            <button
              className="workspace-primary-action"
              disabled={busy}
              type="submit"
            >
              Recomponer
            </button>
          </div>
        </form>
      )}

      {lineage.length === 0 ? (
        <div className="generation-empty">
          <strong>Todavía no hay variantes.</strong>
          <p>
            El brief está listo; elegí los controles y generá el primer lote.
          </p>
        </div>
      ) : (
        <div className="generation-lineage">
          {lineage
            .toSorted((left, right) =>
              left.requestedAt.localeCompare(right.requestedAt),
            )
            .map((run) => (
              <section key={run.id}>
                <header>
                  <span data-status={run.status}>{run.status}</span>
                  <strong>
                    {run.edit === null
                      ? "Origen"
                      : `Hija · ${editKindLabels[run.edit.kind]}`}
                  </strong>
                  <small>
                    {new Date(run.requestedAt).toLocaleString("es-AR")} ·{" "}
                    {money(run)}
                  </small>
                </header>
                <div className="generation-variant-grid">
                  {run.variants.map((variant) => (
                    <VariantCard
                      busy={busy}
                      canEdit={canEdit}
                      key={variant.id}
                      onCompare={() => {
                        setComparisonIds((current) =>
                          current.includes(variant.id)
                            ? current.filter((id) => id !== variant.id)
                            : current.length < 2
                              ? [...current, variant.id]
                              : [current[1] ?? variant.id, variant.id],
                        );
                      }}
                      onEdit={(kind) => {
                        setEditDraft({
                          kind,
                          runId: run.id,
                          variantId: variant.id,
                        });
                      }}
                      onEditComposition={() => {
                        setCompositionDraft(
                          compositionDraftFor(run, variant, briefRun),
                        );
                      }}
                      onSelect={() => {
                        setBusy(true);
                        void selectGenerationVariant(apiBaseUrl, {
                          expectedSelectionVersion: run.selectionVersion,
                          idempotencyKey: crypto.randomUUID(),
                          runId: run.id,
                          variantId: variant.id,
                        }).then((result) => {
                          startTransition(() => {
                            setBusy(false);
                            if (result.kind === "selected") {
                              setLineage((current) =>
                                current.map((entry) =>
                                  entry.id === run.id
                                    ? {
                                        ...entry,
                                        selectedVariantId: variant.id,
                                        selectionVersion:
                                          result.selectionVersion,
                                      }
                                    : entry,
                                ),
                              );
                              setNotice(
                                "Variante seleccionada. Las demás siguen en el historial.",
                              );
                            } else {
                              setNotice(
                                result.kind === "forbidden"
                                  ? "La sesión no permite seleccionar."
                                  : mutationMessage(result),
                              );
                            }
                          });
                        });
                      }}
                      run={run}
                      selectedForComparison={comparisonIds.includes(variant.id)}
                      variant={variant}
                    />
                  ))}
                </div>
              </section>
            ))}
        </div>
      )}
      <Comparison entries={compared} />
    </section>
  );
}
