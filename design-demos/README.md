# Demos de diseño de MeetPulse

Tres direcciones visuales con datos de ejemplo (mock). Son HTML/CSS/JS estáticos: no tocan la app (`frontend/`) y no necesitan build.

| Carpeta | Dirección |
|---|---|
| `a-quiet-studio/` | A. Zinc + esmeralda, tres paneles, Geist |
| `b-ink-cobalt/` | B. Papel y tinta + cobalto, editorial con pestañas, Onest |
| `c-night-console/` | C. Cabina densa + terracota, IBM Plex |
| `quiet-studio/` | **Elegida.** Quiet Studio v2 con acento azul del sistema y pantallas nuevas |

Cada una tiene `home.html` (inicio) y `meeting.html` (reunión). `index.html` las enlaza.

## Cómo verlas

Desde la raíz del repo:

```bash
python -m http.server 4173 --directory design-demos
```

Luego abre http://localhost:4173. También hay una configuración `design-demos` en `.claude/launch.json` para el panel de vista previa de Claude Code.

## Estructura

- `shared/data.js`: toda la mock data (reunión, transcripción, insights, modelos, chat).
- `shared/ui.js`: renderizado e interacciones (reproductor, búsqueda, citas, selector de modelo, chat, simulación en vivo, tema).
- `shared/base.css`: componentes dirigidos por tokens. Cada dirección define sus tokens con `light-dark()` y sobreescribe lo que necesita.
- Tema: claro por defecto, sigue al sistema (`prefers-color-scheme`) y se puede forzar con el botón (Sistema, Claro, Oscuro).

Requiere conexión para cargar Phosphor Icons (unpkg) y las fuentes (Google Fonts). El nombre y el logo son provisionales.

## Quiet Studio v2 (elegida)

Páginas en `quiet-studio/`: `home.html`, `live.html` (grabación en vivo con coach y chat opcionales), `meeting.html` (reunión guardada), `settings.html` (ajustes; `?tab=models` abre Modelos y API keys) y `loading.html` (`?state=startup|processing|error`).

Atajos útiles para demostrar: `live.html?coach=1` enciende el coach, `live.html?coach=1&dock=chat` abre el chat.

### Novedades de la v2 (segunda ronda)

- `library.html`: biblioteca con filtros, selección múltiple y acciones de todas las reuniones (`?tab=actions`).
- `ask.html` y el panel lateral (Ctrl+J): asistente general con alcance (todas, esta reunión, cliente, últimos 30 días), fuentes citadas y estado del índice local. La búsqueda es simulada.
- Paleta de comandos (Ctrl+K): reuniones, acciones, ajustes y "Preguntar". `?palette` la abre al cargar.
- Motores local o nube para transcripción (Whisper, Parakeet, Gemini) y análisis; chip de flujo de datos. `?stt=cloud` y `?stt=local` fuerzan el motor para demostrar.
- Reunión guardada: volver a transcribir con otro motor, plantilla del resumen, nombrar participantes, exportar.

Servidor sin caché: `python design-demos/serve.py` (puerto 4173).
