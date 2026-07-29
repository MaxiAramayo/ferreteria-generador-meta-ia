"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";

import {
  allowedComposerActions,
  type PublicationComposerState,
  type PublicationComposerVariant,
} from "../../lib/publication-composer-contract";
import { saveTemplatePublicationDraft } from "../../lib/publication-workspace-api";
import {
  PublicationComposerContextProvider,
  usePublicationComposerActions,
  usePublicationComposerMeta,
  usePublicationComposerState,
} from "./publication-composer-context";
import {
  KnowledgeEvidencePanel,
  type KnowledgeEvidencePanelState,
} from "./knowledge-evidence-panel";

const idleKnowledgeEvidenceState: KnowledgeEvidencePanelState = Object.freeze({
  status: "idle",
});

function PublicationComposerProvider({
  apiBaseUrl,
  canEdit,
  children,
  onDraftSaved,
}: {
  readonly apiBaseUrl: string;
  readonly canEdit: boolean;
  readonly children: ReactNode;
  readonly onDraftSaved: (title: string) => void;
}) {
  const [state, setState] = useState<PublicationComposerState>({
    caption: "",
    format: "historia",
    layout: "historia-tip",
    mediaMode: "none",
    status: "editing",
    title: "",
    variant: "template",
  });
  const idempotencyKey = useRef<string | null>(null);
  const stateReference = useRef(state);
  useEffect(() => {
    stateReference.current = state;
  }, [state]);

  const chooseVariant = useCallback((variant: PublicationComposerVariant) => {
    idempotencyKey.current = null;
    setState((current) => ({
      caption: current.caption,
      format: current.format,
      layout: current.layout,
      mediaMode: current.mediaMode,
      status: "editing",
      title: current.title,
      variant,
    }));
  }, []);
  const updateCaption = useCallback((caption: string) => {
    idempotencyKey.current = null;
    setState((current) => ({ ...current, caption, status: "editing" }));
  }, []);
  const updateTitle = useCallback((title: string) => {
    idempotencyKey.current = null;
    setState((current) => ({ ...current, status: "editing", title }));
  }, []);
  const updateFormat = useCallback((format: "historia") => {
    setState((current) => ({ ...current, format }));
  }, []);
  const updateLayout = useCallback((layout: "historia-tip") => {
    setState((current) => ({ ...current, layout }));
  }, []);
  const updateMediaMode = useCallback((mediaMode: "none") => {
    setState((current) => ({ ...current, mediaMode }));
  }, []);
  const saveTemplateDraft = useCallback(() => {
    const currentState = stateReference.current;
    if (
      !canEdit ||
      !allowedComposerActions(currentState.variant).has("save-draft")
    ) {
      setState((current) => ({
        ...current,
        notice: "Este flujo no permite guardar un borrador.",
        status: "error",
      }));
      return;
    }
    const title = currentState.title.trim();
    const caption = currentState.caption.trim();
    if (title.length < 1 || title.length > 180) {
      setState((current) => ({
        ...current,
        notice: "Escribí un título de hasta 180 caracteres.",
        status: "error",
      }));
      return;
    }
    if (caption.length < 1 || caption.length > 2_200) {
      setState((current) => ({
        ...current,
        notice: "Escribí un texto de hasta 2200 caracteres.",
        status: "error",
      }));
      return;
    }
    idempotencyKey.current ??= crypto.randomUUID();
    setState((current) => ({
      ...current,
      notice: "Guardando borrador…",
      status: "saving",
    }));
    void saveTemplatePublicationDraft(apiBaseUrl, {
      caption,
      idempotencyKey: idempotencyKey.current,
      title,
    }).then((result) => {
      startTransition(() => {
        switch (result.kind) {
          case "saved":
            idempotencyKey.current = null;
            onDraftSaved(result.publication.title);
            setState((current) => ({
              ...current,
              notice: `Borrador guardado como “${result.publication.title}”.`,
              status: "saved",
            }));
            return;
          case "forbidden":
            setState((current) => ({
              ...current,
              notice: "La sesión no permite crear borradores.",
              status: "error",
            }));
            return;
          case "error":
            setState((current) => ({
              ...current,
              notice: result.message,
              status: "error",
            }));
        }
      });
    });
  }, [apiBaseUrl, canEdit, onDraftSaved]);
  const actions = useMemo(
    () => ({
      chooseVariant,
      saveTemplateDraft,
      updateCaption,
      updateFormat,
      updateLayout,
      updateMediaMode,
      updateTitle,
    }),
    [
      chooseVariant,
      saveTemplateDraft,
      updateCaption,
      updateFormat,
      updateLayout,
      updateMediaMode,
      updateTitle,
    ],
  );
  const meta = useMemo(
    () => ({
      allowedActions: allowedComposerActions(state.variant),
      canEdit,
      formId: "publication-template-form",
    }),
    [canEdit, state.variant],
  );

  return (
    <PublicationComposerContextProvider
      actions={actions}
      meta={meta}
      state={state}
    >
      {children}
    </PublicationComposerContextProvider>
  );
}

