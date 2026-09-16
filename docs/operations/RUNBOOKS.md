# Runbooks

Qué hacer cuando algo se rompe, escrito para seguirse a las tres de la mañana
sin tener que entender el código. Cada runbook tiene la misma forma:

**Síntoma** cómo se nota · **Diagnóstico** qué mirar para saber qué pasa ·
**Contención** cómo evitar que empeore · **Recuperación** cómo volver ·
**Verificación** cómo saber que terminó.

Dos reglas que valen para todos:

- **Ninguna acción de contención publica ni borra.** Frenar es siempre seguro;
  reintentar no. Si el desenlace de una publicación es ambiguo, se reconcilia
  antes de tocar nada.
- **Los comandos destructivos van aparte**, en su propia sección al final, con
  lo que destruyen escrito al lado. Ninguno aparece dentro de un paso.

## Lo primero, siempre

Tres lecturas, en este orden, antes de cualquier hipótesis:

```bash
curl -sS https://api.content.ferreteriaaramayo.com.ar/health
curl -sS -o /dev/null -w '%{http_code}\n' https://api.content.ferreteriaaramayo.com.ar/ready
```

`/health` responde 200 sin consultar dependencias: si falla, el proceso no está
en pie. `/ready` sí las consulta y responde 503 cuando PostgreSQL o Redis no
están: si `/health` responde y `/ready` no, el problema es de una dependencia y
no de la aplicación.

Después, en el panel, **Operación**: ahí está la salud operativa con el motivo
y el número que cruzó cada umbral. Por API es `GET /operational-health` con
permiso `publishing:execute`, y devuelve `severity` más una lista de `reasons`
con `measured` y `threshold`. Esa pantalla no inventa criterio: usa los mismos
umbrales del dominio que están tabulados más abajo.

Para seguir un caso puntual, el hilo es el `correlationId`: la solicitud, la
auditoría y el trabajo que la ejecuta comparten el mismo, y la API lo devuelve
en el encabezado `x-correlation-id` de cada respuesta.

En producción, los comandos de este archivo asumen:

```bash
COMPOSE="sudo docker compose --env-file /etc/aramayo-content/production.env --file /opt/aramayo-content/current/compose.yaml"
```

`$COMPOSE ps` muestra el estado de `caddy`, `web`, `api`, `worker`, `postgres` y
`redis`; `$COMPOSE logs --since 30m --tail 200 worker` acota el log sin volcar
todo.

## Quién decide y cuándo se avisa

Hoy opera una sola persona, que es también quien responde por el negocio. La
matriz de escalamiento, entonces, no es una cadena de personas sino una de
decisiones:

| Situación | Quién decide | Cuándo se avisa afuera |
|---|---|---|
| Contener: pausar generación, pausar programaciones, frenar el worker | Quien opera, sin consultar | No hace falta |
| Reintentar una publicación con desenlace ambiguo | Quien opera, después de reconciliar | No hace falta |
| Publicar, republicar o borrar algo en Meta | Quien opera, de forma explícita | Siempre, si ya lo vio alguien |
| Subir el presupuesto de IA | Decisión de negocio | Siempre |
| Restaurar una base o rotar la llave maestra | Decisión de negocio | Siempre |

«Avisar afuera» significa: si una pieza equivocada llegó a una cuenta pública, o
si un cliente pudo verla, se cuenta antes de corregirla, porque corregir puede
borrar la evidencia de qué se vio.

Cuando el equipo crezca, los dueños por señal son roles —no personas— y están en
la tabla de umbrales; la asignación nominal se confirma al provisionar el
entorno y se mantiene fuera de Git.

## Los dos frenos, por separado

Generar y publicar se frenan por caminos distintos, y conviene saber cuál se
está usando.

**Frenar la generación** (deja de gastarse en OpenAI): en el panel,
**Configuración**, apagar la política de generación. Por API es un `PATCH` a
`organization/generation-policy` con permiso `organization:manage`, que exige
mandar la política completa y el `expectedVersion` que devolvió el `GET`.

Apagarla **no rechaza pedidos**: los degrada. El preflight pasa a responder
`{"mode":"deterministic","reason":"generation-disabled"}`, o sea que la pieza se
sigue componiendo con marca y tipografía, sin llamar al proveedor y sin costo.
Es el freno correcto cuando OpenAI está caído, lento o caro: la operación no se
detiene, sólo deja de pagar.

