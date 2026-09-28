/**
 * Dónde estás en el camino de una pieza, y cuánto falta.
 *
 * Elegir y armar están en «Crear pieza»; cuándo sale se decide en la hoja que
 * se abre al guardar, con un toque (`ADR-034`). El riel ata las dos pantallas:
 * sin él, guardar parece el final del camino.
 */

const steps = [
  { name: "Qué", number: 1 },
  { name: "La pieza", number: 2 },
  { name: "Cuándo sale", number: 3 },
] as const;

export type FlowStepNumber = (typeof steps)[number]["number"];

export function FlowSteps({ current }: Readonly<{ current: FlowStepNumber }>) {
  return (
    <ol aria-label="Pasos para publicar" className="flow-steps">
      {steps.map((step) => (
        <li
          aria-current={step.number === current ? "step" : undefined}
          data-state={
            step.number === current
              ? "current"
              : step.number < current
                ? "done"
                : "ahead"
          }
          key={step.number}
        >
          <span aria-hidden="true">{step.number}</span>
          {step.name}
        </li>
      ))}
    </ol>
  );
}
