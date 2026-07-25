# ADR-010: salud de procesos como paquete compartido

- Estado: aceptado
- Fecha: 2026-07-25
- Tarea: `P0-T05`

## Contexto

La API y el worker necesitan responder la misma pregunta operativa: si el
proceso está vivo y si puede aceptar tráfico o trabajos. Ambos consultan
PostgreSQL y Redis, ambos deben traducir un fallo de proveedor a un estado
neutro y ninguno puede exponer cadenas de conexión en su respuesta.

Implementar esa lógica dos veces produce divergencia silenciosa: timeouts
distintos, un proceso que informa `up` desde un pool ocioso, o un mensaje de
error que filtra host, usuario o base de datos.

Los límites de paquetes registrados en `AGENTS.md` no contemplaban un lugar para
código de infraestructura compartido entre procesos: `domain` es puro,
`contracts` sólo declara tipos y `configuration` valida entorno.

## Decisión

Se agrega `packages/process-health` con:

- el puerto `DependencyProbe`;
- las implementaciones de PostgreSQL y Redis;
- la agregación de liveness y readiness sobre los contratos publicados en
  `@aramayo/contracts`.

El paquete no depende de NestJS, Next.js ni `@aramayo/configuration`. Recibe
cadenas de conexión ya reveladas en el borde de composición de cada proceso, de
modo que `SecretValue.reveal()` ocurre en un único punto explícito por
aplicación y no dentro de la lógica de salud.

Las sondas abren una conexión por verificación en lugar de reutilizar un pool.
Durante el bootstrap el objetivo es detectar credenciales, red o base
inexistentes; un pool ocioso puede informar disponibilidad sin revalidar nada.

## Invariantes

- Liveness nunca consulta dependencias.
- Readiness consulta todas las dependencias declaradas y sólo informa `ready`
  cuando todas responden.
- Una sonda traduce cualquier fallo a `down`; nunca propaga el error del
  proveedor.
- La respuesta contiene nombre de dependencia, estado y latencia: ni cadenas de
  conexión, ni credenciales, ni mensajes externos.
- Cambiar la semántica de readiness se hace en el paquete, no en una aplicación.

## Alternativas descartadas

### Duplicar las sondas en `apps/api` y `apps/worker`

Es la opción con menos archivos, pero repite manejo de timeouts, limpieza de
conexiones y redacción de errores en dos procesos que deben coincidir. El primer
cambio de política de readiness quedaría aplicado a medias.

### Colocar las sondas en `packages/domain`

Contamina reglas puras con clientes de infraestructura y obliga al dominio a
conocer PostgreSQL y Redis.

### Usar `@nestjs/terminus`

Resuelve el caso HTTP de la API, pero no cubre el worker —que no expone
HTTP— y ata la definición de readiness al framework antes de tener una
necesidad concreta.

## Consecuencias

- `AGENTS.md` y `ARCHITECTURE.md` incorporan el nuevo límite.
- Cuando `P2` introduzca Prisma, la sonda de PostgreSQL pasará a usar el pool
  real detrás del mismo puerto, sin cambiar controladores ni servicios.
- Cualquier proceso futuro (por ejemplo un scheduler separado) obtiene readiness
  consistente importando el paquete.
