# Staging temporal en el VPS dedicado

## Alcance

Staging corre las mismas imágenes y manifiestos que producción, con datos y
credenciales propios. Comparte temporalmente el VPS físico decidido en
`ADR-013`, pero no comparte proyecto Compose, base, volúmenes, credenciales,
llaves ni aplicaciones externas con producción.

Producción debe permanecer detenida mientras staging publique `80/443`. No se
ejecutan ambos Caddy al mismo tiempo. Detener staging conserva sus volúmenes;
eliminarlos requiere una autorización destructiva separada.

Empezó habilitando el smoke remoto de OAuth de `P5-T02`, sin worker ni
proveedores. Desde el 2026-09-10, por autorización del usuario, corren todos los
servicios —Caddy, web, API, worker, PostgreSQL y Redis aislados, y la migración
one-shot— y el worker tiene las credenciales de staging de OpenAI y Cloudinary.
Odoo sigue sin credenciales. Meta se usa sólo para OAuth y descubrimiento de
activos: este perfil no autoriza crear containers, publicar contenido ni cambiar
la app a modo publicado.

## Topología y artefactos

Staging reutiliza los manifiestos parametrizables de
[`../production`](../production/README.md). La release remota contiene una copia
inmutable de `compose.yaml` y `Caddyfile` del mismo SHA que produjo las imágenes.
El entorno vive fuera de la release:

| Recurso | Ruta o nombre |
|---|---|
| Releases | `/opt/aramayo-content-staging/releases/<sha>` |
| Release activa | `/opt/aramayo-content-staging/current` |
| Entorno | `/etc/aramayo-content/staging.env` (`0600 root:root`) |
| Proyecto Compose | `aramayo-content-staging` |
| Web | `https://staging.content.ferreteriaaramayo.com.ar` |
| API | `https://api.staging.content.ferreteriaaramayo.com.ar` |
| Callback Meta | `https://api.staging.content.ferreteriaaramayo.com.ar/oauth/meta/callback` |

Compose prefija redes y volúmenes con el nombre del proyecto. El operador debe
rechazar cualquier archivo cuyo `COMPOSE_PROJECT_NAME`, `NODE_ENV` o dominios
no coincidan con esta tabla.

## Preparación segura

1. Confirmar que no haya contenedores ni listeners de producción en `80/443`.
2. Confirmar margen de memoria, swap y disco.
3. Copiar [`.env.example`](.env.example) a
   `/etc/aramayo-content/staging.env` sin imprimir su contenido.
4. Generar dentro del VPS contraseñas distintas para PostgreSQL y Redis y una
   llave `TOKEN_ENCRYPTION_KEYS` nueva.
5. Cargar juntos App ID, App Secret, callback exacta y Graph `v26.0` de
   `Aramayo Content Staging`. Mientras Meta esté deshabilitada, los cuatro
   valores permanecen vacíos; un grupo parcial hace fallar el bootstrap.
6. Dejar vacíos OpenAI, Odoo y Cloudinary: se cargan después, sin imprimirlos,
   como indica [Credenciales de proveedores](#credenciales-de-proveedores).
7. Validar con `docker compose config --quiet` antes de descargar o iniciar.

No usar el seed como credencial. El seed canónico crea la organización, marca y
sucursales sin una contraseña utilizable. El primer administrador se provisiona
mediante el procedimiento auditado descrito en
[`VPS_OPERATIONS.md`](../../docs/operations/VPS_OPERATIONS.md).

## Inicio y verificación

Con la release y el entorno ya validados:

```bash
sudo docker compose \
  --env-file /etc/aramayo-content/staging.env \
  --file /opt/aramayo-content-staging/current/compose.yaml \
  pull web api worker migrate

sudo docker compose \
  --env-file /etc/aramayo-content/staging.env \
  --file /opt/aramayo-content-staging/current/compose.yaml \
  up --detach --wait postgres redis migrate api web caddy worker
```

Verificar HTTPS, `/health`, `/ready`, login y OAuth, y que el último
`worker.heartbeat` del log del worker informe cada proveedor como `habilitada` o
`deshabilitada` según lo cargado.

Antes de cambiar de release se toma una copia con
`sudo aramayo-backup run staging`: queda verificada con una restauración,
cifrada y en Drive. El procedimiento está en
[`BACKUP-RESTORE.md`](../../docs/operations/BACKUP-RESTORE.md).

## Credenciales de proveedores

Las credenciales de staging de OpenAI y Cloudinary —y las de Odoo, cuando
existan— las carga quien las administra, desde la raíz del repositorio:

```bash
bash infrastructure/staging/load-provider-credentials.sh
```

El script las toma del `.env` local, exige que la carpeta de Cloudinary nombre
staging y trata a Odoo como un grupo que se carga entero o no se carga. Las
manda por SSH, por la entrada estándar, a
[`aramayo-staging-credentials`](aramayo-staging-credentials) —instalado en el
VPS como `/usr/local/sbin/aramayo-staging-credentials`—, que acepta sólo los
nombres de su lista, valida el Compose resultante y deja junto al entorno una
copia del anterior. Ninguno de los dos imprime un valor.

Odoo tiene su propio script, porque su token no vive en esta máquina sino en el
`.env` productivo de Odoo:

```bash
bash infrastructure/staging/load-odoo-credentials.sh --comprobar
bash infrastructure/staging/load-odoo-credentials.sh
```

El primero verifica sin mandar nada. El segundo lee el token por SSH, sin
imprimirlo ni guardarlo acá, y lo carga con la URL, la organización y el mapa de
sucursales de staging. La API de Odoo acepta un solo token, así que staging usa
el mismo que tendrá producción: separarlos exige que Odoo acepte un token por
consumidor, y es condición de `P7-T07`.

Sólo el worker usa esas credenciales, y las toma al recrearse:

```bash
sudo docker compose \
  --env-file /etc/aramayo-content/staging.env \
  --file /opt/aramayo-content-staging/current/compose.yaml \
  up --detach --wait --no-deps worker
```

Staging tiene su propio vector store de OpenAI, creado el 2026-09-11 con
`knowledge:corpus --crear-vector-store`. Su ID es `OPENAI_VECTOR_STORE_ID` en el
entorno y queda también en `/etc/aramayo-content/staging-vector-store.id`. El
corpus aprobado se carga como indica
[`OPENAI.md`](../../docs/integrations/OPENAI.md).

## Detención recuperable

```bash
sudo docker compose \
  --env-file /etc/aramayo-content/staging.env \
  --file /opt/aramayo-content-staging/current/compose.yaml \
  down --timeout 30
```

No agregar `--volumes`. Antes de iniciar producción se confirma que staging
esté detenido y que `80/443` estén libres.
