# Soldadora aprobada: preparación y estado remoto

## Resultado real

El usuario aprobó el PNG y copy sin precio y pidió «publica nomas, y continua».
La pieza está desplegada y provisionada en staging, **todavía sin publicar en
Instagram ni Facebook**. El usuario autorizó expresamente el ingreso con la
credencial administradora del Llavero («si autorizo»). El ingreso y la
confirmación visible se completaron sin volver a pedir aprobación comercial.

Se creó una sola orden desde el panel a las 15:20:43Z:
`b2d75f69-40f1-48a8-ad6e-56bd142be220`, snapshot
`5a083000-0000-4000-8000-000000000004`. Ambos destinos siguen `pending`; la
publicación pasó a versión 7. No se debe crear otra orden ni reprovisionar.

El worker efímero terminó durante el arranque por `MEDIA_STORAGE` no exportado
por `MediaModule`. Outbox conserva una fila pendiente con cero intentos y ambos
destinos sin IDs remotos: no se llamó a Meta. La corrección exporta la instancia
existente sin duplicar proveedores. El smoke con Meta/Cloudinary falsos
reprodujo el fallo antes del cambio y luego verificó arranque y cierre ordenado.
La promoción de esa corrección y el procesamiento de la misma orden están
pendientes.

## Versión y evidencia

- PR [14](https://github.com/MaxiAramayo/ferreteria-generador-meta-ia/pull/14),
  commit de implementación `c581b35`, merge desplegado
  `57d6d728845fd5641385dfaa091453da714f21ce`.
- CI de PR `33404360026` y de main `33404698105`: exitosos.
- Imágenes linux/amd64 `33404720781`: exitosas, sin tags mutables.
- API y web están healthy sobre ese SHA; PostgreSQL, Redis y Caddy healthy.
  `/health`, `/ready`, privacidad y ambos PNG respondieron HTTPS 200 con
  verificación TLS. Python local carecía de la cadena CA; Node verificó con su
  almacén confiable, sin desactivar TLS.
- Backup PostgreSQL de 189.295 bytes, formato custom y catálogo verificado:
  `/var/backups/aramayo-content/staging-before-soldadora-20260831.dump`.
  Entorno previo protegido junto a él con extensión `.env`.
- Rollback de aplicación: release previa
  `bc9fdfcbe9a592a6eb867cfc57d7a1a02e0701f0`. No restaurar la base para un
  rollback de código; conservar la nueva revisión y cualquier orden posterior.

## Snapshot exacto

| Campo | Valor |
|---|---|
| Publicación | `5a080000-0000-4000-8000-000000000002` |
| Estado / versión | `approved` / `6` |
| Revisión actual | `5a083000-0000-4000-8000-000000000003`, número 2 |
| Snapshot actual | `5a083000-0000-4000-8000-000000000004` |
| Hash de contenido | `96805be93a54786ea7bf84a0d110627862a61a9e09e9842fc4edf929a3693d46` |
| Hash PNG | `407de4f95c8e18f4c52fa0544785f06f81fe9832de1032a3ac7e977fa0ca7d43` |
| Huella aprobada | `7e44022a2020875ba420e99736711b7f8953051d6afb6bb8d462f59a460b012e` |
| Política | Exactamente `instagram_feed` y `facebook_page` |

El provisionador respondió `verified`, luego `created` y al repetir
`already-provisioned`. La revisión técnica y su snapshot anteriores siguen
intactos. El evento `meta.app-review:provision` conserva fecha de aprobación,
huella, copy, destinos y marca de sustitución.

El PNG público de 1080×1350 y 1.146.451 bytes coincide exactamente con lo
aprobado. El original en Cloudinary staging conserva ese hash y versión
`1788186940`; el identificador de medio es
`5a083000-0000-4000-8000-000000000001`. La variante `meta-feed` del adaptador
existente respondió JPEG de 170.981 bytes y se revisó visualmente completa.
El comprobante está en `output/meta-app-review-private/delivery.json` y no
contiene credenciales.

## Verificaciones comerciales y de cuenta

Odoo volvió a confirmar producto activo LA-SER Inverter 160 A y seis unidades
en cada sucursal a las 15:18:30–31Z. Request IDs: producto
`bf709440-6e6c-4220-a7f4-d78c90e201f7`, Casa Central
`ac57b61f-9fff-490c-ac21-347465207b8f`, Rivadavia
`dabe4a35-ee1a-41bd-a4ec-0d736835b993`. Los request IDs están en el
[paquete de revisión](../integrations/META-APP-REVIEW.md). No se consultó ni
publicó un nuevo precio. Se revalidará stock otra vez al ejecutar la orden si
la pausa vuelve vieja esta evidencia.

El control visible de salud de Meta revalidó a las 15:19Z los cinco permisos
explícitos, `public_profile` implícito y los activos:

- Instagram: `@ferreteria_aramayo`, `17841478812093081`.
- Facebook: `Ferreteria Y Lubricentro Aramayo`, `252222471780140`.

La lectura de las ocho publicaciones recientes de Instagram no encontró la
soldadora. La lectura de `/feed` de Facebook devolvió código 10; no se agregaron
permisos ni se asumió que esa consulta hubiera tenido éxito. La plataforma no
tiene órdenes previas para esta muestra. Confirmar los IDs de cada destino al
publicar y reconciliar cualquier respuesta ambigua.

## App Review

El isotipo A se cargó como `aramayo-app-icon.png`, con recorte completo, se
guardó y volvió a verificarse tras recargar Meta. La pantalla **Publicar**
informa que toda la configuración obligatoria está completa. No se agregó
correo, delegado de datos, categoría ni permisos nuevos; tampoco se pulsó el
botón final de publicación de la app.

La identidad temporal permanece `disabled`, sin entregar credenciales ni
iniciar la ventana de revisión. Siguen pendientes el recorrido y screencast,
la activación/entrega autorizada y el envío de App Review si corresponde al
alcance definitivo. `P5-T08` sigue abierta; no se inició `P5-T09`.

## Próximo paso exacto

1. Promover la corrección de arranque después de CI. El worker fallido está
   detenido; sus cuatro credenciales Cloudinary y override de red temporales
   están en `/run`, protegidos con modo 0600.
2. Revalidar stock si transcurrió tiempo y consultar la orden existente. No
   volver a confirmar publicación ni usar la clave API propuesta anteriormente:
   el panel ya creó su propia orden idempotente.
3. Ejecutar el worker corregido únicamente para la orden
   `b2d75f69-40f1-48a8-ad6e-56bd142be220`, con las redes `backend` y `edge`,
   sin puertos publicados, OpenAI ni Odoo.
4. Observar los dos resultados y guardar IDs y enlaces. Si alguno queda ambiguo,
   reconciliar; nunca crear otra orden para compensar ni volver a publicar un
   destino confirmado.
5. Detener y retirar el worker, eliminar su entorno temporal y cerrar la sesión
   operativa. Continuar App Review sobre la misma orden, sin una segunda pieza.

## Validación local

`pnpm verify` completo en verde, 40 pruebas del paquete de App Review, 80 del
motor, y doble render exacto. La integración
`tools/meta-app-review/provision.integration.ts` se ejecutó contra PostgreSQL
17.9 descartable recién migrado: dry run sin escritura, rollback por colisión,
conservación exacta del historial, reejecución idempotente, almacenamiento
correcto y rechazo ante orden existente. El contenedor fue eliminado.
