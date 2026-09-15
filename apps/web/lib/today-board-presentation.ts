import type {
  MetaConnectionHealthResponse,
  MetaConnectionResponse,
  PublicationOperationalAlertResponse,
  PublicationScheduleCalendarResponse,
  PublishingReadinessResponse,
} from "@aramayo/contracts";

import { publicationTargetLabels } from "./publication-publishing-presentation.ts";

/**
 * Qué muestra «Para hoy» (`/`), sin consultar a la API.
 *
 * El tablero no decide nada: cuenta lo que ya existe y lleva a la pantalla que
 * lo resuelve. Cada fuente existe sólo si la sesión puede leerla; una fuente
 * ausente significa «no es para este rol», nunca «todavía no cargó».
 */

export type Loadable<T> =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "ready"; value: T }>
  | Readonly<{ kind: "error"; message: string }>;

export interface TodayPermissions {
  readonly approve: boolean;
  readonly connections: boolean;
  readonly edit: boolean;
  readonly publish: boolean;
  readonly schedule: boolean;
}

export interface TodayBoardSources {
  readonly alerts?: Loadable<readonly PublicationOperationalAlertResponse[]>;
  readonly approved?: Loadable<number>;
  readonly drafts?: Loadable<number>;
  readonly metaConnections?: Loadable<readonly MetaConnectionResponse[]>;
  readonly needsAttention?: Loadable<number>;
  /** `null` cuando la API no confirmó si se puede publicar. */
  readonly publishing?: Loadable<PublishingReadinessResponse | null>;
  readonly readyForReview?: Loadable<number>;
}

export type TodayTicketTone = "attention" | "calm" | "urgent";

export interface TodayTicket {
  readonly area: string;
  readonly busy: boolean;
  readonly detail: string;
  readonly href: string;
  readonly id: keyof TodayBoardSources;
  readonly linkLabel: string;
  readonly tone: TodayTicketTone;
  readonly unit: string;
  readonly value: string;
}

export interface TodayShortcut {
  readonly href: string;
  readonly label: string;
  readonly primary: boolean;
}

export interface UpcomingOuting {
  readonly key: string;
  readonly publicationId: string;
  readonly scheduledAt: string;
  readonly targets: string;
  readonly timeZone: string;
  readonly title: string;
}

type TicketFace = Readonly<{
  detail: string;
  tone: TodayTicketTone;
  unit: string;
  value: string;
}>;

const loading: Readonly<{ kind: "loading" }> = Object.freeze({
  kind: "loading",
});

const connectionHealth: Readonly<
  Record<
    MetaConnectionHealthResponse,
    Readonly<{ detail: string; value: string }>
  >
> = {
  asset_removed: {
    detail: "La página o la cuenta de Instagram ya no está disponible.",
    value: "Sin página",
  },
  // Sana pero sin poder publicar: le faltan permisos concedidos.
  healthy: {
    detail: "Está conectada, pero le faltan permisos para publicar.",
    value: "Incompleta",
  },
  permission_revoked: {
    detail: "Se retiraron permisos: hay que volver a autorizar.",
    value: "Sin permisos",
  },
  revoked: {
    detail: "La autorización fue revocada: hay que reconectar.",
    value: "Revocada",
  },
  token_expired: {
    detail: "Venció la autorización: hay que reconectar.",
    value: "Vencida",
  },
};

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function ticket<T>(
  base: Readonly<{
    area: string;
    href: string;
    id: keyof TodayBoardSources;
    linkLabel: string;
  }>,
  source: Loadable<T>,
  present: (value: T) => TicketFace,
): TodayTicket {
  switch (source.kind) {
    case "loading":
      return {
        ...base,
        busy: true,
        detail: "Consultando…",
        tone: "calm",
        unit: "",
        value: "…",
      };
    case "error":
      return {
        ...base,
        busy: false,
        detail: source.message,
        tone: "attention",
        unit: "sin datos",
        value: "—",
      };
    case "ready":
      return { ...base, busy: false, ...present(source.value) };
  }
}

export function initialTodaySources(
  permissions: TodayPermissions,
): TodayBoardSources {
  return {
    ...(permissions.approve ? { readyForReview: loading } : {}),
    ...(permissions.edit ? { drafts: loading, needsAttention: loading } : {}),
    ...(permissions.schedule ? { approved: loading } : {}),
    ...(permissions.publish ? { alerts: loading, publishing: loading } : {}),
    ...(permissions.connections ? { metaConnections: loading } : {}),
  };
}

