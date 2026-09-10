# Backup, restauración y retención

Tarea `P7-T04`. Este archivo reúne la política, el procedimiento y la evidencia
de los simulacros. Las herramientas y su instalación están en
[`infrastructure/backup`](../../infrastructure/backup/README.md).

## Qué hay que poder recuperar

PostgreSQL es la única fuente de verdad: publicaciones, aprobaciones, snapshots
inmutables, programación, auditoría, identidad y referencias de medios. Redis no
guarda estado propio y se reconstruye desde la base. Los archivos de medios
viven en Cloudinary y la base guarda su referencia, no su contenido.

Perder la base es perder el sistema. Perder Redis es perder un rato de cola.

## Objetivos

| Objetivo | Valor | Por qué |
|---|---|---|
| RPO | 24 h | Una copia diaria. El negocio publica pocas piezas por día y cada una nace de una decisión humana que puede rehacerse; perder un día de trabajo editorial es molesto y no destruye información comercial. |
| RTO | 1 h | La restauración de staging tardó menos de un segundo; el resto del tiempo es traer la copia, descifrarla, reinyectar el entorno y levantar servicios. Una hora deja margen para hacerlo con calma y verificar antes de abrir tráfico. |

Quedaron aceptados el 2026-09-10, cuando el usuario autorizó completar la tarea
y eligió Google Drive como destino. Cambiarlos es cambiar el timer y esta
tabla.

## Dónde viven las copias y quién puede leerlas

| Qué | Dónde | Quién lo lee |
|---|---|---|
| Copias diarias, cifradas | Google Drive, `Aramayo Content Platform/respaldos/<ambiente>/diarias` | La cuenta dueña del Drive y el VPS, que sólo ve lo que él mismo sube |
| Primera copia de cada mes, cifrada | `…/<ambiente>/mensuales` | Ídem |
| Últimas 7 copias, cifradas | VPS, `/var/backups/aramayo-content/<ambiente>`, `0700 root` | root del VPS |
| Llave privada | Máquina de quien opera, `~/.config/aramayo-content/backup-age-identity.txt` (`0600`), y su gestor de contraseñas | Quien opera |
| Llave pública | [`recipients.txt`](../../infrastructure/backup/recipients.txt) y `/etc/aramayo-content/backup-recipients.txt` | Cualquiera: sólo sirve para cifrar |

- **Se cifra antes de salir del VPS**, con age y llave pública. El servidor no
  guarda ninguna privada: quien entre puede leer la base viva, pero no las
  copias que ya salieron.
- **Drive con alcance `drive.file`**: el VPS sólo ve los archivos que crea él.
  Uno comprometido no puede leer el resto de la cuenta.
- **Sin la llave privada no hay restauración.** Tiene que existir en dos lugares
  fuera del VPS. Perder ambos es perder todas las copias, aunque sigan en Drive.

## Cómo se toma una copia

`aramayo-backup@<ambiente>.timer` corre `aramayo-backup run <ambiente>` todos
los días a las 03:30 de Córdoba, con un margen aleatorio de 15 minutos. Cada
corrida:

1. toma el `pg_dump` **del mismo contenedor** que corre el motor —uno de otra
   versión mayor se niega a leer la base—, en formato custom;
2. la restaura entera en una base descartable del mismo servidor y la borra:
   **una copia no cuenta hasta que se restaura**. Los conteos por tabla y la
   huella de los snapshots aprobados del manifiesto salen de esa restauración,
   así que describen el dump exacto y no una base que siguió cambiando;
3. la cifra y escribe junto a ella un manifiesto con tamaños, hashes, versión de
   la imagen y de PostgreSQL, conteos y huella;
4. la sube a Drive, confirma con `rclone check` que todo lo local llegó con el
   mismo contenido y aplica la retención.

Una corrida fallida deja la unidad en `systemctl --failed`. Si falló la subida,
la copia sigue cifrada en el VPS y la próxima corrida la sube.

## Restauración

El simulacro es también el primer paso de una restauración real:

```bash
bash infrastructure/backup/restore-drill.sh \
  "gdrive:Aramayo Content Platform/respaldos/<ambiente>/diarias/<copia>.dump.age"
```

Comprueba que la copia sea la de su manifiesto, la descifra, la restaura en un
PostgreSQL efímero con la imagen fijada, compara conteos y huella, y consulta
cada medio vigente en su URL pública. No toca ningún ambiente y al terminar
borra el contenedor y la copia descifrada.

Para restaurar un ambiente se detienen antes el worker y todo efecto externo, y
se restaura en una base nueva, nunca sobre la que está en uso:

```bash
age --decrypt --identity ~/.config/aramayo-content/backup-age-identity.txt \
  --output copia.dump <copia>.dump.age
psql "<admin>" -c 'CREATE DATABASE "<destino>"'
pg_restore -U <usuario> -d <destino> --exit-on-error < copia.dump
```

`pg_restore` es el del mismo contenedor de PostgreSQL. `--exit-on-error` es
deliberado: una restauración a medias que no avisa es peor que una que falla.
Antes de apuntar la aplicación se comparan conteos y huella con el manifiesto,
se comprueba que no queden restricciones sin validar y se corre la suite de
integración contra la base restaurada. La copia descifrada se borra al
terminar.

