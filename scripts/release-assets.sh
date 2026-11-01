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

publish() {
  local dir=$1
  : "${VERSION:?falta VERSION}"
  shopt -s nullglob

  # Alias sin versión: permiten un enlace estable en .../releases/latest/download/<alias>
  for f in "$dir"/*_"${VERSION}"_*.exe "$dir"/*_"${VERSION}"_*.msi; do
    cp "$f" "${dir}/$(basename "$f" | sed "s/_${VERSION}_/_/")"
  done

  (cd "$dir" && sha256sum *.exe *.msi | sort -k2 > SHA256SUMS.txt)
  cat "${dir}/SHA256SUMS.txt"

  for f in "$dir"/*; do
    upload_asset "$f"
  done

  local signed_note="Los instaladores no están firmados con Authenticode, por lo que Windows SmartScreen puede mostrar un aviso."
  if [[ "${SIGNED:-false}" == "true" ]]; then
    signed_note="Los instaladores están firmados con Authenticode mediante [SignPath Foundation](https://signpath.org) (software libre)."
  fi

  local marker="<!-- checksums -->"
  local body_file="${dir}/.body.md"
  gh api "$api_release" --jq '.body // ""' | awk -v m="$marker" 'index($0, m) { exit } { print }' > "$body_file"
  {
    echo "$marker"
    echo "## Descargas y verificación"
    echo
    echo "MeetPulse es software libre (MIT) publicado por Vicente Jorquera. ${signed_note}"
    echo
    echo "Verifica la integridad antes de instalar (PowerShell):"
    echo
    echo '```powershell'
    echo 'Get-FileHash .\MeetPulse_x64-setup.exe -Algorithm SHA256'
    echo '```'
    echo
    echo "SHA-256:"
    echo
    echo '```'
    cat "${dir}/SHA256SUMS.txt"
    echo '```'
  } >> "$body_file"
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
