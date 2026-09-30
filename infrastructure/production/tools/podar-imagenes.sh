#!/bin/sh
# Poda las imágenes de la aplicación que ya no sirven. Conserva la release en
# curso (IMAGE_TAG) y la anterior, que es la de rollback; borra el resto por SHA
# exacto, nunca en bloque, y nunca una imagen que use algún contenedor. Las
# imágenes viven en GHCR: el host es sólo una caché y no se pierde nada.
#
# Uso, al final de cada despliegue:
#   sudo sh /opt/aramayo-content/current/tools/podar-imagenes.sh [--dry-run]
set -eu

env_file=/etc/aramayo-content/production.env
releases=/opt/aramayo-content/releases
image_pattern='^ghcr\.io/maxiaramayo/aramayo-content-(api|web|worker|migration):[0-9a-f]{40}$'
sha_pattern='^[0-9a-f]{40}$'

dry_run=false
case "${1:-}" in
  --dry-run) dry_run=true ;;
  "") ;;
  *)
    echo "Uso: podar-imagenes.sh [--dry-run]" >&2
    exit 2
    ;;
esac

current=$(sed -n 's/^IMAGE_TAG=//p' "$env_file" | tail -n 1)
if ! printf '%s\n' "$current" | grep -Eq "$sha_pattern"; then
  echo "IMAGE_TAG no es un SHA completo: no se poda nada." >&2
  exit 1
fi

# La de rollback es la release más reciente después de la que está en curso:
# cada despliegue crea su directorio, así que el orden es el de promoción.
rollback=$(ls -1t "$releases" | grep -E "$sha_pattern" | grep -Fvx "$current" | head -n 1 || true)
if [ -z "$rollback" ]; then
  echo "No hay release anterior: no se poda nada, para no perder el rollback." >&2
  exit 1
fi
echo "En curso: $current"
echo "Rollback: $rollback"

in_use=$(docker ps -a --format '{{.Image}}')
pruned=0
for image in $(docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -E "$image_pattern" || true); do
  tag=${image##*:}
  if [ "$tag" = "$current" ] || [ "$tag" = "$rollback" ]; then
    continue
  fi
  if printf '%s\n' "$in_use" | grep -Fqx "$image"; then
    echo "En uso, se conserva: $image"
    continue
  fi
  if [ "$dry_run" = true ]; then
    echo "Se borraría: $image"
  else
    docker image rm "$image" > /dev/null
    echo "Borrada: $image"
  fi
  pruned=$((pruned + 1))
done

if [ "$pruned" -eq 0 ]; then
  echo "No hay imágenes para podar."
fi
df -h /
