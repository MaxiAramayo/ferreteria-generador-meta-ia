# ADR-015: gobernanza transaccional de generación de imágenes

- Estado: aceptado
- Fecha: 2026-08-06
- Tarea: `P4-T07`

## Contexto

Una ejecución puede gastar aunque termine cancelada, falle la moderación final,
el almacenamiento no responda o la composición no salga. Contabilizar sólo la
variante exitosa pierde ese gasto. Comprobar cuotas fuera de la transacción
también permite que solicitudes concurrentes superen el límite, y una palanca
leída al arrancar el worker no permite una suspensión operativa inmediata.

Los medios generados agregan otro riesgo: la base, la pieza compuesta, un render
o un adjunto pueden compartir el mismo activo. Borrar por antigüedad sin
serializar referencias contra `beginDeletion` rompe piezas todavía activas.

## Decisión

Cada organización tiene una `GenerationPolicy` versionada. Las organizaciones
existentes se migran habilitadas con los límites piloto; una organización nueva
recibe automáticamente una política deshabilitada. La API administra la política
con `organization:manage` y compare-and-swap.

El pedido reserva en una sola transacción el primer intento de todas sus
variantes. Las reservas cuentan contra los límites diarios de organización y
membresía, y contra el presupuesto mensual. Si el lote completo no cabe, se
crea una ejecución determinista de costo cero; nunca se reserva parcialmente.
Cada retry necesita una reserva nueva.

`GenerationAttempt` es el ledger monetario y usa estos estados:

```text
reserved -> in_flight -> settled
                   \-> unconfirmed
reserved -> released
```

El worker marca `in_flight` inmediatamente antes de Images y liquida con enteros
micro-USD apenas recibe uso, antes de moderar, guardar o componer. Una respuesta
ambigua conserva la reserva máxima como `unconfirmed`; una cancelación libera
sólo lo que nunca se inició. El precio queda fijado por versión en código.

Images usa moderación automática e identificador irreversible de membresía. El
worker ejecuta además `omni-moderation-latest` antes del prompt y después sobre
prompt e imagen. Cualquier rechazo o indisponibilidad falla cerrado. La auditoría
guarda únicamente fase, resultado, categorías, modelo y request ID.

Cada medio lleva `retentionUntil`. Un barrido horario acotado solicita sólo
activos vencidos sin referencias. PostgreSQL bloquea el activo y exige estado
`available` al crear adjuntos, renders, bases o composiciones; esos locks
serializan la referencia contra el inicio de borrado.

## Consecuencias

- Preflight es informativo; la admisión autoritativa se decide al crear el lote.
- La idempotencia devuelve el snapshot original y nunca reserva de nuevo.
- El gasto comprometido suma `settled`, reservas activas y `unconfirmed`.
- Una alerta mensual se inserta una sola vez por organización y mes.
- `estimatedCostUsd` continúa como alias; la autoridad es el objeto exacto en
  micro-USD del ledger.
- Cambiar modelo o tabla de precios exige una versión nueva y evaluación
  separada.
- La selección visual de variantes sigue fuera de esta decisión (`P4-T06`).
