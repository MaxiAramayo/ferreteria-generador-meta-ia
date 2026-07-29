# ADR-012: identidad operativa, ambientes y propietarios

- Estado: aceptado
- Fecha: 2026-07-28

> La identidad, RBAC y ownership de este ADR siguen vigentes. Los hostnames,
> proveedor y costo de despliegue fueron reemplazados el 2026-07-29 por
> [ADR-013](ADR-013-DEDICATED-VPS-DEPLOYMENT.md).

## Contexto

`P0-T07` debe cerrar las decisiones que condicionan sesiones, autorización,
URLs, callbacks, secretos y separación de ambientes. No existe un dominio
propio confirmado ni responsables nominales aprobados. Eso no debe conducir a
inventar una propiedad de DNS, compartir cuentas personales o reutilizar
credenciales entre staging y producción.

La topología base ya fue elegida en
[ADR-009](ADR-009-RENDER-DEPLOYMENT.md) y la identidad técnica en
[ADR-007](ADR-007-INTERNAL-SESSIONS-RBAC.md).

## Decisión

### Identidad de aplicación

- La plataforma conserva identidad local, sesiones opacas revocables y RBAC.
- No hay registro público. Un `admin` crea o invita cada identidad.
- Una persona usa una identidad propia; no se admiten cuentas compartidas.
- Los roles son acumulables y no implican jerarquía:
  - `admin`: usuarios, membresías, políticas, organización y conexiones;
  - `editor`: borradores, revisiones y medios;
  - `approver`: revisión, aprobación y programación;
  - `publisher`: publicación, reconciliación y reintentos;
  - `viewer`: lectura.
- `admin` no hereda permisos editoriales por ser administrador. Una persona que
  cumpla más de una función recibe roles explícitos.
- El primer administrador del piloto se crea mediante un procedimiento de
  bootstrap auditado. Su identidad nominal se confirma al provisionar staging;
  ningún email real se versiona.

### Ambientes y hostnames

La primera vertical usa hostnames administrados por Render. Esta decisión evita
comprar o atribuir un dominio no confirmado y sigue siendo reversible.

| Ambiente | Web | API |
|---|---|---|
| Staging | `https://aramayo-content-staging.onrender.com` | `https://aramayo-content-api-staging.onrender.com` |
| Piloto de producción | `https://aramayo-content.onrender.com` | `https://aramayo-content-api.onrender.com` |

Los nombres son objetivos del futuro Blueprint y se validan al provisionar. Si
Render no puede asignar alguno, el reemplazo se registra antes de configurar
OAuth. Ningún callback se habilita contra una URL tentativa.

Un dominio propio se evalúa en Fase 7. Migrarlo exige:

1. confirmar propiedad y responsable DNS;
2. verificar TLS;
3. cambiar `WEB_ORIGIN`, `NEXT_PUBLIC_API_BASE_URL` y allowlists;
4. registrar redirects y URLs legales en Meta;
5. ejecutar smoke de sesión, CSRF, OAuth y webhooks;
6. mantener el hostname anterior hasta completar la promoción.

### Propiedad operativa

La propiedad se asigna a funciones, no a una cuenta compartida:

| Función propietaria | Alcance |
|---|---|
| Administrador de plataforma | Render, PostgreSQL, Key Value, despliegues, llaves maestras y recuperación |
| Administrador de identidad | altas, bajas, roles, sesiones y revisión trimestral de acceso |
| Administrador de Meta Business | app, activos, permisos, tokens y revisión de la plataforma |
| Administrador de OpenAI | proyecto, API key, presupuesto y alertas |
| Administrador de medios | producto y credenciales de Cloudinary |
| Responsable de negocio | aprobación de contenido, políticas y datos comerciales |

Una persona puede asumir varias funciones durante el piloto, pero accede con
cuentas individuales. La asignación nominal vive en el inventario privado del
proveedor y en auditoría, no en Git.

### Costo

Se acepta la topología mínima de referencia para continuar el desarrollo, no el
provisionamiento. Con los precios consultados el 2026-07-28, mantener web, API,
worker, PostgreSQL y Key Value pagos en ambos ambientes tiene un orden de
magnitud de USD 82 mensuales, antes de impuestos, almacenamiento o consumo de
proveedores. Crear recursos o generar cargos conserva una confirmación externa
separada.

## Invariantes

- Staging y producción no comparten bases, colas, proyectos Cloudinary/OpenAI,
  app Meta, credenciales ni llaves de cifrado.
- Web y API son los únicos servicios con entrada pública. El worker no recibe
  tráfico entrante.
- PostgreSQL y Key Value usan URLs internas y no habilitan acceso público
  permanente.
- La API expone sólo salud, sesión, OAuth, webhooks y casos de uso autorizados.
- Un cambio de hostname invalida la configuración previa de cookies, CORS,
  redirects y callbacks hasta volver a verificarla.
- Quitar una membresía revoca sus sesiones. La baja de una persona también
  elimina su acceso individual a Render y a cada proveedor.

## Consecuencias

- `P2-T02` puede implementar autenticación sin esperar una compra de dominio.
- Meta no se conecta hasta que los hostnames reales estén provisionados y
  registrados.
- Un dominio propio mejora presentación y control, pero no es requisito para el
  desarrollo ni para la identidad local.
- Los responsables nominales se mantienen fuera del repositorio para evitar
  datos personales y cuentas compartidas.

## Aprobación

El usuario pidió continuar con las tareas siguientes el 2026-07-28 después de
recibir la topología propuesta y su estimación de costo. La aprobación cubre la
decisión documental y la implementación local; no autoriza provisionamiento,
compra de dominio ni cargos remotos.

## Fuentes verificadas

- [Dominios personalizados de Render](https://render.com/docs/custom-domains)
- [Red privada de Render](https://render.com/docs/private-network)
- [Background workers de Render](https://render.com/docs/background-workers)
- [Blueprint YAML](https://render.com/docs/blueprint-spec)
- [Precios de Render](https://render.com/pricing)
- [Notificaciones de Cloudinary](https://cloudinary.com/documentation/notifications)
