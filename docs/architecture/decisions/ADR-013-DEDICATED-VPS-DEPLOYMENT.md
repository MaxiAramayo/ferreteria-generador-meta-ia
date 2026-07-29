# ADR-013: VPS dedicado con Docker Compose y Caddy

- Estado: aceptado
- Fecha: 2026-07-29
- Reemplaza: decisión de proveedor de
  [ADR-009](ADR-009-RENDER-DEPLOYMENT.md) y hostnames/costo de
  [ADR-012](ADR-012-IDENTITY-ENVIRONMENTS-OWNERSHIP.md)

## Contexto

La topología administrada de Render fue aceptada antes de conocer su costo
real. Al configurar web, API, worker, PostgreSQL y Key Value, el usuario observó
un total cercano a USD 32 mensuales. Ese importe no resulta razonable para el
piloto cuando un VPS separado ofrece más capacidad por cerca de USD 10
mensuales.

El usuario adquirió un VPS nuevo con 4 núcleos, 8 GB de RAM y 75 GB de disco.
El host actual de `ferreteriaaramayo.com.ar`, su web comercial y Odoo 18 no
forman parte de este despliegue y no se modifican.

La plataforma también debe conservar una evolución posible hacia SaaS. Esa
necesidad exige aislamiento por organización y capacidad de separar procesos;
no exige Kubernetes ni una instalación completa por cliente durante el piloto.

## Decisión

Usar el VPS nuevo exclusivamente para Aramayo Content Platform:

- Docker Compose mantiene procesos y dependencias separados;
- Caddy `2.11.4` es el único punto de entrada y administra HTTPS;
- `content.ferreteriaaramayo.com.ar` sirve la web Next.js;
- `api.content.ferreteriaaramayo.com.ar` sirve la API NestJS;
- worker, PostgreSQL y Redis permanecen en una red Docker interna;
- Cloudinary, OpenAI y Meta continúan como proveedores HTTPS externos;
- web, API, worker y migraciones se construyen como imágenes distintas,
  identificadas por SHA de commit;
- una migración one-shot debe terminar antes de que API y worker arranquen;
- el worker comienza con concurrencia uno y Chromium fijado por la imagen
  Playwright compatible;
- el modelo SaaS inicial usa PostgreSQL compartido con ownership obligatorio
  por `organizationId`, credenciales y límites por organización.

El repositorio incluye scaffolding y validaciones locales. Esta decisión no
autoriza desplegar producción antes de completar las dependencias de Fase 7.

## Recursos iniciales

| Componente | Límite inicial |
|---|---:|
| Web | 1 GB RAM |
| API | 1 GB RAM |
| Worker + Chromium | 2,5 GB RAM y 1 GB de `shm` |
| PostgreSQL | 2 GB RAM |
| Redis | 512 MB RAM, `noeviction` |

Los límites protegen el host de un proceso descontrolado y no son SLO. Se
ajustan sólo con medición. La suma nominal puede superar el uso físico
simultáneo; si el host mantiene presión de memoria, se reduce carga o se separa
PostgreSQL/worker antes de aumentar concurrencia.

## Invariantes

- El VPS de Odoo y la web pública no recibe contenedores, bases ni secretos de
  Content.
- Sólo Caddy publica puertos de aplicación.
- PostgreSQL y Redis no tienen puertos de host.
- La API confía en un único proxy porque sólo Caddy comparte su red pública.
- Un artefacto desplegable identifica el commit que lo produjo.
- Ningún `.env` real entra al contexto Docker ni a Git.
- Los datos sobreviven reemplazos de contenedor mediante volúmenes, pero un
  volumen o snapshot local no se presenta como backup.
- Producción no se considera disponible ni recuperable hasta probar backup,
  restauración, observabilidad y rollback.
- Staging y producción no reutilizan datos ni credenciales. El ambiente remoto
  de staging sigue pendiente y no se simula con la base de producción.

## Caddy frente a Nginx

Caddy se elige porque el caso necesita dos reverse proxies simples y
certificados automáticos. Reduce configuración, elimina un job separado de
Certbot y conserva logs estructurados. Nginx sigue siendo técnicamente válido,
pero no agrega una capacidad necesaria al piloto.

## Consecuencias

- El costo base baja, pero parches, firewall, backups, monitoreo y respuesta a
  incidentes pasan a responsabilidad operativa propia.
- El host único no ofrece alta disponibilidad. El objetivo inicial es
  recuperación probada, no continuidad ante pérdida total del VPS.
- Debe elegirse un backup cifrado fuera del VPS y ensayar su restauración antes
  del piloto.
- Debe confirmarse un registry y una identidad de despliegue antes de publicar
  imágenes o acceder al servidor.
- El VPS permite una primera versión multiempresa, pero onboarding, cuotas,
  facturación, soporte y administración de tenants siguen siendo trabajo de
  producto futuro.

## Alternativas descartadas

### Render administrado

Reduce carga operativa, pero el costo observado no se justifica para la carga y
etapa actuales. La portabilidad se conserva con PostgreSQL, Redis, contenedores
y configuración tipada.

### Compartir el VPS existente con Odoo

Mezclaría picos de Chromium, migraciones y consumo de base con un sistema
comercial ya productivo. Aumenta el radio de impacto y contradice el aislamiento
aprobado por el usuario.

### Dos VPS desde el inicio

Separar aplicación y base reduce acoplamiento, pero todavía no existe carga que
justifique el segundo host. Será el primer paso de escala si memoria, disco,
RTO o backlog lo requieren.

### Nginx y Certbot

Funciona, pero agrega configuración y renovación separada sin una necesidad de
routing que Caddy no pueda cubrir.

## Evidencia local

- [`infrastructure/production/`](../../../infrastructure/production/) contiene
  Dockerfile, Compose, Caddyfile, contrato de entorno y manual.
- `pnpm production:config` valida el modelo Compose y sus límites de red.
- `pnpm production:caddy` valida el Caddyfile con la imagen exacta.
- `pnpm production:build` construye targets locales sin publicar ni desplegar.
- `pnpm production:smoke` aplica migraciones en PostgreSQL efímero, inicia los
  procesos, ejecuta Chromium y elimina todos los recursos de validación.

## Fuentes verificadas

Consultadas el 2026-07-29:

- [HTTPS automático de Caddy](https://caddyserver.com/docs/automatic-https)
- [Reverse proxy de Caddy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
- [Imagen oficial de Caddy](https://hub.docker.com/_/caddy)
- [Orden de inicio en Docker Compose](https://docs.docker.com/compose/how-tos/startup-order/)
- [Docker de Playwright](https://playwright.dev/docs/docker)
