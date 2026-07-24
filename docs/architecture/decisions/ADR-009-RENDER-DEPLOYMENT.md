# ADR-009: despliegue inicial en Render

- Estado: aceptado
- Fecha: 2026-07-24

## Contexto

El monorepo necesita ejecutar una web Next.js, una API NestJS y un worker
continuo, además de PostgreSQL y un transporte Redis-compatible. La etapa
inicial privilegia trazabilidad y simplicidad operativa sobre portabilidad
perfecta o escalado prematuro.

## Decisión

Usar Render como plataforma inicial de staging y piloto:

- `apps/web`: web service Next.js;
- `apps/api`: web service NestJS público sólo en las rutas necesarias;
- `apps/worker`: background worker sin entrada de red;
- Render Postgres: estado canónico;
- Render Key Value: transporte BullMQ y caché descartable;
- Cloudinary: media;
- Blueprint versionado para describir recursos y variables sin secretos;
- imágenes o runtimes con Node `24.18.0` fijado;
- servicios de un ambiente en la misma región y red privada;
- migraciones mediante `preDeployCommand` controlado, nunca desde cada réplica;
- healthcheck y cierre ordenado con `SIGTERM`.

Producción y staging usan recursos, bases, colas, credenciales y dominios
separados. `P0-T07` definirá nombres, región, propietarios, callbacks, tamaños,
backups y promoción exacta antes de provisionar producción.

## Restricciones

- No se crean recursos remotos en esta tarea.
- El filesystem de servicios se considera efímero.
- La API no depende de llamadas entrantes al worker.
- Redis/Key Value puede perder datos sin perder estado de negocio.
- Un deploy de API incompatible con worker requiere estrategia expand-contract
  y orden explícito.
- Render Workflows no se adopta mientras permanezca beta; BullMQ conserva el
  modelo de ejecución ya decidido.

## Alternativas descartadas

### Vercel más otro proveedor de backend

Vercel es una opción sólida para Next.js, pero obliga a operar desde el inicio
dos planos de despliegue y redes diferentes sin una necesidad de escala que lo
justifique.

### Railway

También permite desplegar el monorepo completo. Render se elige por distinguir
web services, background workers, Postgres administrado y Key Value dentro de
una topología y Blueprint explícitos.

### Kubernetes o nube IaaS

Ofrecen mayor control, pero agregan red, orquestación, parches y observabilidad
antes de tener carga real.

### VPS único

Reduce costo inicial, pero mezcla fallos, secretos, backups y despliegues en un
solo host, y aumenta la carga operativa.

## Consecuencias

- Existe dependencia inicial de Render, mitigada por contenedores, PostgreSQL,
  protocolo Redis y configuración portable.
- Los servicios con worker y bases requieren planes pagos; el costo se revisará
  antes de provisionar.
- Alta disponibilidad y recuperación se validan en Fase 7, no se presuponen.

## Fuentes verificadas

- [Tipos de servicio de Render](https://render.com/docs/service-types)
- [Background workers](https://render.com/docs/background-workers)
- [Red privada](https://render.com/docs/private-network)
- [Blueprints](https://render.com/docs/infrastructure-as-code)
- [Soporte de monorepos](https://render.com/docs/monorepo-support)
