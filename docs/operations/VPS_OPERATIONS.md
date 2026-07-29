# Operación del VPS dedicado

## Propósito y alcance

Este manual describe cómo acceder, inspeccionar, mantener y desplegar Aramayo
Content Platform en el VPS dedicado. No autoriza omitir las puertas de Fase 7,
activar proveedores reales ni iniciar el piloto sin backup externo y rollback
probado.

El VPS aloja únicamente esta plataforma. La web comercial y Odoo permanecen en
el VPS anterior y no tienen conectividad de aplicación con este host.

## Estado verificado

Inventario comprobado el 2026-07-29:

| Campo | Valor |
|---|---|
| Proveedor | OVHcloud |
| Hostname | `vps-f94a1dd2.vps.ovh.ca` |
| IPv4 | `144.217.91.115` |
| IPv6 | `2607:5300:205:200::9f41` |
| Sistema | Ubuntu `26.04 LTS`, x86-64 |
| Kernel | `7.0.0-28-generic` |
| Capacidad | 4 vCPU, 7,6 GiB RAM, 72 GB ext4 útiles |
| Swap | 2 GiB, `vm.swappiness=10` |
| Docker | Engine `29.6.2`, Compose `5.3.1` |
| Hora del host | UTC sincronizada por NTP |
| Hora de aplicación | `America/Argentina/Cordoba` |
| Release preparada | `3b83df4c667e8b14b3ff1e65363e6e6cf1a5ebf1` |
| Estado de aplicación | Sin contenedores ni volúmenes iniciados |

Al cerrar la preparación había 67 GB libres, 7,1 GiB de memoria disponible y
ningún uso de swap. AppArmor, UFW, Docker, actualizaciones automáticas y
sincronización horaria estaban activos.

## DNS e ingreso público

Donweb sirve estos cuatro registros con TTL observado de 900 segundos:

| Tipo | Nombre | Destino |
|---|---|---|
| `A` | `content.ferreteriaaramayo.com.ar` | `144.217.91.115` |
| `AAAA` | `content.ferreteriaaramayo.com.ar` | `2607:5300:205:200::9f41` |
| `A` | `api.content.ferreteriaaramayo.com.ar` | `144.217.91.115` |
| `AAAA` | `api.content.ferreteriaaramayo.com.ar` | `2607:5300:205:200::9f41` |

Caddy será el único ingreso público y publicará `80/tcp`, `443/tcp` y
`443/udp`. PostgreSQL, Redis, API directa y worker nunca publican puertos. El
correo ACME está configurado únicamente en el archivo remoto protegido.

No modificar los registros `@`, `www`, correo u Odoo desde este procedimiento.

## Acceso SSH

La conexión habitual desde una terminal es:

```bash
ssh ubuntu@144.217.91.115
```

También funciona el hostname:

```bash
ssh ubuntu@vps-f94a1dd2.vps.ovh.ca
```

La huella ED25519 verificada del host es:

```text
SHA256:VhtsNFHULdQRQRYRRC2OkFc43SYEoVFaYBTJDKOvLgk
```

En la primera conexión se compara la huella antes de aceptar. Si cambia sin una
reinstalación planificada, detenerse y verificar desde la consola de OVHcloud;
no borrar la entrada de `known_hosts` por costumbre.

Para salir:

```bash
exit
```

Restricciones vigentes:

- sólo el usuario `ubuntu` accede inicialmente;
- autenticación exclusivamente por clave ED25519;
- contraseña, teclado interactivo, root y X11 están deshabilitados;
- `ubuntu` usa `sudo` para tareas administrativas;
- `ubuntu` no pertenece al grupo `docker`, porque ese grupo equivale a root.

Nunca copiar una clave privada al servidor ni enviarla por chat. Para revocar un
acceso se elimina únicamente su línea exacta de `authorized_keys`, manteniendo
otra sesión administrativa abierta hasta comprobar el acceso restante.

## Directorios y propietarios

| Ruta | Modo | Uso |
|---|---:|---|
| `/opt/aramayo-content` | `0750 root:root` | Releases declarativas |
| `/opt/aramayo-content/releases/<sha>` | `0750 root:root` | Manifiesto inmutable por commit |
| `/opt/aramayo-content/current` | symlink | Release seleccionada |
| `/etc/aramayo-content` | `0700 root:root` | Configuración privada |
| `/etc/aramayo-content/production.env` | `0600 root:root` | Entorno y secretos productivos |
| `/var/backups/aramayo-content` | `0700 root:root` | Área temporal de backup local |