**Frenar la publicación**: pausar las programaciones activas desde
**Programación** (transición `pause`), que evita que nazcan turnos nuevos. Lo que
ya está en la cola no se detiene con eso.

**Frenar todo lo que sale**: detener el worker.

```bash
$COMPOSE stop worker
```

No pierde trabajo: la cola vive en PostgreSQL y se reconstruye al arrancar. Sí
interrumpe el lote en curso, que vuelve a reclamarse cuando vence su lease.
Detener el worker frena también la generación, así que si sólo hay que dejar de
pagar IA, el freno correcto es la política, no el worker.

**Lo que ningún freno hace:** la API acepta una orden de publicación aunque la
conexión de Meta esté vencida o revocada. El panel deja de ofrecer el control y
`GET /publishing/readiness` responde `canPublish: false`, pero una llamada
directa crea la orden igual, y esa orden falla recién en la entrega. Por eso
contener con la conexión caída es una decisión de quien opera: el sistema no la
va a tomar sola.

## Publicación fallida o destino sin confirmar

**Síntoma.** En Operación aparece «destinos sin confirmar con Meta» o
«publicaciones que salieron a medias». En el panel, la pieza queda en curso.

**Diagnóstico.**

1. Abrir la pieza y mirar sus destinos: cuál confirmó y cuál no.
2. Clasificar el error del intento. Un error de red o un 5xx de Meta es
   transitorio; un `190` —token— o un permiso faltante es permanente y no se
   arregla reintentando.
3. **Antes de cualquier reintento, comprobar en la cuenta real si el contenido
   ya está publicado.** Un desenlace ambiguo casi siempre es «salió y no nos
   enteramos», y reintentar publica dos veces.

**Contención.** Pausar las programaciones que apunten al mismo destino. No
cancelar la orden si el resultado es ambiguo: cancelar no deshace lo remoto.

**Recuperación.** Con el destino confirmado en Meta, marcar la reconciliación y
cerrar; no crear otra orden. Con el destino efectivamente no publicado y la
causa resuelta, reintentar **sólo el destino fallido**, nunca la pieza entera.

**Verificación.** La pieza queda con todos sus destinos en un estado definido,
la alerta se cierra, y el barrido no la vuelve a abrir en la pasada siguiente.

## Token de Meta vencido o revocado

**Síntoma.** Desaparece el control de publicar. Las entregas fallan con error de
autorización.

**Diagnóstico.**

1. `GET /publishing/readiness` con la cuenta que publica. Con el token vencido o
   revocado responde `{"canPublish":false,"targets":[]}`; sano responde la cuenta
   y sus tres destinos.
2. En **Configuración**, la conexión muestra su salud: `token_expired`,
   `permission_revoked`, `revoked` o `asset_removed`. Por API,
   `GET /connections/meta` con permiso `connections:manage`.
3. `permission_revoked` con `missingPermissions` visibles suele no ser un fallo:
   la app opera con acceso estándar, así que los cinco permisos sólo se conceden
   a personas con rol en la app de Meta. Reconectar desde una cuenta sin rol deja
   exactamente ese estado. Ver
   [`ADR-022`](../architecture/decisions/ADR-022-META-LIVE-STANDARD-ACCESS.md).

**Contención.** Pausar las programaciones activas y no publicar a mano. Como la
API igual aceptaría la orden, éste es el paso que evita llenar la cola de
intentos condenados.

**Recuperación.** Confirmar que quien va a reconectar tiene rol en la app de
Meta, reconectar desde Configuración y validar capacidades. Una conexión revocada
no conserva credencial: la base lo impide con
`meta_connections_revocation_check`, así que la credencial se recrea al
reconectar, no se «repara».

**Verificación.** `publishing/readiness` vuelve a responder la cuenta y los
destinos; se reanudan las programaciones pausadas; queda el evento de auditoría
de la reconexión.

**Cuidado.** Una conexión caída **no** enciende por sí sola la salud operativa:
esa pantalla mide cola, turnos y presupuesto, no conexiones. Lo que la delata es
que el control de publicar no aparece.

## Worker detenido o cola sin consumo

**Síntoma.** En Operación: «trabajos esperando transporte» o «antigüedad del
trabajo más viejo» cruzando su umbral. Nada se publica ni se genera.

