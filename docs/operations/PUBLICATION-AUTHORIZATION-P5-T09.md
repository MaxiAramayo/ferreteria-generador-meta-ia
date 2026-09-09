# Solicitud de autorización para la publicación real de `P5-T09`

Estado: **pendiente de decisión del negocio**. Este documento no autoriza nada;
existe para que la autorización que exige
[`ADR-019`](../architecture/decisions/ADR-019-EXISTING-META-ASSETS-VALIDATION.md)
pueda darse sobre algo concreto en vez de sobre una intención.

## Por qué hace falta otra publicación real

La publicación del 2026-09-01 ya evidencia salida única por destino,
coincidencia remota de copy y bitmap, identificadores consultables y bloqueo de
duplicado. No cubre el primer criterio de `P5-T09`: esa pieza **no nació de un
brief**. Su revisión la creó el provisionador de App Review, que escribe
`content_brief_run_id` en nulo. El camino de producto existe y está probado con
dobles, pero nunca se recorrió entero contra Meta.

Lo que falta no es simular otra vez: es la corrida real de la cadena completa
—brief con evidencia vigente, pieza generada, aprobación humana, orden,
publicación— más un fallo inducido en un destino y su reconciliación.

`ADR-019` exige para eso una autorización **concreta y puntual**: la de agosto
cubrió su propia corrida y no habilita ésta.

## Lo que decide el negocio

Sin estas cinco respuestas la corrida no puede prepararse.

1. **Producto o mensaje.** Qué se comunica. Determina el brief y, con él, qué
   datos comerciales se consultan y qué evidencia debe estar vigente.
2. **Copy aprobado.** El texto exacto que saldría publicado. Se aprueba en el
   panel; nada se publica sin esa aprobación humana.
3. **Medios.** Si la pieza usa una fotografía propia autorizada o una imagen
   generada. Si es generada, la corrida consume presupuesto de IA real.
4. **Destinos.** Se propone `instagram_feed` y `facebook_page`, los mismos de
   agosto. Historias quedan fuera salvo indicación contraria.
5. **Ventana horaria.** Cuándo puede salir. La publicación es visible para el
   público de inmediato.

## Lo que la plataforma ya determina

| Campo | Valor |
|---|---|
| Activos | Page de Aramayo y `@ferreteria_aramayo`, los inventariados en `ADR-019` |
| Destinos propuestos | `instagram_feed` y `facebook_page` |
| Snapshot | Inmutable, creado al aprobar; la orden cita ese snapshot y no el borrador |
| Rol requerido | `publisher` para ejecutar; `approver` para aprobar |
| Idempotencia | Una orden por publicación; repetir el pedido no crea otra salida |
| Efecto esperado | Un posteo público por destino, con su ID remoto y permalink |

## Efecto y reversión

La publicación es **pública e inmediata** en las cuentas reales del negocio. No
existe «des-publicar» desde la plataforma: revertir significa borrar el posteo
en Meta a mano, y ese borrado no devuelve el alcance que ya tuvo. Por eso la
autorización se pide antes y sobre el copy exacto.

Un fallo parcial no se resuelve reintentando a ciegas: el destino que quedó sin
confirmar se reconcilia primero, según
[`RUNBOOKS.md`](RUNBOOKS.md#publicación-fallida).

## Precondiciones técnicas

Antes de pedir la corrida hay que comprobar, en este orden:

1. Staging desplegado con el SHA que se va a verificar. Hoy el VPS tiene la
   release seleccionada pero **sin servicios iniciados**.
2. Conexión Meta publicable: el panel de configuración debe mostrarla vigente,
   no degradada.
3. Presupuesto de IA disponible si la pieza se genera, visible en el tablero de
   `/operacion`.
4. Backup de PostgreSQL previo, como en la corrida de agosto.

## Qué se verificará después

- Que la pieza cite el `content_brief_run_id` del brief que la originó.
- Que salga **una sola vez** por destino, con ID remoto y permalink abiertos y
  comparados contra el copy y el bitmap aprobados.
- Que repetir la orden no duplique contenido.
- Que un fallo inducido en un destino se reconcilie sin tocar el destino que sí
  salió.
- Informe de fallos, latencia y auditoría, con la correlación que devuelve la
  API para seguir la cadena entera.

## Qué NO cubre esta autorización

Publicaciones posteriores, historias, otras piezas, cambios de copy, reintentos
manuales fuera del runbook y promoción paga. Cada una necesita la suya.

## Cómo se registra la decisión

La respuesta del negocio se agrega como enmienda a `ADR-019`, con fecha, activos,
media, copy, destinos y efecto esperado, igual que la enmienda de 2026-08-19.
Recién entonces `P5-T09` puede empezar.