El archivo productivo contiene:

- dominios y correo ACME;
- SHA exacto de imagen;
- contraseñas independientes de PostgreSQL y Redis;
- llave maestra de cifrado generada en el propio VPS;
- grupos OpenAI, Cloudinary y Meta vacíos hasta tener credenciales productivas.

No usar `cat`, `less`, `env`, `docker inspect` ni `docker compose config` sin
`--quiet` sobre ese archivo: pueden mostrar secretos. Para editarlo se usa:

```bash
sudoedit /etc/aramayo-content/production.env
```

Después de editar:

```bash
sudo stat -c '%n %a %U:%G' /etc/aramayo-content/production.env
sudo docker compose \
  --env-file /etc/aramayo-content/production.env \
  --file /opt/aramayo-content/current/compose.yaml \
  config --quiet
```

El resultado esperado del primer comando termina en `600 root:root`; el segundo
no imprime la configuración expandida.

## Inspección rutinaria segura

Estos comandos no modifican servicios:

```bash
uptime
free -h
df -h /
sudo swapon --show
sudo ufw status verbose
sudo systemctl --no-pager --full status docker
sudo docker system df
sudo docker ps
sudo readlink -f /opt/aramayo-content/current
```

Cuando la aplicación esté iniciada:

```bash
sudo docker compose \
  --env-file /etc/aramayo-content/production.env \
  --file /opt/aramayo-content/current/compose.yaml \
  ps

sudo docker compose \
  --env-file /etc/aramayo-content/production.env \
  --file /opt/aramayo-content/current/compose.yaml \
  logs --since 15m --tail 200 api
```

Cambiar `api` por `web`, `worker`, `postgres`, `redis` o `caddy` según el
incidente. Los logs pueden contener datos operativos: no pegarlos completos en
issues, chats o capturas.

## Firewall y exposición

UFW aplica:

- deny de ingreso por defecto;
- `22/tcp` para SSH;
- `80/tcp` para ACME y redirección HTTPS;
- `443/tcp` para HTTPS;
- `443/udp` para HTTP/3;
- las mismas reglas para IPv6.

Docker puede insertar reglas antes de UFW para puertos publicados. Por eso la
seguridad depende de dos controles: UFW y el validador de Compose que rechaza
cualquier `ports` fuera de Caddy. Nunca agregar un puerto de PostgreSQL, Redis,
API o worker “temporalmente”.

## Actualizaciones del host

Las actualizaciones de seguridad automáticas están activas. Una revisión manual
segura comienza con:

```bash
sudo apt update
apt list --upgradable
```

La actualización se programa en una ventana operativa:

```bash
sudo apt upgrade
if test -f /var/run/reboot-required; then
  echo "Reinicio requerido"
else
  echo "No requiere reinicio"
fi
```

Si requiere reinicio:

1. comprobar que no haya migración, publicación o render activo;
2. registrar la ventana;
3. confirmar backup vigente cuando ya existan datos;
4. ejecutar `sudo reboot`;
5. reconectar y verificar kernel, Docker, firewall y aplicación.

No ejecutar `apt autoremove`, cambiar de release de Ubuntu ni actualizar una
versión mayor de Docker sin revisar primero la lista exacta de paquetes y el
rollback.

## Publicación de artefactos

Las imágenes se construyen exclusivamente mediante el workflow manual
`publish-production-images.yml` desde `main`:

- arquitectura `linux/amd64`;
- tags iguales al SHA completo;
- sin `latest`;
- sin credenciales dentro de la imagen;
- web, API, worker y migración como imágenes separadas.

Las imágenes públicas de GHCR no requieren credencial en el VPS. El repositorio
mantiene permiso administrativo para publicar nuevas versiones mediante
`GITHUB_TOKEN`; el VPS sólo descarga artefactos.

## Despliegue de una release

Este procedimiento se ejecuta únicamente cuando la release candidata pasó CI,
staging, backup y rollback:

1. registrar SHA, actor, ventana y motivo;
2. confirmar espacio, memoria y estado actual;
3. copiar `infrastructure/production` a un nuevo
   `/opt/aramayo-content/releases/<sha>`;
4. validar propietario `root:root` y modos `0750`/`0640`;
5. apuntar `current` al nuevo directorio;
6. cambiar sólo `IMAGE_TAG` y `BUILD_DATE` mediante `sudoedit`;
7. ejecutar `config --quiet`;
8. descargar imágenes;
9. iniciar la topología;
10. esperar migración exitosa y healthchecks;
11. comprobar HTTPS, `/health`, `/ready`, login y worker;
12. conservar la release anterior para rollback.

Los comandos de promoción, una vez autorizada, son:

```bash
sudo docker compose \
  --env-file /etc/aramayo-content/production.env \
  --file /opt/aramayo-content/current/compose.yaml \
  pull

sudo docker compose \
  --env-file /etc/aramayo-content/production.env \
  --file /opt/aramayo-content/current/compose.yaml \
  up --detach
```

`api` y `worker` no arrancan si la migración falla. Caddy no arranca si web o
API no están saludables. Un fallo se investiga; no se fuerza con flags que
omitan dependencias.

## Rollback

Antes de promover, la migración debe ser compatible con la versión anterior. Un
rollback de aplicación:

1. reconcilia publicaciones externas y trabajos en curso;
2. conserva PostgreSQL, Redis y los volúmenes de Caddy;
3. selecciona la release anterior;
4. restaura su `IMAGE_TAG`;
5. ejecuta `config --quiet`, `pull` y `up --detach`;
6. repite healthchecks y smoke tests;
7. registra causa y resultado.

No usar:

```text
docker compose down -v
docker system prune -a --volumes
rm -rf /opt/aramayo-content
rm -rf /var/lib/docker
```

Esos comandos pueden borrar datos, certificados, colas o todas las releases. La
limpieza de una release vieja se hace sólo sobre su ruta SHA exacta después de
confirmar que ya no es rollback elegible.

## Backup y restauración

El directorio `/var/backups/aramayo-content` no es un backup externo. Antes del
piloto se debe:

- elegir un destino fuera de OVHcloud;
- cifrar antes de transferir;
- definir RPO y RTO;
- automatizar backup consistente de PostgreSQL;
- conservar configuración necesaria para descifrar sin guardar la llave junto
  al dump;
- ensayar restauración en un entorno aislado;
- validar referencias Cloudinary;
- mantener worker y efectos externos detenidos durante la restauración.

No iniciar el piloto con datos reales hasta completar `P7-T04`.

## Respuesta ante incidentes

Orden inicial:

1. identificar si afecta acceso, disco, memoria, base, cola, certificado o
   aplicación;
2. evitar reinicios o reintentos ciegos;
3. conservar logs acotados y timestamps;
4. pausar efectos externos si el resultado es ambiguo;
5. reconciliar publicaciones antes de reintentar;
6. restaurar servicio con la acción mínima;
7. documentar causa, impacto y prevención.

Si SSH no responde, usar la consola de OVHcloud para comprobar red, UFW,
filesystem y servicio SSH. No desactivar permanentemente el firewall ni
habilitar contraseña/root como atajo.

## Acciones que requieren confirmación

- iniciar o detener la aplicación completa;
- ejecutar una migración productiva;
- rotar o revocar secretos;
- cambiar firewall, SSH o DNS;
- eliminar releases, imágenes, volúmenes o backups;
- reiniciar durante una operación;
- activar OpenAI, Cloudinary o Meta reales;
- restaurar una base;
- publicar o reintentar contenido externo.

Toda intervención debe dejar árbol Git limpio, SHA desplegado, comandos de
verificación y resultado documentados.

## Fuentes operativas

- [Instalación de Docker en Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [Docker y reglas de firewall](https://docs.docker.com/engine/network/packet-filtering-firewalls/)
- [Firewall UFW en Ubuntu](https://documentation.ubuntu.com/server/how-to/security/firewalls/)
- [HTTPS automático de Caddy](https://caddyserver.com/docs/automatic-https)
- [Permisos de GitHub Packages](https://docs.github.com/en/packages/learn-github-packages/about-permissions-for-github-packages)
