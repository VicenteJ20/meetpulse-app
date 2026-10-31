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
