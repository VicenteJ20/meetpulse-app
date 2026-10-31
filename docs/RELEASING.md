# Publicar una versión de MeetPulse

## Configuración única en GitHub

### 1. Secretos del updater
*Settings → Secrets and variables → Actions → New repository secret*

| Secreto | Valor |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | contenido de `%USERPROFILE%\.tauri\meetpulse.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | contenido de `%USERPROFILE%\.tauri\meetpulse.key.password` |

Para copiar cada valor al portapapeles sin mostrarlo en pantalla (PowerShell):

```powershell
Get-Content "$HOME\.tauri\meetpulse.key" -Raw | Set-Clipboard
Get-Content "$HOME\.tauri\meetpulse.key.password" -Raw | Set-Clipboard
```

Guarda una copia de ambos archivos en un gestor de contraseñas: sin ellos no se pueden firmar actualizaciones y habría que reinstalar la app a mano.

### 2. Seguridad del repositorio
- *Settings → Code security*: activa **Secret scanning**, **Push protection** y **Dependabot alerts**.
- *Settings → Actions → General*: permisos de workflow en **Read repository contents**; exige aprobación para PRs de colaboradores externos.
- *Settings → Rules*: en la regla de `main` añade como check requerido `Escaneo de secretos` y `CodeQL`.

### Opcional (firma de instaladores)
`SM_*` (DigiCert, Windows) y `APPLE_*` (macOS) son solo para firmar los instaladores. Sin ellos las builds salen igual, pero Windows mostrará SmartScreen y macOS pedirá aprobar la app.

## Publicar

1. Sube la versión en `frontend/src-tauri/tauri.conf.json` (`version`), `Cargo.toml` y `package.json`.
2. *Actions → Release → Run workflow*. El primer paso falla con un mensaje claro si faltan los secretos.
3. Revisa el borrador de la release y **publícalo**. `latest.json` solo es visible cuando la release está publicada.
4. Las instalaciones con la clave anterior (1.4.0 o anteriores) no se actualizan solas: instala a mano una vez esta versión.

## Cómo funciona el updater
La app consulta `https://github.com/VicenteJ20/meetpulse-app/releases/latest/download/latest.json`, compara versiones y solo instala paquetes cuya firma coincide con la `pubkey` de `tauri.conf.json`.

## Firma de instaladores (Authenticode / Apple)
`release.yml` usa `sign-binaries: false` mientras no existan certificados: con `true` los pasos de DigiCert y Apple fallan si faltan los secretos `SM_*` / `APPLE_*`. Las builds salen sin firma de instalador (aviso de SmartScreen en Windows), pero el updater funciona igual porque usa su propia firma. Cuando tengas certificado, cambia el valor a `true` y crea los secretos correspondientes.

## Requisitos para que el updater encuentre la release
- El repositorio es público y la release está **publicada** (no borrador, no pre-release).
- El tag es `v<versión>` y la versión de `tauri.conf.json` coincide con la que lleva la app; si el tag ya existe el workflow añade un sufijo (`1.4.0.1`) y la app se vería a sí misma como desactualizada, así que sube la versión en vez de repetir.
- La release contiene `latest.json`, el instalador y su `.sig` (los genera el workflow).
- El workflow *Release* solo aparece en Actions cuando está en la rama por defecto: fusiona primero el PR.
