# Propuesta UX, flujo operativo e integración Wiki

| Campo | Valor |
|---|---|
| Fecha | 16 de agosto de 2026 |
| Estado | Propuesta |
| Alcance | MeetPulse Desktop (Meetily) + MeetPulse Wiki API (`meetpulse-api-wiki`) |
| Autor | Análisis de producto / UI-UX sobre el código actual |

---

## 1. Resumen

MeetPulse ya no es solo un grabador local. Es el productor de conocimiento de una wiki remota multi-tenant. Esa intención está bien planteada, pero el flujo operativo todavía trata la wiki como un **botón de exportar**, no como una **memoria viva del proyecto**.

Hay dos sistemas con contratos distintos:

| Capa | Dónde vive | Rol |
|---|---|---|
| Evidencia y trabajo diario | App Tauri (SQLite, audio, transcripción, resumen) | Capturar, transcribir, redactar |
| Memoria de proyecto | Wiki API (R2 + D1 + Bibliotecario) | Conservar análisis inmutable, contexto, decisiones y riesgos |

La wiki no es un repositorio de archivos. Es un **second brain** con cuatro capas: RAW → análisis canónico → conocimiento derivado (contexto / decisiones / riesgos) → navegación.

La app ya cubre auth Google, onboarding, grabación, reunión, publicación y un navegador de wiki. Lo que falta es el **puente operativo** entre ambos: persistir la identidad publicada, comparar versiones, seguir al Bibliotecario y no perder el estado al recargar.

---

## 2. Mapa de pantallas actuales

```text
Google Auth  →  Onboarding  →  Shell
                                 ├── Home /
                                 ├── Grabación en vivo (mismo /)
                                 ├── Reunión /meeting-details?id=
                                 ├── Wiki /wiki
                                 └── Ajustes /settings
```

Rutas reales: `/`, `/meeting-details`, `/wiki`, `/settings`.

`/notes/[id]` es contenido de muestra de 2024 y no debería existir en producto.

Chrome permanente: riel de iconos (Home, Grabar, Historial, Wiki, Ajustes) + cajón de reuniones colapsado.

---

## 3. Análisis de flujos por página

### 3.1 Acceso y onboarding

1. Splash de Google (obligatorio).
2. Welcome → descarga de Parakeet → permisos (solo macOS).
3. Home.

**Fricción.** El onboarding promete que los datos no salen del dispositivo, pero la app exige Google y la wiki es un servicio remoto. Eso genera desconfianza antes de grabar. En Windows no hay paso de permisos; en macOS sí. Si falla el check de onboarding, se vuelve a mostrar el wizard.

**Mejora.** Separar “cuenta” de “privacidad”: explicar que Google autentica identidad y wiki, y que audio/transcripción siguen locales salvo que el usuario elija Gemini. Permitir entrar a grabar aunque la wiki esté desconectada.

### 3.2 Home

Tres bloques: empezar reunión, estado de listos (mic / sistema / modelo), recientes + tarjeta de wiki.

**Lo que funciona.** CTA claro, controles de dispositivo en contexto, vacío de reuniones razonable.

**Problemas.**

- “Ver todas” intenta clic en un botón que no existe (`Open meeting history`). El historial vive en un cajón oculto.
- Se graba sin cliente, proyecto, título real ni participantes.
- El título se genera como `Meeting 16_08_26_14_03_21`. Eso define la clave de la wiki (`fecha + slug del título`). Un título técnico produce documentos ilegibles y claves frágiles.
- La tarjeta wiki muestra KPIs o, si no hay tenant, cuenta reuniones locales como si fueran páginas. Mezcla dos mundos.

**Mejora.** Antes de grabar (o en un sheet al arrancar): cliente, proyecto, título de trabajo y “publicar al terminar”. Convertir “Ver todas” en abrir el cajón o en una página `/meetings`.

### 3.3 Grabación en vivo

Home se reemplaza por transcripción + barra flotante (pausa / stop).

