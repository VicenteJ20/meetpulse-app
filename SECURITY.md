# Política de seguridad

MeetPulse procesa reuniones de forma local. Tomamos en serio cualquier fallo que pueda exponer audio, transcripciones o claves de API de las personas usuarias.

## Versiones con soporte

Solo se corrigen vulnerabilidades en la última versión publicada en [Releases](https://github.com/VicenteJ20/meetpulse-app/releases/latest). El backend Python/FastAPI de `backend/` está archivado y no tiene soporte.

## Cómo reportar una vulnerabilidad

**No abras un issue público.** Usa el reporte privado de GitHub:
<https://github.com/VicenteJ20/meetpulse-app/security/advisories/new>

Incluye versión de MeetPulse, sistema operativo, pasos para reproducir e impacto estimado. Responderemos con un acuse de recibo y, si se confirma el fallo, coordinaremos una corrección y su divulgación.

## Alcance

- Dentro: aplicación de escritorio (Tauri/Rust y la interfaz), cadena de actualización, manejo de claves y datos locales.
- Fuera: el código archivado en `backend/`, servicios de terceros (Ollama, Groq, OpenRouter, Anthropic) y ataques que requieran acceso físico o de administrador a la máquina.

## Actualizaciones firmadas

Las actualizaciones se firman con una clave privada que nunca se guarda en este repositorio. La app solo instala paquetes cuya firma coincide con la clave pública embebida en `frontend/src-tauri/tauri.conf.json`. Si sospechas que esa clave se ha filtrado, avísanos por el canal privado de arriba.

## Para colaboradores

- No subas claves, tokens, `.env` ni certificados. `.gitignore` y el escaneo de secretos de CI ayudan, pero la responsabilidad es de quien hace el commit.
- Los secretos de CI van como *repository secrets*, nunca en el código ni en los workflows.
