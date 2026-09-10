#!/usr/bin/env bash
# Simulacro de restauración de una copia de PostgreSQL (`P7-T04`).
#
# Lo corre quien opera, en su máquina, con la llave privada de age que el VPS
# no tiene. Recorre lo mismo que una restauración real sin tocar ningún
# ambiente:
#
# 1. trae la copia —de un archivo o de Drive, con el rclone local— y comprueba
#    que es la que describe su manifiesto;
# 2. la descifra y la restaura en un PostgreSQL efímero, con la misma imagen
#    fijada que corre en el VPS;
# 3. cuenta cada tabla y calcula la huella de los snapshots aprobados, y los
#    compara con el manifiesto;
# 4. comprueba que cada medio vigente siga respondiendo en su URL pública;
# 5. borra el contenedor y la copia descifrada, pase lo que pase.
#
# Uso:
#   bash infrastructure/backup/restore-drill.sh <copia.dump.age> [copia.manifest.json]
#
# `<copia.dump.age>` puede ser una ruta local o de rclone, por ejemplo
# `gdrive:Aramayo Content Platform/respaldos/staging/diarias/<copia>.dump.age`.

set -euo pipefail
umask 077

readonly IDENTITY="${ARAMAYO_BACKUP_IDENTITY:-$HOME/.config/aramayo-content/backup-age-identity.txt}"
readonly POSTGRES_IMAGE="postgres:17.9-alpine3.23@sha256:c7526c0f6c3f30260a563d7bcf8ad778effac59a44f8ffa86678c35418338609"
readonly CONTAINER="aramayo-restore-drill-$$"
readonly DATABASE="restaurada"

source_path="${1:?Indicá la copia .dump.age}"
manifest_path="${2:-${source_path%.dump.age}.manifest.json}"
work="$(mktemp -d)"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf -- "$work"
}
trap cleanup EXIT

step() {
  printf '%s %s\n' "$(date +%H:%M:%S)" "$*"
}

fail() {
  echo "Simulacro fallido: $*" >&2
  exit 1
}

sha256_of() {
  node -e '
    const hash = require("node:crypto").createHash("sha256");
    hash.update(require("node:fs").readFileSync(process.argv[1]));
    process.stdout.write(hash.digest("hex"));
  ' "$1"
}

manifest_field() {
  node -e '
    const manifest = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
    const value = manifest[process.argv[2]];
    if (typeof value !== "string") process.exit(1);
    process.stdout.write(value);
  ' "$work/manifiesto.json" "$1"
}

psql_query() {
  docker exec "$CONTAINER" psql -U postgres -d "$DATABASE" \
    -v ON_ERROR_STOP=1 -At -c "$1" </dev/null
}

for tool in age docker node curl; do
  command -v "$tool" >/dev/null || fail "falta $tool en esta máquina"
done
[[ -r "$IDENTITY" ]] || fail "falta la llave privada en $IDENTITY"

started=$SECONDS

if [[ "$source_path" == *:* ]]; then
  command -v rclone >/dev/null || fail "falta rclone para descargar de $source_path"
  rclone copyto "$source_path" "$work/copia.dump.age"
  rclone copyto "$manifest_path" "$work/manifiesto.json"
  step "copia descargada de Drive"
else
  cp -- "$source_path" "$work/copia.dump.age"
  cp -- "$manifest_path" "$work/manifiesto.json"
fi

[[ "$(sha256_of "$work/copia.dump.age")" == "$(manifest_field encryptedSha256)" ]] ||
  fail "la copia no es la que describe su manifiesto"

age --decrypt --identity "$IDENTITY" --output "$work/copia.dump" "$work/copia.dump.age"
[[ "$(sha256_of "$work/copia.dump")" == "$(manifest_field dumpSha256)" ]] ||
  fail "el descifrado no reproduce el dump que se tomó en el VPS"
step "copia descifrada: es exactamente el dump que se tomó en el VPS"

docker run --detach --name "$CONTAINER" \
  --env POSTGRES_PASSWORD=simulacro-descartable \
  --env POSTGRES_DB="$DATABASE" \
  "$POSTGRES_IMAGE" >/dev/null

