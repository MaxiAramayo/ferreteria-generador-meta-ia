# ADR-025: una historia recurrente se materializa como borrador citable

- Estado: aceptado
- Fecha: 2026-09-07
- Tarea: `P6-T04`

## Contexto

Una regla como «Ya abrimos» es una intención editorial, no una pieza. Afirma un
hecho comercial —que la sucursal está atendiendo, en tal dirección y con tal
horario— que sólo es cierto el día que se publica. Programar directamente esa
frase repetiría un mensaje que puede haber dejado de ser verdad: un feriado, un
cierre, una mudanza o un horario especial la convierten en información
incorrecta publicada de forma automática.

`P6-T01` ya separó la intención temporal de la orden de publicación y fijó la
identidad civil de una ocurrencia. Falta el paso intermedio: convertir cada
ocurrencia futura de una regla en algo revisable, con fuente citada, antes de
que exista una orden.

Además, la política de aprobación de una regla no puede ser una casilla
decorativa. Si `automatic-routine` no aprueba nada, la política no significa
nada; si aprueba sin condiciones, una regla creada hace meses publica hoy con
autoridad que su autor pudo haber perdido.

## Decisión

1. **Cada ocurrencia produce un borrador real.** La materialización crea una
   `Publication` con su `PublicationRevision` versionada, no una publicación
   invisible ni una orden. La identidad es
   `(organización, regla, clave de ocurrencia)`, con la misma clave civil de
   [`ADR-023`](ADR-023-OCCURRENCE-CIVIL-IDENTITY.md), así que volver a
   materializar encuentra la fila y el índice único impide el duplicado.
2. **La fuente se consulta al materializar y se cita.** El snapshot conserva
   dirección, horario, nombre y versión de la sucursal, el instante de captura y
   si el dato salió de la configuración vigente o de una excepción del día. El
   borrador no repite una frase guardada: la compone con lo que la fuente decía
   ese día.
3. **Un bloqueo es un hecho registrado, no un salto silencioso.** Sucursal
   inactiva, día cerrado y horario faltante crean una materialización sin
   publicación y con su código de causa. Queda auditable, no se vuelve a
   intentar sobre la misma ocurrencia y nunca produce una afirmación que el
   sistema no puede sostener.
4. **Una excepción siempre vuelve a revisión humana.** Un horario especial se
   cita como fuente y fuerza aprobación humana aunque la regla sea automática.
   Una regla de rutina tiene autoridad sobre la rutina, no sobre el día raro.
5. **La política automática aprueba al terminar el render, no al materializar.**
   Antes no hay pieza que aprobar. En ese momento se vuelve a comprobar que
   quien creó la regla siga activo y conserve `admin` y `approver`. Si los
   perdió, la materialización pasa a exigir revisión humana: la automatización
   puede reducirse sola, nunca ampliarse.
6. **Aprobar una historia recurrente la programa.** La aprobación —humana o
   automática— crea una programación `once` con destino `instagram_story` y una
   única ocurrencia en el instante materializado. Por eso la aprobación pasa a
   responder `approved` o `scheduled`: quien la pide necesita saber si además
   quedó programada. La orden de publicación sigue naciendo en `P6-T03`.
7. **Un cambio de la fuente factual invalida lo que todavía no se publicó.**
   Editar dirección, ciudad, provincia, nombre, horario, zona o actividad de la
   sucursal cancela la programación y sus ocurrencias planificadas, lleva la
   publicación a `validation_failed` con `factual-source-changed` y marca la
   materialización `invalidated`. No se borra nada y no se toca ninguna pieza ya
   publicada.

## Consecuencias

- El operador revisa una pieza fechada y con fuente visible, no una regla
  abstracta que publicará algo dentro de una semana.
- Volver a materializar es seguro: la clave civil y el índice único convierten
  el reintento en una lectura.
- Un feriado no produce una pieza equivocada ni un silencio inexplicable:
  produce un bloqueo con causa.
- Cambiar el horario de la sucursal invalida borradores en lote. Es ruidoso a
  propósito: es preferible pedir una revisión nueva a publicar un horario viejo.
- La política automática deja de ser una promesa permanente. Depende de los
  roles vigentes en el momento de aprobar, así que revocar un rol también apaga
  las automatizaciones que esa persona había dejado activas.
- Un borrador invalidado conserva su historia completa —transición, auditoría y
  snapshot de fuente— para explicar por qué no salió.

## Alternativas descartadas

- **Programar la regla directamente**: publica una frase que nadie revisó con
  datos que pudieron cambiar entre la creación y el envío.
- **Materializar recién a la hora de publicar**: no deja ventana de revisión y
  convierte cualquier bloqueo en una publicación perdida sin aviso.
- **Saltear en silencio las ocurrencias bloqueadas**: sin fila no hay auditoría,
  y cada corrida vuelve a evaluar y a fallar sobre la misma ocurrencia.
- **Aprobar automáticamente al materializar**: aprueba una pieza que todavía no
  se renderizó, así que el snapshot no correspondería al bitmap publicado.
- **Confiar en los roles que el autor tenía al crear la regla**: una regla
  sobreviviría a la revocación de permisos de quien la creó.
- **Borrar o reescribir el borrador cuando cambia la sucursal**: destruye la
  evidencia de qué se iba a publicar y con qué fuente.
- **Dejar que la regla automática apruebe también los días excepcionales**:
  precisamente los días que más se equivocan son los que menos deberían
  publicarse sin mirar.