function ComposerFrame({ children }: { readonly children: ReactNode }) {
  const state = usePublicationComposerState();
  return (
    <section
      aria-label="Compositor de publicación"
      className="composer-workbench"
      data-variant={state.variant}
    >
      {children}
    </section>
  );
}

function ComposerVariantNavigation() {
  const actions = usePublicationComposerActions();
  const state = usePublicationComposerState();
  const variants: readonly Readonly<{
    label: string;
    value: PublicationComposerVariant;
  }>[] = [
    { label: "Plantilla", value: "template" },
    { label: "Creatividad IA", value: "ai-creative" },
    { label: "Historia recurrente", value: "recurring-story" },
    { label: "Promoción de producto", value: "product-promotion" },
  ];
  return (
    <div aria-label="Tipo de compositor" className="composer-variants">
      {variants.map((variant) => (
        <button
          aria-pressed={state.variant === variant.value}
          key={variant.value}
          onClick={() => {
            actions.chooseVariant(variant.value);
          }}
          type="button"
        >
          {variant.label}
        </button>
      ))}
    </div>
  );
}

function ComposerNotice() {
  const state = usePublicationComposerState();
  return (
    <p
      aria-live="polite"
      className="composer-notice"
      data-status={state.status}
      id="composer-notice"
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.notice ?? "Los cambios permanecen locales hasta guardar."}
    </p>
  );
}

function ComposerPreview() {
  const state = usePublicationComposerState();
  return (
    <aside aria-label="Vista previa del contenido" className="composer-preview">
      <span className="composer-preview-kicker">Historia · borrador</span>
      <strong>{state.title.trim() || "Título de la pieza"}</strong>
      <p>
        {state.caption.trim() || "El texto aparecerá acá mientras escribís."}
      </p>
      <span className="composer-preview-cta">Consultanos por WhatsApp</span>
    </aside>
  );
}