**Diagnóstico.**

1. `/ready` de la API: si PostgreSQL o Redis no están, el backlog es consecuencia
   y no causa; seguir el runbook de dependencias.
2. `$COMPOSE ps worker` y `$COMPOSE logs --since 30m --tail 200 worker`. Buscar
   `worker.heartbeat` y `worker.outbox.batch`: sin latidos el proceso no está
   vivo; con latidos y sin lotes no hay trabajo disponible. Para un mensaje
   puntual, `worker.outbox.delivery` registra su desenlace.
3. Un mensaje en `dead_letter` agotó sus intentos y conserva su código de error.

**Contención.** Si el worker está entregando cosas equivocadas, detenerlo
(`$COMPOSE stop worker`). Si está simplemente caído, no hay nada que contener.

**Recuperación.** `$COMPOSE up --detach worker`. La cola se reconstruye desde
PostgreSQL. Un `dead_letter` **no se borra**: se revisa el recurso que describe y
recién ahí se decide reponerlo.

**Verificación.** Los pendientes bajan a cero y la antigüedad del más viejo
vuelve a minutos. Ojo: drenar la cola no apaga la salud operativa si quedan
mensajes detenidos o turnos vencidos; cada motivo se apaga por separado.

## OpenAI no disponible o lento

**Síntoma.** Los briefs no terminan o tardan mucho. Las generaciones fallan.

**Diagnóstico.** Log del worker por `correlationId` del pedido: se registra
latencia y error del proveedor. Un error del proveedor nunca crea un brief
parcial válido; o hay evidencia o no hay brief.

**Contención.** Apagar la política de generación. Deja de pagarse el proveedor y
las piezas siguen componiéndose en modo determinista. Es preferible a detener el
worker, que frenaría también la publicación.

**Recuperación.** Volver a encender la política cuando el proveedor responda.
Los pedidos que fallaron no se reintentan solos con costo: se vuelven a pedir.

**Verificación.** El preflight vuelve a responder `mode: "provider"` con su costo
de referencia, y el costo comprometido del mes sigue donde estaba.

## Presupuesto de IA agotado

**Síntoma.** En Operación, «presupuesto de IA del mes» al 80 % (atención) o al
100 % (urgente).

**Diagnóstico.** En Configuración, comparar el costo comprometido del mes con el
presupuesto declarado. Revisar si el consumo viene de reintentos: un lote que
falla después de que el proveedor generó la imagen conserva el costo igual.

**Contención.** Al 100 % la política deja de admitir intentos con proveedor por
sí sola y degrada a determinista. No hay nada que hacer para frenar el gasto.

**Recuperación.** Subir el presupuesto es **decisión de negocio**, no operativa.
Mientras no se suba, se sigue trabajando en modo determinista.

**Verificación.** El porcentaje vuelve bajo el umbral al cambiar de mes o al
ampliar el presupuesto, y la alerta se cierra.

## Imagen inválida

**Síntoma.** Una pieza no llega a render o Meta rechaza el medio.

**Diagnóstico.** Mirar el activo: formato, dimensiones y checksum. Una URL rota
nunca se envía a Meta; si llegó, el problema es anterior.

**Contención.** Detener el render o la publicación de esa pieza. Conservar el
original si es seguro conservarlo.

**Recuperación.** Reemplazar el medio y volver a componer. No editar el activo
publicado.

**Verificación.** La pieza renderiza, el checksum coincide y el destino acepta el
medio.

## PostgreSQL, Redis o la cola no disponibles

**Síntoma.** `/ready` responde 503. El panel carga pero no guarda.

**Diagnóstico.** `$COMPOSE ps postgres redis` y sus logs acotados. PostgreSQL
conserva la programación y la cola; Redis no es la fuente de verdad de nada que
no se pueda reconstruir.

**Contención.** No reintentar a ciegas. Si el resultado de una publicación quedó
ambiguo, frenar el worker hasta poder reconciliar.

**Recuperación.** Recuperar la dependencia. Al volver, los trabajos se
reconstruyen desde PostgreSQL y la idempotencia evita duplicados: una intención
que ya se ejecutó no se ejecuta otra vez por haberse reencolado.

**Verificación.** `/ready` responde 200, los pendientes drenan y no aparecen
órdenes duplicadas para la misma pieza.

## Alerta operativa de programación o publicación

