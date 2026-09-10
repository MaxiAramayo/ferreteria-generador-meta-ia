#!/usr/bin/env bash
# Carga en staging las credenciales de staging de OpenAI y Cloudinary, y las de
# Odoo si están completas en el `.env`.
#
# Lo corre quien administra esas credenciales, desde la raíz del repositorio:
# una credencial la entrega una persona, no un agente. Las toma del `.env`
# local —donde viven las de staging— y las manda por SSH, por la entrada
# estándar, a `aramayo-staging-credentials`, que las escribe en el entorno de
# staging. Nunca imprime un valor.
#
# Uso:
#   bash infrastructure/staging/load-provider-credentials.sh [ruta/al/.env]

set -euo pipefail

readonly VPS="${ARAMAYO_VPS:-ubuntu@144.217.91.115}"
readonly SOURCE="${1:-.env}"
readonly REQUIRED=(
  OPENAI_API_KEY
  OPENAI_PROJECT_ID
  OPENAI_VECTOR_STORE_ID
  CLOUDINARY_CLOUD_NAME
  CLOUDINARY_API_KEY
  CLOUDINARY_API_SECRET
  CLOUDINARY_FOLDER
)
readonly ODOO=(
  ODOO_CONTENT_API_BASE_URL
  ODOO_CONTENT_API_TOKEN
  ODOO_CONTENT_API_ORGANIZATION_ID
  ODOO_CONTENT_API_LOCATION_MAP
)

value_of() {
  local line
  line="$(grep -m1 -E "^$1=" "$SOURCE" || true)"
  printf '%s' "${line#*=}"
}

if [[ ! -r "$SOURCE" ]]; then
  echo "No se puede leer $SOURCE." >&2
  exit 1
fi

payload=""
for key in "${REQUIRED[@]}"; do
  value="$(value_of "$key")"
  if [[ -z "$value" ]]; then
    echo "Falta $key en $SOURCE; no se tocó el VPS." >&2
    exit 1
  fi
  payload+="$key=$value"$'\n'
done

# La carpeta de Cloudinary es la única separación efectiva entre staging y el
# resto del cloud: tiene que nombrar staging.
if [[ "$(value_of CLOUDINARY_FOLDER)" != *staging* ]]; then
  echo "CLOUDINARY_FOLDER no identifica staging; no se tocó el VPS." >&2
  exit 1
fi

# Odoo es un grupo: se carga entero o no se carga.
present=0
for key in "${ODOO[@]}"; do
  if [[ -n "$(value_of "$key")" ]]; then
    present=$((present + 1))
  fi
done
if [[ "$present" -eq "${#ODOO[@]}" ]]; then
  for key in "${ODOO[@]}"; do
    payload+="$key=$(value_of "$key")"$'\n'
  done
elif [[ "$present" -gt 0 ]]; then
  echo "El grupo de Odoo está incompleto en $SOURCE; no se tocó el VPS." >&2
  exit 1
fi

printf '%s' "$payload" |
  ssh -o BatchMode=yes "$VPS" 'sudo -n /usr/local/sbin/aramayo-staging-credentials'
echo "Listo. Staging toma las credenciales cuando se reinician API y worker."
