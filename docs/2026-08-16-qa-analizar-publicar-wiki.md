# QA: Analizar = publicar en Wiki + título del análisis

| Campo | Valor |
|---|---|
| Fecha | 16 de agosto de 2026 |
| Estado | Pruebas funcionales |
| Alcance | MeetPulse Desktop (Meetily) — ciclo Analizar → Wiki |
| Relacionado | `docs/2026-08-16-propuesta-ux-flujos-y-sincronizacion-wiki.md` |

Este documento es la lista de pruebas que debes ejecutar a mano después del cambio **Analizar = publicar**. También incluye cómo levantar el ambiente de desarrollo en Windows.

---

## 1. Qué se está validando

Al pulsar **Analizar / Generate AI Summary** la app debe:

1. Generar un acta con un **título humano** (no “Resumen de la Reunión”).
2. Usar ese título como nombre de la reunión y como clave en la wiki.
3. **Publicar sola** en la wiki si hay workspace + cliente + proyecto.
4. Si falta el destino, abrir un sheet y publicar al confirmar.
5. Recordar el estado al recargar (ya no es un toast de sesión).
6. Si la reunión **ya está publicada**, regenerar solo el acta local. No crear otra página ni pisar la fuente.

Queda fuera de esta ronda: inbox de Home, barra global de grabación, participantes reales, deep links `/wiki?…`, pull de `context.md` y revisiones `-rev2`.

---

## 2. Guía de inicio del ambiente de desarrollo

Trabajas en Windows. El directorio de la app es `frontend/`. No hace falta el backend Python de `backend/` (está archivado).

### 2.1 Requisitos

- Node.js 18 o superior
- pnpm (`npm install -g pnpm`)
- Rust (stable)
- Visual Studio Build Tools con workload de C++
- Cuenta Google (la app autentica con Google para la wiki)
- Un workspace de Wiki ya creado o una invitación aceptada
- Un modelo de resumen configurado (Ollama, Gemini, etc.)

Wiki por defecto: `https://meetpulse-wiki.vercel.app`.

### 2.2 Primera vez

En PowerShell, desde la raíz del repo:

```powershell
cd frontend
pnpm install
```

### 2.3 Levantar la app (lo habitual)

Desde `frontend/`:

```powershell
# Recomendado: detecta GPU si hay CUDA/Vulkan; si no, CPU
pnpm run tauri:dev
```

Atajos equivalentes:

```powershell
# Limpia node_modules, reinstala y abre Tauri
.\clean_run_windows.bat

# Forzar un backend de inferencia
pnpm run tauri:dev:cpu
pnpm run tauri:dev:cuda
pnpm run tauri:dev:vulkan
```

