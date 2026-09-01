# Soldadora aprobada: preparación y estado remoto

## Resultado real

La pieza aprobada se publicó exactamente una vez en ambos destinos el
2026-09-01. La orden `b2d75f69-40f1-48a8-ad6e-56bd142be220` quedó `published`
y se liquidó a las 12:45:24.780Z sobre el snapshot inmutable
`5a083000-0000-4000-8000-000000000004`:

| Destino | Estado | ID remoto | Enlace verificado |
|---|---|---|---|
| Instagram feed | `published` | `17864904492660609` | [@ferreteria_aramayo/p/DcvsTvnHNGy](https://www.instagram.com/ferreteria_aramayo/p/DcvsTvnHNGy/) |
| Facebook Page | `published` | `252222471780140_1598131635337533` | [Publicación de Ferretería y Lubricentro Aramayo](https://www.facebook.com/1587397443077619/posts/1598131635337533) |

El panel muestra la publicación como versión 8 y bloquea volver a publicarla.
Ambos enlaces se abrieron en las cuentas reales y mostraron el bitmap y copy
aprobados, sin precio. Facebook la marca como pública. La publicación no se
promocionó, programó ni envió a historias.

El primer worker falló antes de contactar a Meta porque `MediaModule` no
exportaba `MEDIA_STORAGE`. Outbox y ambos destinos conservaron cero intentos e
IDs remotos vacíos. PR [15](https://github.com/MaxiAramayo/ferreteria-generador-meta-ia/pull/15)
exportó la instancia existente y agregó un smoke de arranque con Meta y
Cloudinary falsos; `pnpm verify`, CI de PR `33508422624` y CI de main
`33508711483` pasaron. Las imágenes inmutables del merge
`bc32e840ec67676198c36d69fc49bab9bc4a2ec8` se publicaron en el run
`33508917207`.

Sólo el worker corregido de ese SHA se ejecutó de forma efímera. Arrancó con
PostgreSQL y Redis `up`, OpenAI deshabilitado, Cloudinary y Meta habilitados;
outbox registró `claimed=1 delivered=1 failed=0`. Luego se detuvo, eliminó el
contenedor y borró el entorno y override temporales de `/run`.

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
| Estado / versión | `published` / `8` |
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

Inmediatamente antes de ejecutar el worker, Odoo confirmó producto activo y
seis unidades en cada negocio a las 12:44:32–33Z del 2026-09-01. Request IDs:

- producto: `701d2c8e-896d-4224-889a-603b4a91ab36`;
- Casa Central: `73c7973b-55c3-406f-96d6-71278eea47e5`;
- Rivadavia: `e5a17d8f-8aef-46c1-8342-99e07265d61d`.

No se consultó ni publicó un precio. Meta había revalidado los activos y seis
permisos a las 15:19Z del 2026-08-31. La ejecución remota confirmó los dos IDs
y la revisión visible de los enlaces confirmó cuenta, copy y media exactos.

## App Review: descartada por alcance

El isotipo A se cargó como `aramayo-app-icon.png`, con recorte completo, se
guardó y volvió a verificarse tras recargar Meta. La pantalla **Publicar**
informó que toda la configuración obligatoria estaba completa sin correo, sin
delegado de datos y sin permisos nuevos.

El 2026-09-01 la persona administradora pulsó **Publicar**. La consola respondió
«Tu aplicación se ha publicado correctamente» y la describe como «disponible
para su uso público». **Acciones requeridas** no informa nada pendiente para
conservar el acceso.

Con la app publicada se resolvió no enviar App Review. El acceso estándar se
aprueba automáticamente y alcanza porque quienes usan la plataforma tienen rol
en la app; el acceso avanzado existe para personas usuarias sin rol y la
clasificación Tech Provider, para operar activos de otros portfolios. Aramayo
opera los suyos. La decisión, sus fuentes y sus consecuencias están en
[`ADR-022`](../architecture/decisions/ADR-022-META-LIVE-STANDARD-ACCESS.md).

En consecuencia no hay screencast, guion recorrido ni presentación de permisos.
La identidad temporal permanece `disabled`, sin sesiones y sin credencial
entregada: la ventana de 30 días nunca empezó. `P5-T08` quedó cerrada con esa
desviación registrada. `P5-T09` todavía no se inició.

**Precondición permanente**: quien conecte Meta desde el panel debe tener rol en
la app —administración, desarrollo o prueba—. Sin ese rol el acceso estándar no
concede los cinco permisos, la conexión queda `permission_revoked` con sus
`missingPermissions` visibles y no puede publicar.

### Lectura directa de la consola, 2026-09-01

Se verificó el estado en Meta for Developers sin modificar ninguna
configuración:

| Pantalla | Lo que muestra |
|---|---|
| Publicar | Insignia «Publicada»; la única acción ofrecida es **Anular publicación** |
| Acciones requeridas | «No tienes ningún elemento de acción requerida para mostrar» |
| Permisos y funciones | Los cinco permisos en **«Listo para prueba»** —etiqueta del acceso estándar—, más `business_management` y `public_profile` que Meta agrega con los casos de uso; ningún otro añadido y ninguno con acceso avanzado |
| Roles de la aplicación | Una sola persona con rol Administrador; cero evaluadores; la app pertenece a la cuenta empresarial Ferretería y Lubricentro Aramayo |
| Información básica | Dominio `staging.content.ferreteriaaramayo.com.ar`, ícono `aramayo-app-icon.png`, URLs legales y callback de eliminación configurados |

Llamadas registradas por permiso en la ventana que informa la consola:
`pages_show_list` 42, `pages_read_engagement` 42, `public_profile` 38,
`instagram_basic` 25, `instagram_content_publish` 18, `business_management` 14 y
`pages_manage_posts` 11. Son coherentes con el descubrimiento de activos y la
única publicación ejecutada.

**El nombre de la app ya es `Aramayo Content Platform`**; «Staging» sobrevive
sólo en la aplicación de Instagram del caso de uso, `Aramayo Content Staging-IG`.
El ambiente lo marca el dominio, no el nombre.

## Próximo paso exacto

1. Conservar esta única orden como evidencia; no volver a publicarla, editarla
   ni reprovisionarla.
2. Retirar la identidad temporal de revisión de staging según su plan de baja:
   nunca se activó ni se entregó y ya no tiene propósito. Borrar también su
   entrada del Llavero local.
3. Iniciar `P5-T09` reutilizando la publicación existente, sin crear otra orden
   para la misma pieza.
4. Conservar los roles de la app para las personas que operan la plataforma.
   Perder el rol equivale a perder la capacidad de publicar, aunque el panel
   siga operativo.
5. Reabrir `ADR-022` antes de cualquier trabajo que involucre activos de otro
   negocio: eso exigiría Tech Provider, acceso avanzado, verificación del
   negocio y App Review.

## Validación local

`pnpm verify` completo en verde, 40 pruebas del paquete de App Review, 80 del
motor, y doble render exacto. La integración
`tools/meta-app-review/provision.integration.ts` se ejecutó contra PostgreSQL
17.9 descartable recién migrado: dry run sin escritura, rollback por colisión,
conservación exacta del historial, reejecución idempotente, almacenamiento
correcto y rechazo ante orden existente. El contenedor fue eliminado.