## Secretos

El dump **no contiene secretos utilizables**. Los tokens de Meta se guardan
cifrados con AES-256-GCM y su clave vive únicamente en `TOKEN_ENCRYPTION_KEYS`,
en el entorno del host. Restaurar exige reinyectar ese entorno; una copia sola no
alcanza para publicar en nombre de nadie. La contraseña de la base tampoco viaja
en la copia.

## Retención

| Dato | Retención | Dónde se aplica |
|---|---|---|
| Copias de PostgreSQL en Drive | 30 días las diarias y un año la primera de cada mes; Drive conserva lo borrado 30 días más en la papelera | `aramayo-backup upload` |
| Copias de PostgreSQL en el VPS | Las últimas 7 | `aramayo-backup create` |
| Original de un medio subido | 90 días | `original_retention_days` |
| Referencia visual | 30 días | `reference_retention_days` |
| Medio generado sin referenciar | 24 h | `generated_orphan_retention_hours` |
| Mensaje outbox entregado | purga por antigüedad | barrido del worker |
| Auditoría y transiciones | sin borrado automático | son la evidencia del sistema |

## Evidencia

### 2026-09-09: simulacro con una base efímera

Ejecutado contra PostgreSQL 17.9 en una base efímera, con datos reales
producidos por la suite de integración —240 filas de negocio entre
publicaciones, auditoría y snapshots aprobados—.

| Medición | Resultado |
|---|---|
| Copia comprimida | 110 ms, 159.599 bytes |
| Restauración en base aislada | 210 ms |
| Conteos por tabla, origen contra destino | idénticos en las 37 tablas |
| Huella de snapshots aprobados | idéntica (`md5` sobre id y hash de contenido) |
| Restricciones sin validar tras restaurar | 0 |
| Suite de integración contra la base restaurada | 75 pruebas en verde |

La suite corrió **contra la base restaurada**, no contra una nueva: comprueba
que el esquema recuperado funciona, no sólo que está presente.

### 2026-09-10: primera copia real de staging

Copia `aramayo-staging-20260910T214909Z`, tomada con `aramayo-backup` antes de
desplegar `25d6790`:

| Medición | Resultado |
|---|---|
| Dump | 194.577 bytes, formato custom, PostgreSQL 17.9 |
| Restauración de verificación en el VPS | completa, 31 tablas |
| Copia cifrada | 194.809 bytes, sha256 `bdb2f0cd…a5b0131f` |
| Descifrado en la máquina de quien opera | reproduce exactamente el sha256 del dump |
| Restauración en un PostgreSQL efímero | menos de 1 s |
| Conteos | 31 tablas y 103 filas iguales al manifiesto |
| Huella de snapshots aprobados | idéntica |
| Medios vigentes que responden | 2 de 3 |

**El tercer medio encontró un defecto real.** Es el bitmap de la revisión
técnica de App Review, un medio de `brand_library` que el panel sirve desde
`apps/web/public`. `c581b35` lo retiró al aprobar la soldadora —el mismo cambio
que conservó el historial de revisiones—: la revisión y su snapshot aprobado
quedaron en la base y el archivo dejó de servirse. El
[PR #37](https://github.com/MaxiAramayo/ferreteria-generador-meta-ia/pull/37)
lo restaura desde `2d75d76`, y la base registra para ese medio el mismo
`checksum_sha256` y el mismo tamaño que el archivo restaurado.

Un medio de `brand_library` depende de que el panel lo siga sirviendo: retirar un
archivo de `public/` rompe cualquier snapshot que lo cite. Ahora el simulacro lo
detecta.

### 2026-09-10: segunda copia, con el medio restaurado

Copia `aramayo-staging-20260910T221414Z`, tomada con `25d6790` en marcha,
segundos antes de desplegar `a6fbcf9`. Se trajo del VPS por SSH: Drive todavía
no está autorizado.

| Medición | Resultado |
|---|---|
| Dump | 242.243 bytes, formato custom, PostgreSQL 17.9 |
| Restauración de verificación en el VPS | completa, 37 tablas |
| Copia cifrada | 242.491 bytes, sha256 `3bfca1a8…1d234706` |
| Descifrado en la máquina de quien opera | reproduce exactamente el sha256 del dump |
| Restauración en un PostgreSQL efímero | menos de 1 s |
| Conteos | 37 tablas y 111 filas iguales al manifiesto |
| Huella de snapshots aprobados | idéntica |
| Medios vigentes que responden | 3 de 3 |
| Simulacro completo | 3 s |

Las seis tablas más que en la primera copia son las que agregaron las
migraciones de `25d6790`. El bitmap de App Review volvió a responder, con el
mismo sha256 que el archivo del repositorio: la verificación que encontró el
defecto ahora confirma su corrección.

## Lo que falta

1. **Autorizar Drive desde la cuenta dueña**, con
   `bash infrastructure/backup/authorize-drive.sh`. Hasta entonces las copias
   quedan cifradas en el VPS y la unidad diaria falla en la subida.
2. **Repetir el simulacro desde Drive**: es lo que demuestra la separación del
   entorno primario.
3. **Activar `aramayo-backup@production.timer`** cuando exista producción
   (`P7-T07`).