1. Abrir **Operación** con el permiso `publishing:execute` y registrar causa,
   recurso y hora de observación; no copiar tokens, payloads ni mensajes crudos
   de Meta a un ticket.
2. Seguir únicamente la acción segura indicada: revisar programación para una
   ocurrencia atascada, publicaciones para un destino detenido, configuración
   para una conexión degradada. La bandeja no reintenta ni publica.
3. Para un desenlace ambiguo, reconciliar antes de considerar un reintento. Si
   Meta ya confirmó el destino, no crear otra orden ni borrar la publicación
   remota.
4. Marcar la alerta como revisada sólo después de comprobar el recurso. La
   operación queda auditada; si el barrido vuelve a observar la misma condición,
   la reabre, y eso también queda auditado.
5. Priorizar las urgentes: incluyen ocurrencias atascadas por más de cinco
   minutos y riesgos dentro de la media hora de su horario programado.

## Eliminación o desautorización solicitada desde Meta

1. Confirmar que el callback respondió HTTP 200; nunca copiar la solicitud
   firmada ni el App Secret al ticket o al log.
2. Buscar el evento de auditoría por conexión y operación, no por el
   identificador externo eliminado.
3. Para desautorización, comprobar estado `revoked`, tokens nulos y activos
   removidos.
4. Para eliminación, comprobar además permisos vacíos, nombres sustituidos,
   usernames nulos e identificadores externos reemplazados por referencias
   internas.
5. Abrir la URL pública devuelta y comprobar «Solicitud completada». Esa URL no
   debe revelar cuenta, Page, Instagram ni organización.
6. Repetir el callback firmado en el ambiente controlado: debe responder
   completado y no crear otra conexión, credencial ni publicación.
7. Si una transacción falla, devolver error para que Meta reintente. No emitir un
   código de confirmación antes de que todas las conexiones encontradas terminen.
8. No borrar publicaciones remotas: la solicitud elimina datos de la integración,
   no deshace acciones comerciales previas.

## Rotación o revocación de credenciales

El procedimiento completo —llave maestra, credenciales de proveedor y exposición
— está en [`SECRETS.md`](SECRETS.md). Lo que importa acá es el orden, que no es
intuitivo:

**Sospecha de exposición.** Primero se revoca o rota **en el proveedor**, no en
el archivo de entorno: mientras la credencial siga siendo válida afuera, borrarla
de casa no protege nada. Después se sustituye el valor y se despliega.

**Rotación planificada.** Al revés: se crea la credencial nueva, se carga sin
eliminar la vigente, se despliega, se corre un smoke no destructivo y recién
entonces se revoca la anterior.

**Verificación.** `$COMPOSE ps` con todo saludable y un smoke que no publique
nada. Para la llave maestra, además, que ningún registro referencie la versión
anterior antes de retirarla.

Rotar nunca cambia el token remoto de Meta ni publica contenido.

## Rollback de una release

El procedimiento y sus precondiciones están en
[`VPS_OPERATIONS.md`](VPS_OPERATIONS.md). En resumen operativo: se reconcilian
las publicaciones externas y los trabajos en curso **antes** de mover nada, se
conservan PostgreSQL, Redis y los volúmenes de Caddy, se restaura el `IMAGE_TAG`
de la release anterior y se repiten healthchecks y smoke.

La migración de la release nueva tiene que ser compatible con la versión anterior
**antes** de promover. Si no lo es, el rollback de aplicación no alcanza y lo que
corresponde es el runbook de restauración, que es otra conversación.

## Restauración

1. Restaurar en un entorno aislado, nunca sobre el que está sirviendo.
2. Mantener el worker y todo efecto externo detenidos durante la restauración.
3. Comprobar migraciones y validar las referencias de Cloudinary.
4. Rotar secretos si el incidente lo requiere.

El detalle está en [`BACKUP-RESTORE.md`](BACKUP-RESTORE.md).

## Umbrales operativos, dueño y runbook

El tablero **Operación** mide estas señales y decide su severidad con los
umbrales del dominio (`operationalHealthThresholds`). La pantalla no define
criterio propio: si un número hay que cambiarlo, se cambia ahí y el tablero, la
bandeja y este archivo siguen contando la misma historia.

