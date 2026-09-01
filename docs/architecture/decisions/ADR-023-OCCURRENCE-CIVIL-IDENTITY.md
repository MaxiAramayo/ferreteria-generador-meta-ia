# ADR-023: la identidad de una ocurrencia es su hora civil local

- Estado: aceptado
- Fecha: 2026-09-01
- Tarea: `P6-T01`

## Contexto

Una regla de recurrencia se materializa en ocurrencias concretas, y el
dispatcher va a volver a materializar la misma regla muchas veces: cuando corre
el barrido, cuando alguien edita la programación, cuando el proceso se reinicia.
Si la materialización no es idempotente, cada corrida agrega ocurrencias
duplicadas y el calendario publica de más.

La pregunta es qué identifica a una ocurrencia. El candidato obvio es su
instante UTC, y es el equivocado por dos motivos.

El primero es que **el instante puede moverse sin que nadie lo decida**. La base
de datos de zonas horarias cambia —los países mueven sus reglas y las
distribuciones publican tzdata nueva— y también cambia cuando se corrige la zona
mal cargada de una programación. Con el instante como identidad, la ocurrencia
del martes a las nueve pasaría a ser otra ocurrencia distinta, y la anterior
quedaría huérfana o se publicaría dos veces.

El segundo es que **el instante no es el dato que el negocio eligió**. Nadie
programa «las 12:00Z»: programa «las nueve de la mañana». La hora local y la
zona IANA son el dato original; el instante es su consecuencia.

## Decisión

1. La identidad de una ocurrencia es su **clave civil local**, con forma
   `YYYY-MM-DDTHH:mm` en la zona de la programación, única dentro de
   `(organización, programación)`. El instante UTC se guarda al lado y puede
   recalcularse; la clave no.
2. La **vigencia de una regla se evalúa en fechas civiles**, no en instantes.
   «Del 15 al 30» incluye los dos días enteros: comparar contra el instante
   exacto haría que una vigencia que empieza a media tarde se comiera la
   publicación de esa misma mañana.
3. Las dos anomalías de zona se resuelven por política declarada y quedan
   registradas en la ocurrencia:
   - una hora local que **no existe** —el hueco del adelanto de reloj— se saltea
     o se corre al primer instante válido, según `gap_policy`, y se marca
     `shifted`;
   - una hora local que **existe dos veces** —la que el atraso repite— toma
     siempre la primera y se marca `ambiguous`.
4. Una ocurrencia **despachada está congelada**: una edición de la regla no la
   reescribe, no la borra y no la reprograma, aunque la regla nueva ya no la
   produzca. Sale por `frozen` en el diff y se conserva.
5. Una ocurrencia y su orden de publicación son **la misma cosa vista de dos
   lados**: la base exige que `dispatched` tenga orden y que ninguna orden
   pertenezca a dos ocurrencias.

## Consecuencias

- Volver a materializar es idempotente por construcción: la clave ya existe y el
  `INSERT` choca contra el índice único en lugar de duplicar.
- Una actualización de tzdata puede mover el instante de una ocurrencia
  planificada sin romper su identidad. El diff la devuelve en `reschedule`, que
  es una corrección explícita y auditable, no una fila nueva.
- El estado de publicación **no** se copia a la ocurrencia: lo sabe la orden.
  Duplicarlo crearía una segunda verdad sobre el mismo hecho.
- Una programación única es una recurrencia con exactamente una ocurrencia, no
  un modelo aparte. El dispatcher no tiene que preguntar de qué tipo es.
- El modelo soporta horario de verano aunque Argentina no lo aplique desde 2009.
  No es sobrediseño: la zona es configurable, y un calendario que asume que toda
  hora local existe una sola vez está mal escrito.

## Alternativas descartadas

- **Identidad por instante UTC**: se mueve con tzdata y con una corrección de
  zona, que es exactamente cuando hace falta que no se mueva.
- **Identidad por número de secuencia** (`la ocurrencia N de la regla`): una
  edición que agrega un día a la regla corre todos los números siguientes, y las
  ocurrencias ya despachadas cambiarían de identidad.
- **Guardar sólo la hora local y calcular el instante al despachar**: deja al
  dispatcher resolviendo zonas en el camino crítico y hace imposible indexar por
  vencimiento.
