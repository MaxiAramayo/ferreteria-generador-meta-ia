#!/usr/bin/env bash
# Autoriza al VPS a guardar las copias en Google Drive (`P7-T04`).
#
# Lo corre la persona dueña del Drive, en su máquina y con navegador: Google
# pide el consentimiento de esa cuenta, y eso no se delega. El token nunca se
# imprime: viaja por SSH, por la entrada estándar, a la configuración de rclone
# de root en el VPS.
#
# El acceso se pide con alcance `drive.file`: rclone sólo ve los archivos que
# crea con esta autorización. Un VPS comprometido no puede leer el resto del
# Drive.
#
# Uso, desde la raíz del repositorio:
#   bash infrastructure/backup/authorize-drive.sh

set -euo pipefail

readonly VPS="${ARAMAYO_VPS:-ubuntu@144.217.91.115}"
readonly REMOTE="aramayo-drive"
# {"scope":"drive.file"} en base64: el formato con que rclone recibe la
# configuración del remoto que va a autorizar.
readonly DRIVE_FILE_SCOPE="eyJzY29wZSI6ImRyaXZlLmZpbGUifQ"

command -v rclone >/dev/null || {
  echo "Falta rclone en esta máquina (brew install rclone)." >&2
  exit 1
}
command -v node >/dev/null || {
  echo "Falta Node.js en esta máquina." >&2
  exit 1
}

echo "Se abre el navegador: elegí la cuenta de Google donde van las copias y aceptá."
output="$(rclone authorize drive "$DRIVE_FILE_SCOPE")"

# rclone entrega el token entre dos marcas; según la versión, como JSON o como
# base64 de un JSON que lo contiene.
token="$(printf '%s' "$output" | node -e '
  const raw = require("node:fs").readFileSync(0, "utf8");
  const pasted = raw.match(/--->\s*([\s\S]*?)\s*<---/)?.[1]?.trim();
  if (!pasted) process.exit(2);
  let value = pasted;
  if (!value.startsWith("{")) {
    const decoded = JSON.parse(Buffer.from(value, "base64").toString("utf8"));
    value = typeof decoded.token === "string" ? decoded.token : JSON.stringify(decoded.token ?? decoded);
  }
  const token = JSON.parse(value);
  if (typeof token.refresh_token !== "string") process.exit(3);
  process.stdout.write(JSON.stringify(token));
')" || {
  echo "rclone no devolvió un token utilizable; no se tocó el VPS." >&2
  exit 1
}

printf '[%s]\ntype = drive\nscope = drive.file\ntoken = %s\n' "$REMOTE" "$token" |
  ssh -o BatchMode=yes "$VPS" 'sudo -n /usr/local/sbin/aramayo-backup configure-remote'

echo "Autorizado. Subiendo la última copia de staging para comprobarlo…"
ssh -o BatchMode=yes "$VPS" 'sudo -n /usr/local/sbin/aramayo-backup upload staging'
echo "Listo: las copias diarias van a Drive, en «Aramayo Content Platform/respaldos»."
