#!/usr/bin/env bash
# Carga en staging el acceso de sólo lectura al catálogo comercial de Odoo.
#
# Lo corre quien opera, desde la raíz del repositorio: una credencial la mueve
# una persona, no un agente. Lee el token de la API de contenido del `.env`
# productivo de Odoo por SSH —sin imprimirlo ni guardarlo en esta máquina— y lo
# manda por la entrada estándar, junto con la URL, la organización y el mapa de
# sucursales, que no son secretos, a `aramayo-staging-credentials`.
#
# La API de Odoo acepta un solo token, así que staging usa el mismo que tendrá
# producción. Antes de `P7-T07`, Odoo tiene que aceptar un token por consumidor.
#
# Uso:
#   bash infrastructure/staging/load-odoo-credentials.sh --comprobar  # no manda nada
#   bash infrastructure/staging/load-odoo-credentials.sh              # carga

set -euo pipefail

readonly ODOO_VPS="${ARAMAYO_ODOO_VPS:-ubuntu@149.56.110.198}"
readonly ODOO_ENV_FILE="${ARAMAYO_ODOO_ENV_FILE:-/home/ubuntu/SistemaFerreteria/.env}"
readonly CONTENT_VPS="${ARAMAYO_VPS:-ubuntu@144.217.91.115}"
readonly BASE_URL="https://ferreteriaaramayo.com.ar/api/content/v1/"
# Organización y sucursales del seed canónico: los mismos UUID en local y staging.
readonly ORGANIZATION_ID="10000000-0000-4000-8000-000000000001"
readonly LOCATION_MAP="10000000-0000-4000-8000-000000000004=casa-central,10000000-0000-4000-8000-000000000005=rivadavia"
readonly SSH_OPTIONS=(-o BatchMode=yes -o ConnectTimeout=15)

# Con `length` devuelve sólo el largo del token; con `value`, el token. Corre en
# el VPS de Odoo y lee una única variable del `.env`.
read_odoo_token() {
  ssh "${SSH_OPTIONS[@]}" "$ODOO_VPS" "MODE=$1 ENV_FILE=$ODOO_ENV_FILE bash -s" <<'REMOTE'
awk -v mode="$MODE" '/^FERRETERIA_CONTENT_API_TOKEN=/ {
  value = substr($0, index($0, "=") + 1)
  sub(/\r$/, "", value)
  gsub(/^["\047]|["\047]$/, "", value)
  print (mode == "length" ? length(value) : value)
  exit
}' "$ENV_FILE"
REMOTE
}

if [[ "${1:-}" == "--comprobar" ]]; then
  token_length="$(read_odoo_token length)"
  echo "token de Odoo: ${token_length:-0} caracteres; hacen falta 32 o más"
  if ! ssh "${SSH_OPTIONS[@]}" "$CONTENT_VPS" 'sudo -n test -x /usr/local/sbin/aramayo-staging-credentials'; then
    echo "staging no tiene /usr/local/sbin/aramayo-staging-credentials" >&2
    exit 1
  fi
  echo "staging: aramayo-staging-credentials instalado"
  echo "se cargarían:"
  echo "  ODOO_CONTENT_API_BASE_URL=$BASE_URL"
  echo "  ODOO_CONTENT_API_ORGANIZATION_ID=$ORGANIZATION_ID"
  echo "  ODOO_CONTENT_API_LOCATION_MAP=$LOCATION_MAP"
  echo "  ODOO_CONTENT_API_TOKEN, el de Odoo, sin mostrarlo"
  exit 0
fi

token="$(read_odoo_token value)"
if [[ ${#token} -lt 32 || "$token" =~ [[:space:]] ]]; then
  echo "El token de Odoo falta o no tiene el formato esperado; no se tocó staging." >&2
  exit 1
fi

printf 'ODOO_CONTENT_API_BASE_URL=%s\nODOO_CONTENT_API_TOKEN=%s\nODOO_CONTENT_API_ORGANIZATION_ID=%s\nODOO_CONTENT_API_LOCATION_MAP=%s\n' \
  "$BASE_URL" "$token" "$ORGANIZATION_ID" "$LOCATION_MAP" |
  ssh "${SSH_OPTIONS[@]}" "$CONTENT_VPS" 'sudo -n /usr/local/sbin/aramayo-staging-credentials'
unset token
echo "Listo. El worker toma el catálogo cuando se recrea."
