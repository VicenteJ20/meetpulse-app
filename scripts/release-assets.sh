#!/usr/bin/env bash
# Post-procesa los assets del borrador de release de MeetPulse:
#   download        baja todos los assets del borrador a un directorio
#   update-manifest re-firma los instaladores para el updater y corrige latest.json
#   publish         crea alias sin versión, SHA256SUMS.txt, sube todo y documenta los hashes
#
# Entorno requerido: GH_TOKEN, REPO (owner/repo), RELEASE_ID. Para publish también VERSION y SIGNED.
set -euo pipefail

: "${GH_TOKEN:?falta GH_TOKEN}" "${REPO:?falta REPO}" "${RELEASE_ID:?falta RELEASE_ID}"

api_release="repos/${REPO}/releases/${RELEASE_ID}"

download() {
  local dir=$1
  mkdir -p "$dir"
  gh api "$api_release" --jq '.assets[] | "\(.id) \(.name)"' | while read -r id name; do
    echo "Descargando ${name}"
    gh api -H "Accept: application/octet-stream" "repos/${REPO}/releases/assets/${id}" > "${dir}/${name}"
  done
  ls -l "$dir"
}

# Firmar con Authenticode cambia los bytes del instalador, así que la firma minisign
# que generó tauri-action deja de ser válida y hay que rehacerla sobre el archivo firmado.
update_manifest() {
  local dir=$1
  : "${TAURI_SIGNING_PRIVATE_KEY:?falta TAURI_SIGNING_PRIVATE_KEY}"
  shopt -s nullglob
  for f in "$dir"/*.exe "$dir"/*.msi; do
    local name sig
    name=$(basename "$f")
    rm -f "${f}.sig"
    npx --yes @tauri-apps/cli@2 signer sign "$f"
    [[ -s "${f}.sig" ]] || { echo "::error::No se generó ${name}.sig"; exit 1; }
    sig=$(cat "${f}.sig")
    jq --arg n "$name" --arg s "$sig" \
      '(.platforms[] | select(.url | endswith("/" + $n)) | .signature) = $s' \
      "${dir}/latest.json" > "${dir}/latest.json.tmp"
    mv "${dir}/latest.json.tmp" "${dir}/latest.json"
    echo "Actualizada la firma del updater para ${name}"
  done
}

upload_asset() {
  local file=$1 name existing
  name=$(basename "$file")
  existing=$(gh api "$api_release" --jq ".assets[] | select(.name == \"${name}\") | .id")
  if [[ -n "$existing" ]]; then
    gh api -X DELETE "repos/${REPO}/releases/assets/${existing}"
  fi
  echo "Subiendo ${name}"
  curl -fsS -X POST \
    -H "Authorization: Bearer ${GH_TOKEN}" \
    -H "Content-Type: application/octet-stream" \
    --data-binary "@${file}" \
    "https://uploads.github.com/repos/${REPO}/releases/${RELEASE_ID}/assets?name=${name}" > /dev/null
}

# Hash abreviado para la tabla; los completos van en SHA256SUMS.txt.
short_hash() {
  local h
  h=$(sha256sum "$1" | cut -d' ' -f1)
  echo "${h:0:8}…${h: -5}"
}

# Escribe en stdout las notas: tabla de descargas con hashes y, debajo, las notas autogeneradas.
render_notes() {
  local dir=$1 tag=$2 generated=$3
  local base="https://github.com/${REPO}/releases/download/${tag}"
  local footer="Instaladores sin firma digital por ahora: si SmartScreen avisa, pulsa **Más información → Ejecutar de todos modos**."
  if [[ "${SIGNED:-false}" == "true" ]]; then
    footer="Instaladores firmados con Authenticode ([SignPath Foundation](https://signpath.org))."
  fi

  echo "<!-- downloads -->"
  echo "## Descargas"
  echo
  echo "| | Archivo | SHA-256 |"
  echo "|---|---|---|"
  [[ -n "${ALIAS_EXE:-}" ]] && echo "| **Windows 10/11 (64 bits)**, recomendado | [${ALIAS_EXE}](${base}/${ALIAS_EXE}) | \`$(short_hash "${dir}/${ALIAS_EXE}")\` |"
  [[ -n "${ALIAS_MSI:-}" ]] && echo "| Windows, MSI | [${ALIAS_MSI}](${base}/${ALIAS_MSI}) | \`$(short_hash "${dir}/${ALIAS_MSI}")\` |"
  echo
  echo "Hashes completos en [SHA256SUMS.txt](${base}/SHA256SUMS.txt) · Para comprobar: \`Get-FileHash .\\${ALIAS_EXE:-instalador.exe}\`"
  echo
  echo "$footer"
  echo "<!-- /downloads -->"
  echo
  # Quita una sección de descargas previa (idempotente) y la línea en blanco que la sigue.
  awk '/<!-- downloads -->/ { skip = 1 } !skip && !(drop && $0 == "") { drop = 0; print } /<!-- \/downloads -->/ { skip = 0; drop = 1 }' "$generated"
}

publish() {
  local dir=$1
  : "${VERSION:?falta VERSION}"
  shopt -s nullglob

  # Alias sin versión: permiten un enlace estable en .../releases/latest/download/<alias>
  for f in "$dir"/*_"${VERSION}"_*.exe "$dir"/*_"${VERSION}"_*.msi; do
    alias_name=$(basename "$f" | sed "s/_${VERSION}_/_/")
    cp "$f" "${dir}/${alias_name}"
    case "$alias_name" in
      *.exe) ALIAS_EXE=$alias_name ;;
      *.msi) ALIAS_MSI=$alias_name ;;
    esac
  done

  (cd "$dir" && sha256sum *.exe *.msi | sort -k2 > SHA256SUMS.txt)
  cat "${dir}/SHA256SUMS.txt"

  for f in "$dir"/*; do
    upload_asset "$f"
  done

  local tag
  tag=$(gh api "$api_release" --jq .tag_name)
  local body_file="${dir}/.body.md"
  gh api "$api_release" --jq '.body // ""' > "${dir}/.generated.md"
  render_notes "$dir" "$tag" "${dir}/.generated.md" > "$body_file"
  gh api -X PATCH "$api_release" -F "body=@${body_file}" > /dev/null
}

cmd=${1:?uso: release-assets.sh <download|update-manifest|publish> <directorio>}
dir=${2:?falta el directorio}
case "$cmd" in
  download) download "$dir" ;;
  update-manifest) update_manifest "$dir" ;;
  publish) publish "$dir" ;;
  *) echo "Comando desconocido: $cmd" >&2; exit 2 ;;
esac
