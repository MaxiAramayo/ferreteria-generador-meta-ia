# ADR-030: historias de apertura con firma de marca y rotación explícita

- Estado: aceptado
- Fecha: 2026-09-17
- Tarea: `P6-T10`

## Contexto

Una regla recurrente de apertura ya puede materializar un borrador citable con
el horario y la dirección vigentes. Sin embargo, el panel sólo crea reglas, la
vista previa es una aproximación separada del render y la regla siempre genera
el mismo `historia-tip`. Quien opera no puede ajustar una regla existente, ver
qué aspecto tendrá cada día ni distinguir «activar la regla» de publicar en
Instagram.

La identidad no puede depender de que cada layout recuerde escribir el mismo
nombre, logo o ciudad. Eso produce piezas inconsistentes y convierte «Frías»
en un texto fijo incluso si el alcance factual cambia. Para una rutina de
apertura, además, una foto inventada o generada aporta poco y puede confundir:
el hecho que se comunica es horario y ubicación actuales.

## Decisión

1. La apertura tendrá tres layouts deterministas y compatibles con el mismo
   contrato factual: `cartel`, `horario` y `locales`. Cada uno muestra la firma
   de Ferretería Aramayo, título, horario, ubicación y CTA dentro de las zonas
   seguras de `historia`.
2. El motor compone una firma de marca desde `LayoutContext`: isotipo, nombre de
   marca y localidad. La ciudad no es una constante de un layout. Las piezas
   que ya expresan su propia firma conservan una única marca visible.
3. La regla conserva una rotación ordenada de variantes. Para cada ocurrencia,
   la elección sale de la fecha civil y del orden persistido; por eso una
   relectura o reintento siempre elige el mismo diseño. La interfaz permite
   seleccionar la secuencia de lunes a sábado y muestra su resultado semanal.
4. Editar una regla es un comando con versión esperada, idempotencia y
   auditoría. Cambia sólo materializaciones futuras: una revisión ya aprobada,
   una programación y una publicación son evidencia histórica y no se
   reescriben.
5. La rutina mantiene el circuito de `ADR-025`: activar guarda una intención;
   materializar crea un borrador; renderizar produce el PNG; aprobar programa;
   el worker valida y publica sólo con una orden autorizada. Una conexión Meta
   degradada, un feriado, un cierre o una fuente modificada bloquean la salida.

## Consecuencias

- La variación no inventa copy ni hechos: cambia composición, no el horario ni
  la información de sucursal.
- La persona que opera puede configurar lunes a sábado sin que domingo se
  convierta en una ausencia silenciosa: simplemente no forma parte de la regla.
- La firma visual queda cubierta por una prueba estructural y las tres
  variantes entran a la regresión visual del worker.
- Una publicación real continúa necesitando autorización concreta y deja los
  identificadores remotos para `P5-T09` y `P6-T09`.

## Alternativas descartadas

- **Cambiar el layout ya materializado**: altera una pieza que pudo ser
  aprobada o programada y rompe su snapshot.
- **Elegir un diseño al azar**: un reintento produciría otra pieza para la misma
  fecha y el resultado dejaría de ser reproducible.
- **Exponer todo el catálogo de historias**: mezcla layouts de producto,
  precios o lubricentro con una afirmación de horario y permite composiciones
  inválidas.
- **Pedir una imagen generada todos los días**: agrega costo, dependencia y
  riesgo visual a una comunicación que debe ser factual y rápida.