**Problemas.**

- El micrófono del riel **no detiene**. Muestra Stop pero solo inicia. Quien sale de Home pierde el control in-app.
- No hay confirmación al parar.
- No se puede asignar cliente / proyecto durante la reunión.
- El panel de transcripción de detalle se oculta bajo `md`; en ventana estrecha desaparece el texto.

**Mejora.** Barra global de grabación en todas las rutas. Confirmar stop. Permitir editar metadatos en vivo.

### 3.4 Detalle de reunión

Split: transcripción | resumen. Es el centro operativo y el único puente a la wiki.

Flujo actual:

```text
Parar → guardar → /meeting-details?source=recording
       → (opcional) auto-resumen
       → usuario abre "Detalles" (colapsado)
       → escribe cliente y proyecto (texto libre)
       → genera / edita resumen
       → Choose Wiki → elige tenant → POST /ingest
       → toast y botón "Saved to Wiki" (solo en esta sesión)
```

**Fricciones graves.**

| Problema | Efecto |
|---|---|
| Cliente / proyecto están escondidos en un `<details>` | El usuario no entiende por qué no puede publicar |
| IDs de wiki exigen `[A-Za-z0-9_-]+` y el campo acepta “Acme Studio” | `422` incomprensible |
| Participantes no existen en el modelo local | Siempre se envía `"Not specified"` |
| `isSavedToWiki` no se persiste | Al recargar el botón vuelve a “publicar”; o queda bloqueado en la sesión aunque se edite |
| Un `409` (análisis distinto, misma identidad) se muestra como “ya está guardado” | El usuario cree que está al día cuando la wiki rechazó el cambio |
| No se guarda `source_key` ni `job_id` | No hay vínculo reunión ↔ documento |
| No se consulta el job del Bibliotecario | No se ve cuándo aparecen decisiones / riesgos |
| Tags y contexto extra no viajan a la wiki | Se pierde señal útil |
| Plantilla de resumen sí encaja con la API | Fortaleza: Objetivo, Contexto, Decisiones, Compromisos, Riesgos |

### 3.5 Wiki

Navegación Workspace → Cliente → Proyecto → Documento. El contexto es editable; reuniones, decisiones y riesgos son de solo lectura.

**Lo que funciona.** Empty states, breadcrumbs, agrupación por tipo, gestión de tenants / invitaciones.

**Problemas.**

- IDs crudos (`acme-studio`) como nombre visible.
- Búsqueda solo filtra la lista ya cargada.
- Estado no está en la URL: no se puede compartir “este proyecto”.
- Doble navegación (riel de la app + árbol de wiki) y `h-screen` pelean con el shell.
- No hay estado del Bibliotecario, RAW, procedencia ni enlace de vuelta a la reunión local.
- Un usuario no entiende que publicar una reunión **dispara un agente asíncrono** que reescribe el contexto.

### 3.6 Ajustes

Pestañas locales (no hay `?tab=`). Wiki solo pide URL + test. El tenant se elige en otra pantalla.

La URL custom choca con el CSP de Tauri, que solo permite `https://meetpulse-wiki.vercel.app`. El test de conexión puede fallar de forma opaca.

### 3.7 Deuda visible

- `/notes` de muestra.
- “View all” roto.
- `alert()` en errores de grabación vs toasts en el resto.
- Mezcla EN / ES (botones de wiki, toasts de publicación, settings wiki).
- Audio player stubbeado.
- Importación de DB legacy sin superficie.

---

## 4. Diagnóstico del flujo operativo

El trabajo real debería ser:

```text
Preparar → Grabar → Revisar → Analizar → Publicar → Curar → Consultar
```

Hoy es:

```text
Grabar a ciegas → Poner nombre técnico → Abrir reunión
→ Descubrir metadatos escondidos → Generar resumen
→ Publicar a mano → Olvidar el estado → Abrir wiki y refrescar
```

Tres roturas de continuidad:

