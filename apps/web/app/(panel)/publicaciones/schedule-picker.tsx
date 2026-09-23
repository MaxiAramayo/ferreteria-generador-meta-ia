"use client";

import { useState } from "react";

/**
 * Elegir el día en que sale una pieza.
 *
 * Un mes por vez y nada más. Los días que ya pasaron no se pueden tocar: no
 * existe programar para atrás. Hoy lleva una marca, porque es la respuesta más
 * frecuente y conviene encontrarla sin leer números.
 *
 * La semana arranca el lunes, como se lee un calendario acá.
 */

const monthNames = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

const weekdayInitials = ["L", "M", "M", "J", "V", "S", "D"] as const;

/** `YYYY-MM-DD` en hora local, que es la que el negocio dice en voz alta. */
export function localDateText(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${String(date.getFullYear())}-${month}-${day}`;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** «hoy», «mañana» o la fecha con el mes escrito: lo que se confirma en voz alta. */
export function scheduleInWords(localDate: string, localTime: string): string {
  const [year, month, day] = localDate.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    return `el ${localDate} a las ${localTime}`;
  }
  const chosen = new Date(year, month - 1, day);
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (chosen.getTime() === today.getTime()) return `hoy a las ${localTime}`;
  if (chosen.getTime() === tomorrow.getTime()) {
    return `mañana a las ${localTime}`;
  }
  return `el ${String(day)} de ${monthNames[month - 1]?.toLowerCase() ?? ""} a las ${localTime}`;
}

export function SchedulePicker({
  disabled = false,
  onChange,
  value,
}: Readonly<{
  disabled?: boolean;
  onChange: (localDate: string) => void;
  value: string;
}>) {
  const today = startOfDay(new Date());
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const isCurrentMonth =
    visibleMonth.getFullYear() === today.getFullYear() &&
    visibleMonth.getMonth() === today.getMonth();
  const firstWeekday = (visibleMonth.getDay() + 6) % 7;
  const lastDay = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth() + 1,
    0,
  ).getDate();

  function moveMonth(step: number): void {
    setVisibleMonth(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + step, 1),
    );
  }

  return (
    <div className="schedule-picker">
      <div className="schedule-picker-month">
        <button
          aria-label="Mes anterior"
          disabled={disabled || isCurrentMonth}
          onClick={() => {
            moveMonth(-1);
          }}
          type="button"
        >
          ‹
        </button>
        <strong>
          {monthNames[visibleMonth.getMonth()]}{" "}
          {String(visibleMonth.getFullYear())}
        </strong>
        <button
          aria-label="Mes siguiente"
          disabled={disabled}
          onClick={() => {
            moveMonth(1);
          }}
          type="button"
        >
          ›
        </button>
      </div>
      <div
        aria-label="Elegí el día"
        className="schedule-picker-grid"
        role="group"
      >
        {weekdayInitials.map((initial, index) => (
          <span key={index}>{initial}</span>
        ))}
        {Array.from({ length: firstWeekday }, (_, index) => (
          <i data-empty="true" key={`hueco-${String(index)}`} />
        ))}
        {Array.from({ length: lastDay }, (_, index) => {
          const date = new Date(
            visibleMonth.getFullYear(),
            visibleMonth.getMonth(),
            index + 1,
          );
          const text = localDateText(date);
          return (
            <button
              aria-pressed={text === value}
              data-today={String(date.getTime() === today.getTime())}
              disabled={disabled || date < today}
              key={text}
              onClick={() => {
                onChange(text);
              }}
              type="button"
            >
              {index + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
