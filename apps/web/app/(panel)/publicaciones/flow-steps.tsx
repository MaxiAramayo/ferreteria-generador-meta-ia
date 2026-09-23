/**
 * Dónde estás en el camino de una pieza, y cuánto falta.
 *
 * Los cuatro pasos no viven en una sola pantalla: elegir y armar están en
 * «Crear pieza», el turno en la pieza ya renderizada, y confirmar en la
 * pantalla que separa un clic de algo público. El riel es lo que los ata: sin
 * él, cada pantalla parece el final del camino.
 */

const steps = [
  { name: "Qué", number: 1 },
  { name: "La pieza", number: 2 },
  { name: "Cuándo", number: 3 },
  { name: "Confirmá", number: 4 },
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