1. **Antes de grabar no hay alcance.** Cliente / proyecto aparecen tarde y en texto libre.
2. **Publicar es un acto aislado.** No hay checklist (“¿listo para wiki?”), ni preview, ni post-proceso.
3. **La wiki no devuelve feedback.** El Bibliotecario trabaja minutos después y la app no se entera.

Eso convierte una memoria de proyecto en un export. El usuario no cierra el ciclo: no sabe si el contexto se actualizó, si hubo conflicto, ni si su acta local ya no coincide con lo publicado.

---

## 5. Integración wiki: estado actual

### 5.1 Lo que ya está bien

- Auth unificada (mismo Google ID token).
- Ingesta multipart con análisis + RAW.
- Plantilla de resumen alineada con headings que valida la API.
- Idempotencia real: `created` / `unchanged` / `reconciled` / `409`.
- UI de workspace, miembros e invitaciones.
- El Bibliotecario consolida contexto, decisiones y riesgos con evidencia.

### 5.2 Lo que está roto o incompleto

| Capacidad wiki | En la API | En la app |
|---|---|---|
| Publicar reunión | Sí | Manual, sin persistir resultado |
| Ver job del Bibliotecario | `GET /jobs` | No se usa |
| Leer documento publicado | Sí | Solo en `/wiki`, no desde la reunión |
| Editar contexto | PUT | Sí |
| ETag / concurrencia | Interno (R2) | No se expone ni se usa |
| Diff | No | No |
| RAW del usuario | No se expone | No se puede verificar |
| Actualizar un análisis | Prohibido (inmutable) | El botón sugiere que sí |
| Borrar / despublicar | No | No |
| Relación `meeting_id` ↔ `source_key` | No | Se descarta |

Punto de diseño que hay que respetar: **el análisis publicado es inmutable**. Un “sync” no puede sobrescribir la fuente. Si el acta local cambia, o se publica una **nueva** fuente, o se muestra que divergió y se deja el histórico intacto.

### 5.3 Endpoints de la API relevantes

La API vive en `C:\Users\Vicente\Documents\meeting-assistant\meetpulse-api-wiki`.

Usados por la app: `POST /ingest`, dashboard, documentos, `PUT context`, tenants e invitaciones.

No usados y necesarios para sync: `GET /jobs`, `GET /tree`, `GET /logs`.

No existen aún y convienen para el check de diferencias: dry-run de ingest, etag/hash en list/read, lookup por `meeting_id`, lectura de metadatos RAW.

---

## 6. Propuesta: sync automático y check de diferencias

### 6.1 Principio

Hay tres copias de la verdad, no dos:

1. **Local (borrador):** transcripción + resumen editable.
2. **Fuente canónica (wiki):** análisis inmutable + RAW con hash.
3. **Conocimiento derivado:** contexto, decisiones, riesgos (el Bibliotecario).

El check de diferencias debe comparar 1 vs 2, y avisar el estado de 3.

### 6.2 Identidad estable

Hoy la clave es:

```text
sources/{tenant}/{client}/{project}/{fecha}-{slug-titulo}.md
```

Si el usuario cambia el título, se crea **otra** reunión en la wiki.

**Persistir en SQLite, por reunión:**

- `wiki_tenant_id`, `wiki_client_id`, `wiki_project_id`
- `wiki_source_key`, `wiki_job_id`
- `published_analysis_hash`, `published_raw_hash`
- `published_at`, `ingest_status`, `librarian_status`

Enviar `meeting_id` local en el YAML extra del análisis (la API ya conserva campos no canónicos).

En la API, añadir un índice opcional `meeting_id → source_key` o devolver hashes / etag en el listado.

### 6.3 Check de diferencias (sin romper inmutabilidad)

Al abrir una reunión publicada:

1. Recalcular hash del markdown local y del RAW local.
2. `GET /wiki/.../documents/analysis:{stem}`.
3. Diff visual (local vs publicado): headings, decisiones, compromisos.
4. Estados de UI:

| Estado | Significado | Acción |
|---|---|---|
| Borrador | Nunca publicado | Publicar |
| Al día | Hashes iguales | Solo “Ver en wiki” |
| Local adelantado | El usuario editó el acta | Publicar como **nueva versión** (nueva fecha o sufijo `-rev2`) o descartar |
| Wiki adelantado | No aplica al análisis (es inmutable); sí al contexto | Pull del contexto al prompt de próximas reuniones |
| Conflicto 409 | Misma identidad, cuerpo distinto | Mostrar diff; no mentir con “ya está guardado” |
| Bibliotecario en curso | `job pending/running` | Banner + poll |
| Curado | `job succeeded` | Enlace a contexto / decisiones nuevas |

El `409` actual es exactamente el detector de divergencia. Hoy se interpreta mal.

### 6.4 Sync automático

No publicar en silencio cada tecla. Publicar cuando el **ciclo de reunión está cerrado**.

**Reglas.**

1. Al crear / empezar reunión, cliente y proyecto salen de un catálogo wiki (no texto libre).
2. Preferencia: “Publicar al completar análisis”.
3. Disparadores válidos:
   - Resumen generado (si hay cliente / proyecto / transcript).
   - Usuario pulsa Completar reunión.
   - Cola: reuniones con resumen, metadatos válidos y no publicadas.
4. Nunca auto-publicar si el hash local ≠ hash publicado (pedir confirmación).
5. Tras `created`, poll de `GET /jobs/{tenant}/{job_id}` cada 5–10 s hasta `succeeded` / `failed`.
6. Cuando termine, toast: “El Bibliotecario actualizó el contexto de {proyecto}” + enlace.
7. En Home, un inbox: “3 reuniones listas para wiki”, “1 divergió”, “2 curándose”.

### 6.5 Extensiones de API recomendadas

1. Devolver `etag`, `sha256` y `updated_at` en list / read de documentos.
2. `GET /wiki/.../compare` o `POST /ingest?dry_run=1` que responda `unchanged | would_reconcile | would_conflict | would_create` + hashes.
3. Exponer ETag en PUT de contexto (`If-Match`) para no pisar al Bibliotecario.
4. Lectura de metadatos RAW (`raw_sha256`, no necesariamente el archivo).
5. Lookup `?meeting_id=` o `?source_key=`.
6. Activity que incluya eventos `librarian:` (hoy el dashboard solo parsea `ingest:`).
7. Nombres visibles de cliente / proyecto, no solo slugs.

Con `dry_run` + hashes, la app puede pintar el check **sin** reescribir nada.

---

## 7. Backlog priorizado

### P0 — Cerrar el ciclo reunión → wiki

1. Alcance al inicio. Selector de workspace / cliente / proyecto (datos de la API, slug automático). Título humano antes o justo al parar.
2. Checklist de publicación. Cliente, proyecto, resumen con secciones válidas, transcripción completa. El botón no aparece deshabilitado sin explicación.
3. Persistir publicación. Guardar `source_key`, hashes y job. El estado sobrevive al reinicio.
4. Decir la verdad en 409. Diff, no “ya está guardado”.
5. Seguir al Bibliotecario. Poll del job y badge en la reunión y en el proyecto.

### P1 — Operación diaria

6. Página de reuniones o cajón fiable. Arreglar “Ver todas”. Filtros por cliente, no publicados, divergidos.
7. Barra global de grabación. Stop / pausa desde cualquier ruta.
8. Participantes. Campo real; alimenta la wiki y la plantilla.
9. Normalizar IDs. “Acme Studio” → `acme-studio` con preview. Autocomplete de clientes / proyectos ya publicados.
10. Deep links en wiki. `/wiki?client=&project=&doc=`.
11. Pull de contexto. Al generar un resumen, inyectar el `context.md` del proyecto como fondo.

### P2 — Second brain usable