function TemplateForm() {
  const actions = usePublicationComposerActions();
  const meta = usePublicationComposerMeta();
  const state = usePublicationComposerState();
  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    actions.saveTemplateDraft();
  }
  return (
    <form
      aria-describedby="template-guidance composer-notice"
      className="composer-form"
      id={meta.formId}
      noValidate
      onSubmit={submit}
    >
      <div>
        <p className="workspace-eyebrow">Plantilla aprobada</p>
        <h2>Consejo breve para historias</h2>
        <p id="template-guidance">
          Una idea, un título directo y una consulta real. Guardar crea un
          borrador; no lo envía a revisión ni lo publica.
        </p>
      </div>
      <label>
        Título de la pieza
        <input
          aria-invalid={state.status === "error" && state.title.trim() === ""}
          disabled={!meta.canEdit || state.status === "saving"}
          maxLength={180}
          onChange={(event) => {
            actions.updateTitle(event.currentTarget.value);
          }}
          required
          value={state.title}
        />
      </label>
      <label>
        Texto de acompañamiento
        <textarea
          aria-invalid={state.status === "error" && state.caption.trim() === ""}
          disabled={!meta.canEdit || state.status === "saving"}
          maxLength={2_200}
          onChange={(event) => {
            actions.updateCaption(event.currentTarget.value);
          }}
          required
          rows={6}
          value={state.caption}
        />
      </label>
      <div className="composer-selection-grid">
        <label>
          Layout
          <select
            onChange={() => {
              actions.updateLayout("historia-tip");
            }}
            value={state.layout}
          >
            <option value="historia-tip">Consejo breve</option>
          </select>
        </label>
        <label>
          Formato
          <select
            onChange={() => {
              actions.updateFormat("historia");
            }}
            value={state.format}
          >
            <option value="historia">Historia 1080 × 1920</option>
          </select>
        </label>
        <label>
          Medio permitido
          <select
            onChange={() => {
              actions.updateMediaMode("none");
            }}
            value={state.mediaMode}
          >
            <option value="none">Sin foto · layout tipográfico</option>
          </select>
        </label>
      </div>
      <div className="composer-form-actions">
        <span>Se usará el formato Historia y el tema Taller.</span>
        <button
          className="workspace-primary-action"
          disabled={!meta.canEdit || state.status === "saving"}
          type="submit"
        >
          {state.status === "saving" ? "Guardando…" : "Guardar borrador"}
        </button>
      </div>
    </form>
  );
}

function CapabilityBoundary({
  eyebrow,
  title,
  description,
}: {
  readonly description: string;
  readonly eyebrow: string;
  readonly title: string;
}) {
  return (
    <section className="composer-boundary">
      <p className="workspace-eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p>{description}</p>
      <p className="composer-boundary-note">
        Este límite es intencional: no se simula una acción que todavía no está
        conectada al dominio.
      </p>
    </section>
  );
}

export function TemplatePublicationComposer() {
  return (
    <ComposerFrame>
      <TemplateForm />
      <ComposerPreview />
    </ComposerFrame>
  );
}

export function AICreativeComposer() {
  return (
    <ComposerFrame>
      <section className="composer-ai-request">
        <p className="workspace-eyebrow">Fase 3</p>
        <h2>Creatividad con contexto comprobable</h2>
        <p>
          La consulta usará únicamente documentos aprobados para la organización
          y la sucursal elegida. Recuperar evidencia no guarda, aprueba ni
          publica una pieza.
        </p>
        <p className="composer-boundary-note">
          La conexión del pedido al brief estructurado se habilitará después de
          completar las herramientas comerciales y la evaluación de fidelidad.
        </p>
      </section>
      <KnowledgeEvidencePanel state={idleKnowledgeEvidenceState} />
    </ComposerFrame>
  );
}

export function RecurringStoryComposer() {
  return (
    <ComposerFrame>
      <CapabilityBoundary
        description="La recurrencia necesitará zona horaria, regla explícita y confirmación humana separada."
        eyebrow="Fase 6"
        title="Historias recurrentes sin automatismos ocultos"
      />
    </ComposerFrame>
  );
}

export function ProductPromotionComposer() {
  return (
    <ComposerFrame>
      <CapabilityBoundary
        description="Precio y stock sólo aparecerán cuando exista una fuente comercial vigente y trazable."
        eyebrow="Datos comerciales"
        title="Promoción de producto con hechos verificados"
      />
    </ComposerFrame>
  );
}

function ActiveComposer() {
  const state = usePublicationComposerState();
  switch (state.variant) {
    case "template":
      return <TemplatePublicationComposer />;
    case "ai-creative":
      return <AICreativeComposer />;
    case "recurring-story":
      return <RecurringStoryComposer />;
    case "product-promotion":
      return <ProductPromotionComposer />;
  }
}

export const PublicationComposer = {
  Active: ActiveComposer,
  Notice: ComposerNotice,
  Provider: PublicationComposerProvider,
  VariantNavigation: ComposerVariantNavigation,
};
