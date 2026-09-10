# Copias de PostgreSQL

Herramientas de `P7-T04`. La política —qué se copia, RPO, RTO, retención y
custodia de la llave— y la evidencia de los simulacros están en
[`BACKUP-RESTORE.md`](../../docs/operations/BACKUP-RESTORE.md). Acá está cómo se
instalan y se usan.

| Archivo | Dónde corre | Para qué |
|---|---|---|
| [`aramayo-backup`](aramayo-backup) | VPS, como root | Crea la copia, la verifica restaurándola, la cifra y la sube a Drive |
| [`aramayo-backup@.service`](aramayo-backup@.service) y [`.timer`](aramayo-backup@.timer) | VPS, systemd | Una copia diaria por ambiente, a las 03:30 de Córdoba |
| [`recipients.txt`](recipients.txt) | VPS | Llaves públicas de age con que se cifran las copias |
| [`authorize-drive.sh`](authorize-drive.sh) | Máquina de quien opera | Da al VPS acceso a Drive con alcance `drive.file` |
| [`restore-drill.sh`](restore-drill.sh) | Máquina de quien opera | Descifra una copia, la restaura en un PostgreSQL efímero y la compara con su manifiesto |

## Qué hace cada copia

1. `pg_dump` del mismo contenedor que corre la base, en formato custom.
2. Restauración completa en una base descartable del mismo servidor: la copia
   no cuenta hasta que se restaura. De ahí salen los conteos por tabla y la
   huella de los snapshots aprobados que registra el manifiesto.
3. Cifrado con age para las llaves de `recipients.txt`. El VPS no guarda
   ninguna privada.
4. Subida a Drive —`Aramayo Content Platform/respaldos/<ambiente>/diarias`— y
   retención: 30 días de diarias, la primera de cada mes por un año en
   `mensuales`, y las últimas 7 en el VPS.

## Instalación en el VPS

Desde una copia de este directorio en el servidor:

```bash
sudo install -o root -g root -m 0750 aramayo-backup /usr/local/sbin/aramayo-backup
sudo install -o root -g root -m 0640 recipients.txt /etc/aramayo-content/backup-recipients.txt
sudo install -o root -g root -m 0644 'aramayo-backup@.service' 'aramayo-backup@.timer' /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now aramayo-backup@staging.timer
```

Producción usa las mismas unidades con `@production` cuando exista. La
autorización de Drive se instala una sola vez, desde la máquina de la persona
dueña de la cuenta:

```bash
bash infrastructure/backup/authorize-drive.sh
```

## Operación

```bash
sudo aramayo-backup create staging   # copia local, verificada y cifrada
sudo aramayo-backup upload staging   # sube a Drive y aplica retención
sudo aramayo-backup run staging      # las dos; es lo que ejecuta el timer
systemctl list-timers 'aramayo-backup@*'
journalctl -u aramayo-backup@staging --since today
```

Una unidad fallida queda visible en `systemctl --failed`. Si la copia local se
creó y la subida falló, la copia sigue en `/var/backups/aramayo-content/<ambiente>`
y la próxima corrida la sube.

## Simulacro de restauración

Con la llave privada en `~/.config/aramayo-content/backup-age-identity.txt`:

```bash
bash infrastructure/backup/restore-drill.sh \
  "gdrive:Aramayo Content Platform/respaldos/staging/diarias/<copia>.dump.age"
```

`gdrive` es el nombre del remoto de rclone de esa máquina. El simulacro no toca
ningún ambiente y al terminar borra el contenedor y la copia descifrada.