12. Inbox de conocimiento en Home: publicados, en curación, divergidos, fallidos.
13. Diff de acta (split o inline) y “publicar revisión” como nueva fuente, dejando la anterior como evidencia.
14. Mostrar procedencia. `complete` vs `analysis_only`, RAW disponible.
15. Búsqueda real (aunque sea por título + descripción en servidor).
16. Nombres humanos para clientes / proyectos.
17. Onboarding de wiki después del de modelos: crear workspace o aceptar invitación.

### P3 — Limpieza UX

18. Quitar `/notes` de muestra y el sidebar muerto.
19. Unificar errores (nada de `alert()`).
20. Completar i18n (wiki settings, publicación, recovery).
21. Tabs de settings en la URL.
22. Transcripción accesible en viewport estrecho (tabs, no `hidden`).
23. Alinear copy de privacidad con Google + wiki.

---

## 8. Flujo objetivo

```text
1. Elige cliente / proyecto (wiki)
2. Graba (título editable)
3. Para → transcripción se cierra
4. Resumen se genera con el contexto vigente del proyecto
5. Revisa decisiones / compromisos
6. “Completar y publicar”
      → ingest
      → estado: Publicado · Bibliotecario en curso
7. 30–90 s después: contexto actualizado, decisiones nuevas
8. La próxima reunión del mismo proyecto ya parte de ese contexto
9. Si editas el acta local: badge “Local distinto de wiki” + diff
```

Eso alinea la app con el diseño de la wiki: la reunión es evidencia; el contexto es el estado vivo; el Bibliotecario es el curador; el usuario es el revisor.

---

## 9. Riesgos si se implementa mal

- **Sobrescribir fuentes.** Rompería el contrato de inmutabilidad y la procedencia. Toda revisión debe ser una fuente nueva.
- **Auto-sync en cada save.** Ruido, jobs duplicados, contexto inestable. Solo al cerrar el ciclo.
- **Cliente texto libre.** Fragmenta “Acme”, “acme” y “Acme Studio” en tres árboles.
- **Pisar contexto sin ETag.** El usuario y el Bibliotecario se pisan. El PUT de contexto necesita `If-Match`.
- **Google como único camino a grabar.** Sigue chocando con la promesa local-first.

---

## 10. Conclusión

La arquitectura de la wiki es sólida: evidencia inmutable, conocimiento derivado, agente curador, multi-tenant. La app ya sabe publicar y navegar. El hueco no es “falta una wiki”: es que **la reunión local y la página publicada no se reconocen**.

La mejora de mayor impacto no es visual. Es operativa:

1. Elegir alcance **antes** de grabar.
2. Tratar publicar como **cierre de reunión**, no como export.
3. Guardar la identidad publicada.
4. Mostrar **diff honesto** contra la fuente.
5. Esperar y mostrar al Bibliotecario.
6. Usar el contexto wiki como input del siguiente análisis.

Con eso MeetPulse deja de ser “grabador + botón Wiki” y pasa a ser el cliente de escritorio de un second brain.

---

## Referencias de código

**App desktop**

- `frontend/src/app/page.tsx` — Home y grabación en vivo
- `frontend/src/app/meeting-details/page-content.tsx` — publicación wiki
- `frontend/src/app/wiki/page.tsx` — navegador de conocimiento
- `frontend/src/services/wiki-api.ts` — cliente HTTP
- `frontend/src/services/wiki-config.ts` — URL y tenant en `localStorage`
- `frontend/src-tauri/templates/standard_meeting.json` — plantilla de acta

**Wiki API**

- `meetpulse-api-wiki/docs/contexto-negocio-casos-de-uso-y-arquitectura.md`
- `meetpulse-api-wiki/app/main.py` — superficie REST
- `meetpulse-api-wiki/app/content.py` — contrato OKF y validación de actas
- `meetpulse-api-wiki/app/service.py` — ingest, inmutabilidad, ETags