export function todayShortcuts(
  permissions: TodayPermissions,
): readonly TodayShortcut[] {
  return [
    ...(permissions.edit
      ? [{ href: "/publicaciones/nueva", label: "Crear pieza", primary: true }]
      : []),
    ...(permissions.schedule
      ? [
          {
            href: "/programacion",
            label: "Programar una salida",
            primary: !permissions.edit,
          },
        ]
      : []),
  ];
}

/** Suma conteos; si uno no está listo, el total tampoco lo está. */
export function sumCounts(
  results: readonly Loadable<number>[],
): Loadable<number> {
  let total = 0;
  for (const result of results) {
    if (result.kind !== "ready") return result;
    total += result.value;
  }
  return { kind: "ready", value: total };
}

export function metaConnectionSummary(
  connections: readonly MetaConnectionResponse[],
): TicketFace {
  const publishable = connections.find(
    (connection) => connection.canPublish && connection.health === "healthy",
  );
  if (publishable !== undefined) {
    return {
      detail: `Publica como ${publishable.accountName}.`,
      tone: "calm",
      unit: "conexión sana",
      value: "OK",
    };
  }
  const [first] = connections;
  if (first === undefined) {
    return {
      detail: "Todavía no hay una cuenta de Meta conectada.",
      tone: "urgent",
      unit: "sin cuenta",
      value: "Sin conectar",
    };
  }
  return {
    ...connectionHealth[first.health],
    tone: "urgent",
    unit: "no puede publicar",
  };
}

export function todayTickets(
  sources: TodayBoardSources,
): readonly TodayTicket[] {
  const tickets: TodayTicket[] = [];
  if (sources.readyForReview !== undefined) {
    tickets.push(
      ticket(
        {
          area: "Aprobación",
          href: "/publicaciones",
          id: "readyForReview",
          linkLabel: "Revisar publicaciones",
        },
        sources.readyForReview,
        (count) => ({
          detail:
            count === 0
              ? "No hay piezas esperando aprobación."
              : "Tienen el PNG listo y esperan tu revisión.",
          tone: count === 0 ? "calm" : "attention",
          unit: plural(count, "pieza por aprobar", "piezas por aprobar"),
          value: String(count),
        }),
      ),
    );
  }
  if (sources.drafts !== undefined) {
    tickets.push(
      ticket(
        {
          area: "Edición",
          href: "/publicaciones",
          id: "drafts",
          linkLabel: "Ver borradores",
        },
        sources.drafts,
        (count) => ({
          detail:
            count === 0
              ? "No quedan borradores sin PNG."
              : "Generá el PNG para mandarlos a revisión.",
          tone: count === 0 ? "calm" : "attention",
          unit: plural(count, "borrador", "borradores"),
          value: String(count),
        }),
      ),
    );
  }
  if (sources.needsAttention !== undefined) {
    tickets.push(
      ticket(
        {
          area: "Edición",
          href: "/publicaciones",
          id: "needsAttention",
          linkLabel: "Ver cuáles son",
        },
        sources.needsAttention,
        (count) => ({
          detail:
            count === 0
              ? "Ninguna pieza está trabada."
              : "Faltan datos, no pasaron la validación o no se pudo generar la imagen.",
          tone: count === 0 ? "calm" : "urgent",
          unit: plural(count, "pieza con problemas", "piezas con problemas"),
          value: String(count),
        }),
      ),
    );
  }
  if (sources.approved !== undefined) {
    tickets.push(
      ticket(
        {
          area: "Programación",
          href: "/programacion",
          id: "approved",
          linkLabel: "Programar",
        },
        sources.approved,
        (count) => ({
          detail:
            count === 0
              ? "Todo lo aprobado ya tiene día y hora."
              : "Están aprobadas y todavía no tienen día ni hora.",
          tone: count === 0 ? "calm" : "attention",
          unit: plural(
            count,
            "aprobada sin programar",
            "aprobadas sin programar",
          ),
          value: String(count),
        }),
      ),
    );
  }
  if (sources.alerts !== undefined) {
    tickets.push(
      ticket(
        {
          area: "Operación",
          href: "/operacion",
          id: "alerts",
          linkLabel: "Abrir Operación",
        },
        sources.alerts,
        (alerts) => {
          const urgent = alerts.filter(
            (alert) => alert.severity === "urgent",
          ).length;
          return {
            detail:
              alerts.length === 0
                ? "No hay decisiones operativas pendientes."
                : urgent > 0
                  ? `${String(urgent)} ${plural(urgent, "es urgente", "son urgentes")}. Cada una trae su paso seguro.`
                  : "Ninguna es urgente. Cada una trae su paso seguro.",
            tone:
              urgent > 0 ? "urgent" : alerts.length > 0 ? "attention" : "calm",
            unit: plural(alerts.length, "alerta abierta", "alertas abiertas"),
            value: String(alerts.length),
          };
        },
      ),
    );
  }
  if (sources.publishing !== undefined) {
    tickets.push(
      ticket(
        {
          area: "Publicación",
          href: "/publicaciones",
          id: "publishing",
          linkLabel: "Ir a publicaciones",
        },
        sources.publishing,
        (readiness) =>
          readiness === null
            ? {
                detail:
                  "No se pudo confirmar si hay una conexión lista para publicar.",
                tone: "attention",
                unit: "sin confirmar",
                value: "—",
              }
            : readiness.canPublish
              ? {
                  detail:
                    readiness.accountName === undefined
                      ? "Hay una conexión con Meta lista."
                      : `Publica como ${readiness.accountName}.`,
                  tone: "calm",
                  unit: "para publicar",
                  value: "Lista",
                }
              : {
                  detail:
                    "No hay una conexión sana con Meta. Administración la revisa en Configuración.",
                  tone: "urgent",
                  unit: "sin conexión sana",
                  value: "Trabada",
                },
      ),
    );
  }
  if (sources.metaConnections !== undefined) {
    tickets.push(
      ticket(
        {
          area: "Meta",
          href: "/configuracion",
          id: "metaConnections",
          linkLabel: "Revisar conexión",
        },
        sources.metaConnections,
        metaConnectionSummary,
      ),
    );
  }
  return tickets;
}

