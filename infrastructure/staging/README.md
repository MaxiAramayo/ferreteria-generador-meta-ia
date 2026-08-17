# Staging temporal en el VPS dedicado

## Alcance

Este perfil habilita el smoke remoto de OAuth de `P5-T02`. Comparte
temporalmente el VPS físico decidido en `ADR-013`, pero no comparte proyecto
Compose, base, volúmenes, credenciales, llaves ni aplicaciones externas con
producción.

Producción debe permanecer detenida mientras staging publique `80/443`. No se
ejecutan ambos Caddy al mismo tiempo. Detener staging conserva sus volúmenes;
eliminarlos requiere una autorización destructiva separada.

Durante el smoke OAuth se inician solamente:

- Caddy;
- web y API;
- PostgreSQL y Redis aislados;
- la migración one-shot.

El worker queda detenido. OpenAI, Odoo y Cloudinary permanecen sin credenciales.
Meta se usa sólo para OAuth y descubrimiento de activos; este perfil no autoriza
crear containers, publicar contenido ni cambiar la app a modo publicado.

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
5. Cargar únicamente el App ID y App Secret de `Aramayo Content Staging`.
6. Mantener vacíos OpenAI, Odoo y Cloudinary.
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
  pull web api migrate

sudo docker compose \
  --env-file /etc/aramayo-content/staging.env \
  --file /opt/aramayo-content-staging/current/compose.yaml \
  up --detach --wait postgres redis migrate api web caddy
```

Verificar HTTPS, `/health`, `/ready`, login y OAuth. El servicio `worker` no
debe aparecer activo.

## Detención recuperable

```bash
sudo docker compose \
  --env-file /etc/aramayo-content/staging.env \
  --file /opt/aramayo-content-staging/current/compose.yaml \
  down --timeout 30
```

No agregar `--volumes`. Antes de iniciar producción se confirma que staging
esté detenido y que `80/443` estén libres.
