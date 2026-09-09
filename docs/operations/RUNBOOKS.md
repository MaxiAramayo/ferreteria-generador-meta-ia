# Runbooks requeridos

Este archivo registra runbooks que deben existir antes de producción.

## Publicación fallida

Debe incluir:

- identificar destino e intento;
- clasificar error transitorio o permanente;
- verificar si el contenido existe remotamente;
- reconciliar antes de reintentar;
- reintentar solo destino fallido;
- escalar si el resultado sigue ambiguo.

## Umbrales operativos, dueño y runbook

El tablero `/operacion` mide estas señales y decide su severidad con los
umbrales del dominio (`operationalHealthThresholds`). La pantalla no define
criterio propio: si un número hay que cambiarlo, se cambia ahí y el tablero, la
bandeja y este runbook siguen contando la misma historia.

| Señal | Atención | Urgente | Dueño | Runbook |
|---|---|---|---|---|
| Turnos vencidos sin despachar | 1 | 5 | rol `publisher` | Alerta operativa de programación o publicación |
| Atraso del turno más viejo | 5 min | 30 min | rol `publisher` | Alerta operativa de programación o publicación |
| Trabajos esperando transporte | 20 | 100 | rol `admin` | Worker detenido o cola sin consumo |
| Antigüedad del trabajo más viejo | 5 min | 30 min | rol `admin` | Worker detenido o cola sin consumo |
| Trabajos detenidos (`dead_letter`) | — | 1 | rol `admin` | Worker detenido o cola sin consumo |
| Destinos sin confirmar con Meta | — | 1 | rol `publisher` | Publicación fallida |
| Publicaciones que salieron a medias | 1 | — | rol `publisher` | Publicación fallida |
| Presupuesto de IA del mes | 80 % | 100 % | rol `admin` | Presupuesto de IA agotado |
| Alertas abiertas en la bandeja | 1 de atención | 1 urgente | rol `publisher` | Alerta operativa de programación o publicación |

Los dueños son roles, no personas: la asignación nominal se confirma al
provisionar el entorno y se mantiene fuera de Git.

Antes de escalar, mirar el log estructurado por `correlationId`: la solicitud, la
auditoría y el trabajo que la ejecuta comparten el mismo identificador, y la API
lo devuelve en el encabezado `x-correlation-id` de cada respuesta.

## Worker detenido o cola sin consumo

1. Comprobar `GET /ready` de la API: si PostgreSQL o Redis están caídos, el
   backlog es consecuencia y no causa.
2. Buscar en el log del worker los eventos `worker.heartbeat` y
   `worker.outbox.batch`. Sin latidos, el proceso no está vivo; con latidos y sin
   lotes, no hay trabajo disponible.
3. Un mensaje en `dead_letter` agotó sus intentos: conserva su código de error.
   No borrarlo; revisar el recurso que describe antes de reponerlo.
4. Reiniciar el worker no pierde trabajo: la cola se reconstruye desde
   PostgreSQL. Reiniciar sí interrumpe un lote en curso, que vuelve a reclamarse
   cuando vence su lease.

## Presupuesto de IA agotado

1. Abrir `/configuracion` y comparar el costo comprometido del mes con el
   presupuesto declarado.
2. Al 100 % la política de generación deja de admitir intentos nuevos. No
   subir el presupuesto sin decisión del negocio.
3. Revisar si el consumo viene de reintentos: un lote que falla después de
   Images conserva el costo igual.

## Alerta operativa de programación o publicación

1. Abrir `/operacion` con el permiso `publishing:execute` y registrar la causa,
   recurso y hora de observación; no copiar tokens, payloads ni mensajes crudos
   de Meta a un ticket.
2. Seguir únicamente la acción segura indicada: revisar programación para una
   ocurrencia atascada, publicaciones para un destino detenido o configuración
   para una conexión degradada. La bandeja no reintenta ni publica.
3. Para un desenlace ambiguo, reconciliar antes de considerar un reintento. Si
   Meta ya confirmó el destino, no crear otra orden ni borrar la publicación
   remota.
4. Marcar la alerta como revisada sólo después de comprobar el recurso. La
   operación queda auditada; si el barrido vuelve a observar la misma condición,
   la reabre y también queda auditado.
5. Priorizar las alertas urgentes: incluyen ocurrencias atascadas por más de
   cinco minutos y riesgos dentro de media hora de su horario programado.

## Token de Meta vencido o revocado

- pausar trabajos del destino;
- mostrar conexión degradada;
- notificar administrador;
- comprobar que quien va a reconectar tiene rol en la app de Meta;
- reconectar;
- validar capacidades;
- reanudar trabajos no vencidos;
- auditar.

La app opera con acceso estándar, así que los cinco permisos sólo se conceden a
personas con rol en la app —administración, desarrollo o prueba—. Una reconexión
hecha por alguien sin rol deja la conexión en `permission_revoked` con sus
`missingPermissions` visibles: es la causa esperada, no un fallo del adaptador.
Ver [`ADR-022`](../architecture/decisions/ADR-022-META-LIVE-STANDARD-ACCESS.md).

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
5. Abrir la URL pública devuelta y comprobar “Solicitud completada”. Esa URL no
   debe revelar cuenta, Page, Instagram ni organización.
6. Repetir el callback firmado en el ambiente controlado: debe responder
   completado y no crear otra conexión, credencial ni publicación.
7. Si una transacción falla, devolver error para que Meta reintente. No emitir
   un código de confirmación antes de que todas las conexiones encontradas
   terminen.
8. No borrar publicaciones remotas: la solicitud elimina datos de la
   integración, no deshace acciones comerciales previas.

## OpenAI no disponible

- conservar solicitud y fotos;
- no crear brief parcial como válido;
- reintentar según política;
- permitir composición manual;
- mostrar costo cero y error;
- evitar bloqueo de publicaciones ya finalizadas.

## Imagen inválida

- detener render/publicación;
- conservar original si es seguro;
- mostrar causa;
- permitir reemplazo;
- no enviar URL rota a Meta.

## Cola o Redis no disponible

- PostgreSQL conserva programación;
- marcar sistema degradado;
- no perder nuevas intenciones;
- reconstruir trabajos al recuperar;
- verificar duplicados mediante idempotencia.

## Restauración

- restaurar base en entorno aislado;
- comprobar migraciones;
- validar referencias de Cloudinary;
- no ejecutar trabajos externos durante restauración;
- rotar secretos si el incidente lo requiere.

Las tareas de Fase 7 deben convertir cada sección en pasos operativos con
comandos, responsables, señales de éxito y rollback.