/**
 * Las próximas salidas planificadas, de la más cercana a la más lejana.
 *
 * Una programación pausada o cancelada no sale aunque conserve ocurrencias,
 * así que no se lista.
 */
export function upcomingOutings(
  calendar: PublicationScheduleCalendarResponse,
  titles: ReadonlyMap<string, string>,
  now: Date,
  limit: number,
): readonly UpcomingOuting[] {
  return calendar.entries
    .filter((entry) => entry.schedule.status === "active")
    .flatMap((entry) =>
      entry.occurrences
        .filter(
          (occurrence) =>
            occurrence.status === "planned" &&
            Date.parse(occurrence.scheduledAt) >= now.getTime(),
        )
        .map((occurrence) => ({
          key: `${entry.schedule.id}:${occurrence.occurrenceKey}`,
          publicationId: entry.schedule.publicationId,
          scheduledAt: occurrence.scheduledAt,
          targets: entry.schedule.targets
            .map((target) => publicationTargetLabels[target])
            .join(" · "),
          timeZone: entry.schedule.timeZone,
          title: titles.get(entry.schedule.publicationId) ?? "Pieza programada",
        })),
    )
    .sort(
      (left, right) =>
        Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt),
    )
    .slice(0, limit);
}

/** Día y hora en la zona horaria de la programación, no la del navegador. */
export function outingDateParts(
  scheduledAt: string,
  timeZone: string,
): Readonly<{ day: string; time: string }> {
  const date = new Date(scheduledAt);
  const format = (zone: string): Readonly<{ day: string; time: string }> => ({
    day: new Intl.DateTimeFormat("es-AR", {
      day: "numeric",
      month: "short",
      timeZone: zone,
      weekday: "short",
    }).format(date),
    time: new Intl.DateTimeFormat("es-AR", {
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
      timeZone: zone,
    }).format(date),
  });
  try {
    return format(timeZone);
  } catch {
    // Una zona que el navegador no conoce no puede romper el tablero.
    return format("UTC");
  }
}

/**
 * Saludo con el nombre de pila. Si el nombre visible es un correo —pasa con
 * cuentas creadas sin nombre— se saluda sin nombre en vez de leer el correo.
 */
export function greetingFor(displayName: string): string {
  const [firstName] = displayName.trim().split(/\s+/u);
  return firstName === undefined || firstName === "" || firstName.includes("@")
    ? "Hola."
    : `Hola, ${firstName}.`;
}
