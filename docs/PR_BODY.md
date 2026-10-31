## Qué cambia
- Updater firmado con clave propia y endpoint en este repo (`createUpdaterArtifacts` activo)
- Diálogo de actualización traducido (es/en) y aviso al comprobar desde la bandeja
- Seguridad: SECURITY.md, CODEOWNERS, Dependabot, gitleaks + CodeQL, `.gitignore` reforzado
- Se quitan del índice `temp.env`, `vs_buildtools.exe`, un log antiguo y `lib_old_complex.rs`
- Workflow de release con verificación previa de secretos
- Resto de commits de la rama `enhance/ui-v2`

## Antes de publicar una release
Seguir `docs/RELEASING.md` (secretos `TAURI_SIGNING_PRIVATE_KEY` y `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`).