| Señal | Atención | Urgente | Dueño | Runbook |
|---|---|---|---|---|
| Turnos vencidos sin despachar | 1 | 5 | rol `publisher` | Alerta operativa de programación o publicación |
| Atraso del turno más viejo | 5 min | 30 min | rol `publisher` | Alerta operativa de programación o publicación |
| Trabajos esperando transporte | 20 | 100 | rol `admin` | Worker detenido o cola sin consumo |
| Antigüedad del trabajo más viejo | 5 min | 30 min | rol `admin` | Worker detenido o cola sin consumo |
| Trabajos detenidos (`dead_letter`) | — | 1 | rol `admin` | Worker detenido o cola sin consumo |
| Destinos sin confirmar con Meta | — | 1 | rol `publisher` | Publicación fallida o destino sin confirmar |
| Publicaciones que salieron a medias | 1 | — | rol `publisher` | Publicación fallida o destino sin confirmar |
| Presupuesto de IA del mes | 80 % | 100 % | rol `admin` | Presupuesto de IA agotado |
| Alertas abiertas en la bandeja | 1 de atención | 1 urgente | rol `publisher` | Alerta operativa de programación o publicación |

## Comandos que no se ejecutan sin decidirlo

Ninguno de estos aparece dentro de un paso de este archivo. Están acá para que se
reconozcan cuando alguien los sugiera.

| Comando | Qué destruye |
|---|---|
| `docker compose down -v` | Los volúmenes: base, cola y certificados |
| `docker system prune -a --volumes` | Todas las imágenes y volúmenes del host, incluidas las de rollback |
| `rm -rf /opt/aramayo-content` | Todas las releases, incluida la que sirve |
| `rm -rf /var/lib/docker` | Todo el estado de Docker |
| `DROP DATABASE` / `TRUNCATE` | Datos productivos, sin deshacer |
| Borrar mensajes en `dead_letter` | La evidencia de por qué algo no salió |
| Borrar una publicación en Meta | Contenido que ya vio gente; no es rollback |

La limpieza de una release vieja se hace sólo sobre su ruta SHA exacta, después
de confirmar que ya no es elegible para rollback.

## Registro de simulacros

| Fecha | Simulacro | Resultado |
|---|---|---|
| 2026-09-15 | Token de Meta vencido y revocado | Conforme, con dos correcciones al runbook |
| 2026-09-15 | Cola atascada y proveedor degradado | Conforme |

**2026-09-15 — Token de Meta vencido y revocado.** Sobre una base efímera con la
API real: conexión sana, luego `token_expired`, luego revocación completa, luego
reconexión. Observado: con la conexión sana, `publishing/readiness` devuelve la
cuenta y los tres destinos; con el token vencido pasa a `canPublish:false` y
`targets:[]`, es decir el sistema deja de ofrecer publicar por su cuenta;
reconectar la devuelve a su estado sano.

Dos cosas que el runbook no decía y ahora dice. La primera: intentar marcar la
conexión como revocada conservando la credencial es **rechazado por la base**
(`meta_connections_revocation_check`), así que una conexión revocada nunca
guarda token y la credencial se recrea al reconectar. La segunda, más importante:
`POST /publications/:id/publish` **responde 201 con la conexión revocada**. El
panel no ofrece el control y la disponibilidad dice que no, pero una llamada
directa crea la orden igual y falla recién en la entrega. Por eso la contención
—pausar programaciones y no publicar a mano— es un paso explícito y no algo que
el sistema garantice.

**2026-09-15 — Cola atascada y proveedor degradado.** Con 120 mensajes
pendientes de 45 minutos de antigüedad y uno detenido, la salud operativa
respondió `urgent` nombrando cada motivo con su número y su umbral:
`outbox-backlog` 120 sobre 100, `outbox-age` 45 sobre 30, `dead-letter-messages`
1 sobre 1, más el atraso de turnos del propio escenario. Apagar la política de
generación devolvió `{"mode":"deterministic","reason":"generation-disabled"}` en
el preflight: el freno de IA funciona sin tocar la publicación. Drenar la cola
entregó los 120 y dejó los pendientes en cero; **el mensaje detenido siguió ahí**
y la salud siguió en `urgent` por él, que es lo que se espera: drenar no es
resolver, y cada motivo se apaga por separado.

Los simulacros se rehacen cuando cambia la forma de la cola, la salud operativa o
la conexión con Meta, y se repiten completos antes de cada piloto.
