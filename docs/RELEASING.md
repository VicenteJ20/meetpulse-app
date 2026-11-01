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

### Analítica (PostHog)
La clave del proyecto de PostHog se incrusta al compilar. Sin ella el instalador sale **sin destino de analítica** y no envía nada, aunque la persona active el interruptor (la pantalla *Acerca de* lo indica).

| Tipo | Nombre | Valor |
|---|---|---|
| Secreto | `MEETPULSE_POSTHOG_KEY` | clave pública del proyecto (`phc_…`) |
| Variable (opcional) | `MEETPULSE_POSTHOG_HOST` | `https://us.i.posthog.com` (por defecto) o `https://eu.i.posthog.com` |

```bash
gh secret set MEETPULSE_POSTHOG_KEY --repo VicenteJ20/meetpulse-app
```

En local la toma de `frontend/.env.local` (ver `.env.example`).

### 2. Seguridad del repositorio
- *Settings → Code security*: activa **Secret scanning**, **Push protection** y **Dependabot alerts**.
- *Settings → Actions → General*: permisos de workflow en **Read repository contents**; exige aprobación para PRs de colaboradores externos.
- *Settings → Rules*: en la regla de `main` añade como check requerido `Escaneo de secretos` y `CodeQL`.

### 3. Firma de instaladores en Windows (SignPath Foundation, gratis para software libre)
Sin firma, SmartScreen muestra "Publisher: Unknown". El job `package-release` firma los instaladores con SignPath cuando existe la variable `SIGNPATH_ORGANIZATION_ID`; sin ella el release sale igual, solo que sin firmar.

1. Solicita el programa en <https://signpath.org/foundation/> (requiere repo público y licencia OSS; MeetPulse usa MIT). La aprobación la hace SignPath, no depende de este repo.
2. En SignPath crea el proyecto (slug `meetpulse-app`), una *artifact configuration* con el contenido de [signpath-artifact-configuration.xml](signpath-artifact-configuration.xml) (slug `windows-installers`) y una *signing policy* (slug `release-signing`) que exija origen verificado en GitHub.
3. En GitHub, *Settings → Secrets and variables → Actions*:

| Tipo | Nombre | Valor |
|---|---|---|
| Secreto | `SIGNPATH_API_TOKEN` | token de API del usuario CI de SignPath |
| Variable | `SIGNPATH_ORGANIZATION_ID` | ID de la organización en SignPath |
| Variable (opcional) | `SIGNPATH_PROJECT_SLUG` / `SIGNPATH_SIGNING_POLICY_SLUG` / `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG` | solo si usas slugs distintos a los de arriba |

4. En SignPath, conecta el repo `VicenteJ20/meetpulse-app` con su *trusted build system* de GitHub.

El certificado queda a nombre de SignPath Foundation: el *Publisher* mostrará ese nombre, no "Vicente Jorquera". Tras firmar, el workflow rehace las firmas minisign del updater y corrige `latest.json`, porque Authenticode cambia los bytes del instalador. Solo se firman los instaladores `.msi`/`.exe`; el `.exe` de la app instalada dentro no se firma.

### Opcional (macOS / DigiCert)
`SM_*` (DigiCert) y `APPLE_*` (macOS) ya no son necesarios para Windows. macOS está desactivado en `release.yml` hasta que compile `llama-helper`.

## Publicar

1. Sube la versión en `frontend/src-tauri/tauri.conf.json` (`version`), `Cargo.toml` y `package.json`.
2. *Actions → Release → Run workflow*. El primer paso falla con un mensaje claro si faltan los secretos.
3. Revisa el borrador de la release (instaladores, `SHA256SUMS.txt` y hashes en las notas) y **publícalo**. `latest.json` solo es visible cuando la release está publicada.
4. Las instalaciones con la clave anterior (1.4.0 o anteriores) no se actualizan solas: instala a mano una vez esta versión.

## Cómo funciona el updater
La app consulta `https://github.com/VicenteJ20/meetpulse-app/releases/latest/download/latest.json`, compara versiones y solo instala paquetes cuya firma coincide con la `pubkey` de `tauri.conf.json`.

## Enlaces de descarga estables
Cada release incluye alias sin versión, para que la landing apunte siempre a la última release publicada (GitHub ignora borradores y pre-releases en `latest`):

- `https://github.com/VicenteJ20/meetpulse-app/releases/latest/download/MeetPulse_x64-setup.exe` (NSIS, recomendado)
- `https://github.com/VicenteJ20/meetpulse-app/releases/latest/download/MeetPulse_x64_en-US.msi`
- `https://github.com/VicenteJ20/meetpulse-app/releases/latest/download/SHA256SUMS.txt`
- Página de releases: `https://github.com/VicenteJ20/meetpulse-app/releases/latest`

## Requisitos para que el updater encuentre la release
- El repositorio es público y la release está **publicada** (no borrador, no pre-release).
- El tag es `v<versión>` y la versión de `tauri.conf.json` coincide con la que lleva la app; si el tag ya existe el workflow añade un sufijo (`1.4.0.1`) y la app se vería a sí misma como desactualizada, así que sube la versión en vez de repetir.
- La release contiene `latest.json`, el instalador y su `.sig` (los genera el workflow).
- El workflow *Release* solo aparece en Actions cuando está en la rama por defecto: fusiona primero el PR.