# El entrypoint arranca un servidor temporal sólo por socket para inicializar;
# el definitivo es el que escucha por TCP.
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -h 127.0.0.1 -U postgres -d "$DATABASE" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$CONTAINER" pg_isready -h 127.0.0.1 -U postgres -d "$DATABASE" >/dev/null ||
  fail "el PostgreSQL efímero no arrancó"

restore_started=$SECONDS
# Sin dueños ni permisos: el simulacro no tiene los roles del VPS y lo que se
# verifica son los datos. `--exit-on-error` hace fallar una restauración a
# medias.
docker exec -i "$CONTAINER" pg_restore -U postgres -d "$DATABASE" \
  --exit-on-error --no-owner --no-privileges <"$work/copia.dump"
step "restaurada en $((SECONDS - restore_started)) s en un PostgreSQL efímero"

query="$(psql_query "SELECT string_agg(format('SELECT %L AS tabla, count(*) AS filas FROM %I.%I', table_name, table_schema, table_name), ' UNION ALL ' ORDER BY table_name) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")"
[[ -n "$query" ]] || fail "la base restaurada no tiene tablas"
psql_query "SELECT tabla || '=' || filas FROM ($query) AS conteos ORDER BY tabla" >"$work/conteos.txt"
psql_query "SELECT coalesce(md5(string_agg(id::text || ':' || content_hash, ',' ORDER BY id)), 'sin-snapshots') FROM approval_snapshots" >"$work/huella.txt"

node - "$work/manifiesto.json" "$work/conteos.txt" "$work/huella.txt" <<'COMPARE'
const fs = require("node:fs");
const [manifestPath, countsPath, fingerprintPath] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const restored = Object.fromEntries(
  fs.readFileSync(countsPath, "utf8").trim().split("\n").map((line) => {
    const [table, rows] = line.split("=");
    return [table, Number(rows)];
  }),
);
const expected = manifest.tableCounts;
const tables = [...new Set([...Object.keys(expected), ...Object.keys(restored)])].sort();
const differences = tables.filter((table) => expected[table] !== restored[table]);
const fingerprint = fs.readFileSync(fingerprintPath, "utf8").trim();

for (const table of differences) {
  console.error(`  ${table}: copia ${expected[table] ?? "sin tabla"}, restaurada ${restored[table] ?? "sin tabla"}`);
}
if (fingerprint !== manifest.approvedSnapshotFingerprint) {
  console.error(`  huella de snapshots aprobados distinta: copia ${manifest.approvedSnapshotFingerprint}, restaurada ${fingerprint}`);
}
if (differences.length > 0 || fingerprint !== manifest.approvedSnapshotFingerprint) {
  process.exit(1);
}
const rows = Object.values(restored).reduce((total, count) => total + count, 0);
console.log(`${new Date().toTimeString().slice(0, 8)} ${tables.length} tablas y ${rows} filas iguales a la copia; huella de snapshots aprobados idéntica`);
COMPARE

# Una referencia intacta no alcanza: el objeto tiene que seguir existiendo del
# otro lado. Se consulta la URL pública, que no necesita credenciales.
psql_query "SELECT id || ' ' || secure_url FROM media_assets WHERE deleted_at IS NULL AND secure_url IS NOT NULL ORDER BY created_at" >"$work/medios.txt"
total=0
available=0
while read -r media_id url; do
  [[ -n "${url:-}" ]] || continue
  total=$((total + 1))
  status="$(curl -s -o /dev/null -w '%{http_code}' --head --max-time 20 "$url" || true)"
  if [[ "$status" == "200" ]]; then
    available=$((available + 1))
  else
    echo "  el medio $media_id no responde en su URL pública (HTTP $status)" >&2
  fi
done <"$work/medios.txt"
step "medios vigentes: $available de $total responden en su URL pública"
[[ "$available" -eq "$total" ]] || fail "hay medios referenciados que ya no existen"

step "simulacro completo en $((SECONDS - started)) s; contenedor y copia descifrada borrados al salir"
