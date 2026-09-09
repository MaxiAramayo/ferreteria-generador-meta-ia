# ADR-027: una excepción vive en la fecha civil de la sucursal y manda sobre el horario semanal

- Estado: aceptado
- Fecha: 2026-09-09
- Tarea: `P6-T08`

## Contexto

El horario semanal de una sucursal es una afirmación general: «lunes a sábado de
8:30 a 13:00». La realidad la corrige seguido —un feriado, una jornada reducida,
un corte de energía— y esas correcciones son exactamente los días en los que una
historia automática puede publicar la mentira más cara: «ya abrimos» un día que
la sucursal está cerrada.

[`ADR-025`](ADR-025-RECURRING-STORY-MATERIALIZATION.md) dejó las excepciones
modeladas y consultadas, pero sin pantalla ni reglas de cambio. Faltaba definir
tres cosas: qué zona interpreta la fecha de una excepción, qué gana cuando la
excepción y el horario semanal dicen cosas distintas, y qué pasa con lo que ya
estaba programado cuando la excepción aparece, cambia o se retira.

La tentación es tratar la excepción como «un horario más» y resolver el choque
por orden de llegada o por cercanía de fecha. Eso deja el resultado a merced de
la zona del servidor y de la hora exacta en la que alguien guardó.

## Decisión

1. La **zona IANA la posee la sucursal**. Una excepción se dirige por fecha
   civil `YYYY-MM-DD` de esa sucursal y nunca por instante UTC ni por offset
   fijo. La solicitud no transporta zona: si la transportara, dos personas en
   husos distintos podrían cerrar días distintos con el mismo formulario.
2. La **precedencia es explícita y no depende del orden de escritura**: para una
   fecha, la excepción gana sobre el horario semanal. Un cierre bloquea la
   historia sensible a horario con causa registrada; una apertura excepcional se
   cita como fuente propia y **siempre** vuelve a revisión humana, aunque la
   regla sea automática.
3. Un **desajuste de fecha se declara, no se acomoda**. Si se intenta resolver
   una ocurrencia con la excepción de otro día civil, el dominio falla. En el
   borde de medianoche la fecha UTC y la civil se separan, y elegir la
   equivocada produce el horario de otro día sin que nada lo denuncie.
4. **Crear, cambiar o quitar una excepción invalida en lote lo futuro de esa
   fecha**: cancela la programación y sus ocurrencias planificadas, lleva la
   publicación a `validation_failed` y marca la materialización `invalidated`,
   con auditoría por historia. El barrido posterior **no la repone solo**: hace
   falta una revisión humana, igual que en `ADR-025`.
5. **Guardar exige haber visto el impacto**. El cálculo previo cuenta historias
   futuras reales de esa fecha y sólo vale para el borrador exacto con el que se
   calculó: cambiar cualquier campo lo invalida y vuelve a bloquear el guardado.
   Previsualizar no escribe.
6. **No se agrega una tolerancia nueva.** La única tolerancia de salida sigue
   siendo `lateToleranceMinutes` por programación
   ([`ADR-023`](ADR-023-OCCURRENCE-CIVIL-IDENTITY.md), `P6-T03`), y una
   excepción no la altera. Un dato faltante o vencido bloquea; no se publica
   tarde para «alcanzar» una ventana.
7. Cada excepción lleva **fuente y versión**. Toda mutación compara
   `expectedVersion` —crear exige su ausencia— e incrementa la versión. La
   consulta se acota a **93 días**, que cubre un trimestre operativo sin
   habilitar barridos de calendario completo.

## Consecuencias

- El día que la sucursal cierra deja de depender de que alguien se acuerde de
  pausar la regla: la excepción es el dato, y el bloqueo es su consecuencia
  automática.
- Cambiar una excepción es ruidoso a propósito. Es preferible pedir una revisión
  nueva a publicar un horario viejo.
- El panel puede explicar la consecuencia antes de aplicarla porque el impacto
  se calcula contra las mismas filas que después se invalidan.
- La fecha civil como identidad hace que la excepción sobreviva a una
  actualización de tzdata: lo que puede moverse es el instante de la ocurrencia,
  no el día que la dueña declaró cerrado.

## Alternativas descartadas

- **Guardar la excepción en UTC**: en el borde de medianoche cierra el día
  equivocado, y en una zona con horario de verano el error cambia según el mes.
- **Resolver el choque por antigüedad del dato**: haría que reordenar dos
  guardados cambie el mensaje publicado, sin que nadie lo haya decidido.
- **Dejar viva la historia ya programada y sólo avisar**: un aviso no impide la
  publicación; la ocurrencia seguiría saliendo con el horario anterior.
- **Repone automáticamente la historia con el horario nuevo**: convierte un
  cambio factual en una aprobación implícita, que es justo lo que el control
  humano de la plataforma no permite.