La UI Next queda en [http://127.0.0.1:3118](http://127.0.0.1:3118). La ventana de escritorio es la que debes usar para QA (audio, Tauri commands y persistencia). El navegador solo sirve para mirar la UI, no para grabar ni publicar.

Logs más verbosos:

```powershell
$env:RUST_LOG="debug"
pnpm run tauri:dev
```

DevTools de la app: `Ctrl+Shift+I`.

### 2.4 Solo frontend (sin Tauri)

Útil para revisar copy o layout, **no** para estas pruebas de wiki:

```powershell
cd frontend
pnpm run dev
```

### 2.5 Comandos de apoyo

```powershell
# Tests de catálogos i18n (ES/EN alineados)
cd frontend
node --test tests/i18n/catalogs.test.mjs

# Tests del slug de wiki
node --experimental-strip-types --test tests/lib/wiki-slug.test.mjs

# Tests Rust del título de análisis
cd frontend/src-tauri
cargo test --lib extracts_descriptive
cargo test --lib standard_template_asks_for_descriptive
```

Build de producción (no hace falta para QA de esta feature):

```powershell
cd frontend
.\clean_build_windows.bat
# o
pnpm run tauri:build
```

### 2.6 Datos de prueba que necesitas antes de empezar

1. Inicia sesión con Google.
2. En **Wiki**, confirma que tienes al menos un workspace.
3. En **Ajustes**, deja un modelo de resumen usable.
4. Prepara dos destinos:
   - un cliente/proyecto **ya existentes** en la wiki (para probar el catálogo)
   - un nombre nuevo con espacios y tildes, p. ej. `Acme Estudio` / `Piloto Q3`
5. Ten una reunión con transcripción real (o importada). Sin transcripción no se puede analizar.

---

## 3. Cómo anotar el resultado

Para cada caso marca:

| Resultado | Significado |
|---|---|
| OK | Comportamiento igual al esperado |
| FALLO | No cumple el esperado; anota evidencia |
| BLOQUEADO | No se pudo ejecutar (auth, modelo, red, wiki caída) |

Adjunta: título resultante, cliente/proyecto usados, toast o chip visto, y si recargaste la app.

---

## 4. Pruebas funcionales

### TF-01 — Cliente y proyecto visibles

**Precondición.** Reunión con transcripción, sin estar grabando.

**Pasos.**

1. Abre `/meeting-details?id=…`.
2. Mira el panel de transcripción.

**Esperado.**

- Cliente y proyecto están **a la vista**, no escondidos en “Detalles”.
- Al escribir `Acme Estudio` aparece la vista previa `acme-estudio`.
- El datalist sugiere clientes/proyectos ya publicados si el workspace está configurado.
- Contexto extra y tags siguen dentro de “Detalles”.

---

### TF-02 — Título del análisis (camino feliz)

**Precondición.** Cliente y proyecto rellenados (`acme-estudio` / `piloto-q3` o equivalentes). Workspace wiki seleccionado. Modelo de resumen listo.

**Pasos.**

1. Pulsa **Analizar / Generate AI Summary**.
2. Espera a que termine.
3. Mira el título de la reunión (cabecera y lista lateral).

**Esperado.**

- El título **no** es `Resumen de la Reunión`, `Meeting Summary` ni `Acta de la reunión`.
- Es un nombre corto y específico (tema, cliente, decisión).
- El chip de estado pasa a **Publicando** y luego **Publicado** o **Bibliotecario en curso**.
- Hay un toast de publicación correcta (creado / sin cambios / transcripción añadida).
- Aparece **Ver en Wiki**.

---

### TF-03 — Analizar publica sin botón “Choose Wiki”

**Precondición.** Igual que TF-02. La reunión **nunca** se había publicado.

**Pasos.**

1. Analiza.
2. Ve a la pantalla **Wiki** y abre el cliente/proyecto usados.

**Esperado.**

- Existe un documento de reunión cuyo slug sale de `{fecha}-{slug-del-título}`.
- No tuviste que pulsar “Choose Wiki” ni “Save to selected Wiki”.
- El título del documento coincide con el título local (salvo slug).

---

### TF-04 — Falta destino: sheet obligatorio

**Precondición.** Reunión con transcripción. Cliente y/o proyecto vacíos. O no hay workspace configurado.

**Pasos.**

1. Pulsa Analizar.
2. Espera a que el acta termine.

**Esperado.**

- El acta se genera igual (título humano).
- Se abre el diálogo **Destino de la Wiki**.
- Hasta que elijas workspace + cliente + proyecto y pulses **Guardar en Wiki**, no hay publicación.
- Tras confirmar, el estado queda Publicado / Bibliotecario en curso.

**Variante.** Sin ningún workspace: toast “Crea o únete a un espacio Wiki…” y no se publica.

---

### TF-05 — IDs inválidos no rompen en silencio

**Pasos.**

1. Pon cliente `Acme Studio!!!` y proyecto `???`.
2. Analiza (o confirma el sheet).

**Esperado.**

- El slug vacío o inválido impide el ingest.
- El mensaje habla de ids tipo `acme-studio`, no de un 422 crudo incomprensible.
- Si escribes `Niño Pérez`, la preview es `nino-perez` y ese id es el que viaja a la API.

---

### TF-06 — El estado sobrevive al recargar

**Precondición.** TF-02 o TF-03 pasaron.

**Pasos.**

1. Cierra la app por completo.
2. Vuelve a abrirla (`pnpm run tauri:dev` o el exe de dev).
3. Abre la misma reunión.

**Esperado.**

- El chip **no** vuelve a “Borrador”.
- Sigue **Publicado**, **Bibliotecario en curso** o **Curado**.
- **Ver en Wiki** sigue disponible.
- Cliente/proyecto siguen rellenos.

Si el Bibliotecario ya terminó en esos minutos, el chip puede ser **Curado** y debió haber un toast “El Bibliotecario actualizó el contexto de {proyecto}”.

---

### TF-07 — Re-analizar no crea otra página

**Precondición.** Reunión ya publicada (TF-02).

**Pasos.**

1. Pulsa Analizar de nuevo (regenerar).
2. Espera el acta nueva.
3. Revisa la wiki del mismo cliente/proyecto.

**Esperado.**

- El acta **local** puede cambiar.
- **No** se hace un segundo ingest.
- En la wiki sigue **una** fuente para esa reunión.
- Si editaste el acta a mano y el hash ya no coincide, el chip es **Local distinto de Wiki**.
- Nadie te dice “Saved to Wiki” como si se hubiera vuelto a guardar.

---

### TF-08 — Conflicto 409 (misma identidad, cuerpo distinto)

**Cómo provocarlo.** Reunión local publicada. En otra sesión o a mano, la wiki ya tiene esa misma clave (`fecha + slug del título`) con un cuerpo distinto. Vuelve a intentar publicar (por ejemplo borrando el estado local no es trivial; si no puedes forzar el 409, marca BLOQUEADO y anótalo).

**Esperado si aparece el 409.**

- Toast: la wiki ya tiene un análisis distinto con esa identidad. **No** se sobrescribió.
- El chip queda en **La Wiki ya tiene un análisis distinto**.
- No se muestra “This note is already saved in Wiki” / “ya está guardado”.

---

### TF-09 — Bibliotecario

**Precondición.** Publicación `created` o `reconciled` reciente.

**Pasos.**

1. Quédate en el detalle 1–2 minutos.
2. No recargues a la fuerza; observa el chip.

**Esperado.**

- Tras publicar: **Bibliotecario en curso**.
- Al terminar bien: toast de contexto actualizado + chip **Curado**.
- Al fallar el job: chip vuelve a Publicado (o se mantiene) y toast de error del Bibliotecario. El análisis publicado **sigue ahí**.

---

### TF-10 — Último destino recordado

**Pasos.**

1. Publica una reunión en cliente `acme-estudio` / proyecto `piloto-q3`.
2. Abre **otra** reunión sin cliente/proyecto.

**Esperado.**

- Los campos salen precargados con el último destino.
- Analizar en esa segunda reunión puede publicar al mismo árbol sin volver a escribirlos.

---

### TF-11 — Sin transcripción

**Pasos.** Abre una reunión vacía y pulsa Analizar (si el botón aparece).

**Esperado.**

- No se llama a la wiki.
- Error de “no hay transcripción” (toast). El estado wiki no cambia.

---

### TF-12 — Copy ES/EN

**Pasos.** Cambia el idioma de la UI en Ajustes y recorre el detalle.

**Esperado.**

- Chip, sheet, toasts y botones de wiki están en el idioma activo.
- No queda “Choose Wiki” / “Saved to Wiki” como camino principal.

---

## 5. Humo rápido (5 minutos)

Si solo puedes hacer una pasada:

1. Arranca con `cd frontend; pnpm run tauri:dev`.
2. Reunión con transcripción + cliente/proyecto.
3. Analizar → título humano → Publicado.
4. Wiki muestra el documento.
5. Cierra y abre la app → el estado sigue.
6. Regenerar → no aparece un segundo documento.

Si esos seis puntos pasan, el P0 operativo está bien para uso diario.

---

## 6. Fallos típicos (no son bugs de esta feature)

| Síntoma | Causa probable |
|---|---|
| No arranca Tauri | Falta VS Build Tools / Rust / `pnpm install` |
| Analizar falla al instante | No hay modelo o Ollama no está corriendo |
| Sheet de destino no lista workspaces | Sesión Google caducada |
| 422 al publicar | Cliente/proyecto con espacios o símbolos; mira la preview del slug |
| Wiki vacía tras “Publicado” | El Bibliotecario aún no curó; el análisis vive en Sources, no en Decisiones |
| Audio no graba | Permisos de mic / loopback; irrelevante para TF-02 en adelante si ya hay transcripción |

---

## 7. Criterio para dar por buena la entrega

Se acepta si TF-01, TF-02, TF-03, TF-04, TF-06 y TF-07 están **OK**.

TF-08 se acepta BLOQUEADO si no hay forma limpia de fabricar el 409. TF-09 puede quedar en “Bibliotecario en curso” si el worker tarda; no bloquea si el poll no revienta la UI.
