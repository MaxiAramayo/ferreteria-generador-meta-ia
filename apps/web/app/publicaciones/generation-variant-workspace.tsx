"use client";

import type {
  ContentBriefRunResponse,
  GenerationRunResponse,
  GenerationVariantResponse,
} from "@aramayo/contracts";
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
  requestGenerationEdit,
  requestGenerationRun,
  selectGenerationVariant,
  shouldPollGenerationRun,
} from "../../lib/generation-run-api";
import { availableGenerationVariantActions } from "../../lib/generation-variant-presentation";

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
  onSelect,
  selectedForComparison,
  run,
  variant,
}: {
  readonly busy: boolean;
  readonly canEdit: boolean;
  readonly onCompare: () => void;
  readonly onEdit: (kind: "factual" | "visual") => void;
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
  onSelect,
  run,
  selectedForComparison,
  variant,
}: {
  readonly busy: boolean;
  readonly canEdit: boolean;
  readonly onCompare: () => void;
  readonly onEdit: (kind: "factual" | "visual") => void;
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
        <h4>{run.edit?.instruction ?? "Generación original"}</h4>
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
            <strong>{run.edit?.instruction ?? "Generación original"}</strong>
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
                    {run.edit === null ? "Origen" : `Hija · ${run.edit.kind}`}
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
