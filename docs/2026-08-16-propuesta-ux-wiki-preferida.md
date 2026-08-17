# Propuesta UX: Wiki preferida por defecto

| Campo | Valor |
|---|---|
| Fecha | 16 de agosto de 2026 |
| Estado | Propuesta |
| Alcance | Home, Ajustes y persistencia del tenant wiki |
| Relacionado | Analizar = publicar (`docs/2026-08-16-qa-analizar-publicar-wiki.md`) |

---

## 1. Problema

Analizar ya publica en la wiki, pero el **workspace** (tenant) solo se elige en la esquina superior derecha de `/wiki`. Home y Ajustes no lo muestran.

Eso deja tres fricciones:

- En Home la tarjeta wiki pide “elige un espacio” y te manda a otra página.
- En Ajustes el copy dice que el tenant “se asigna solo después de Google”. Es falso si hay más de uno.
- Al analizar, si no hay `tenantId` guardado, aparece el sheet de destino. El usuario no entiende por qué, si ya tiene un solo workspace.

La decisión “dónde se guarda todo” es de **cuenta**, no de reunión. Debe vivir donde se configura el producto y verse donde se empieza a trabajar.

---

## 2. Cómo está hoy

| Superficie | Qué hay | Persistencia |
|---|---|---|
| `/wiki` cabecera | `WikiTenantControls`: dropdown con workspaces, crear, miembros, invitaciones | `localStorage` `meetpulse.wiki.config.tenantId` + evento `wiki-config-changed` |
| `/wiki` bootstrap | Si no hay guardado, usa el **primero** de la lista | Sobrescribe config |
| Home (`HomeWikiStats`) | KPIs o números locales. CTA a `/wiki`. Sin selector | Solo lee `tenantId` |
| Ajustes → Wiki | URL + test. Texto: “tenant assigned automatically” | URL sí; tenant no se elige |
| Detalle / Analizar | Usa `getWikiConfig().tenantId` | Si falta, sheet puntual |

El selector de `/wiki` ya es el control correcto. El hueco es que **no está donde se decide el default**.

---

## 3. Principio

Un solo default de cuenta:

```text
Wiki preferida  =  meetpulse.wiki.config.tenantId
```

Toda publicación nueva (Analizar) y toda navegación de conocimiento usan ese valor, salvo que la reunión ya tenga un `wiki_tenant_id` publicado.

Reglas:

1. **Si hay exactamente un workspace, usarlo.** Sin preguntar. Guardarlo.
2. **Si hay varios, el usuario elige una vez.** Home y Ajustes muestran el mismo selector que `/wiki`.
3. **Cambiar el default no reescribe reuniones ya publicadas.** Solo afecta lo que se publique a partir de ahora y lo que muestra `/wiki`.
4. **El sheet de destino en Analizar deja de pedir workspace** cuando ya hay preferida válida. Sigue pidiendo cliente/proyecto si faltan.

---

## 4. Dónde vive el selector

Reutilizar `WikiTenantControls`. No inventar un segundo dropdown.

### 4.1 Home — tarjeta wiki

Hoy: icono + título + refresh + dos KPIs + botón “Ir al espacio”.

Propuesta: el selector reemplaza el vacío de “elige un espacio”.

```text
┌─────────────────────────────────────┐
│  Wiki de conocimiento               │
│  [ Acme Studio          ▾ ]   ↻     │  ← mismo control que /wiki
│                                     │
│   4 proyectos     18 páginas        │
│                                     │
│  Última actividad: 16 ago           │
│  [ Abrir este espacio          → ]  │
└─────────────────────────────────────┘
```

Estados:

| Workspaces | Home |
|---|---|
| 0 | CTA “Crear espacio” / invitaciones (el `emptyState` que ya tiene el control) |
| 1 | Nombre del espacio como chip de solo lectura. Se auto-selecciona al cargar. |
| 2+ | Dropdown. El actual lleva check. Cambiar actualiza KPIs al instante |

El botón inferior siempre abre `/wiki` del default, nunca un picker intermedio.

### 4.2 Ajustes → pestaña Wiki

Sustituir el párrafo de “se asigna solo” por el selector real.

Orden de la página:

1. **Espacio preferido** — `WikiTenantControls` + una línea: “Las reuniones analizadas se guardan aquí.”
2. URL de API + test (secundario; la mayoría nunca la toca).
3. Si hay un solo espacio, el selector se muestra igual pero cerrado: se ve el nombre, no hay duda de a dónde va el conocimiento.

Copy (ES): “Wiki preferida. Analizar publicará en este espacio.”

### 4.3 `/wiki`

No cambia de forma. Sigue siendo el mismo control. Elegir allí **es** cambiar el default (ya lo hace `saveWikiConfig`). Home y Ajustes se enteran por `wiki-config-changed`.

### 4.4 Detalle de reunión

Sin selector permanente de workspace. Con default válido, Analizar publica. El sheet solo sale si no hay preferida o el tenant guardado ya no está en la lista (invitación revocada).

---

## 5. Un solo workspace

Este es el caso más frecuente.

Al iniciar sesión o al cargar Home / Ajustes / Wiki:

```text
listWikiTenants()
  0  → empty state (crear / aceptar invitación)
  1  → saveWikiConfig({ tenantId: ese })
  N  → si el guardado sigue en la lista, respetarlo
       si no hay guardado o el guardado murió, usar el primero y persistirlo
```

`/wiki` ya hace casi esto (`saved` o `nextTenants[0]`). Hay que extraerlo a un helper compartido (`resolvePreferredTenant`) para que Home y Ajustes no dupliquen la regla y no “roben” el default en cada visita si el usuario eligió el segundo.

Cuando el usuario **acepta una invitación** o **crea un espacio**, ese tenant pasa a ser el preferido (el control ya llama `onChanged(tenant_id)`).

---

## 6. Persistencia

No hace falta otra clave.

- Fuente: `meetpulse.wiki.config.tenantId` (ya existe).
- Broadcast: evento `wiki-config-changed` (Home ya lo escucha).
- Ajustes y el detalle deben escuchar el mismo evento para no quedar desfasados.

Opcional, no en esta ronda: guardar también en el perfil remoto para que el default viaje entre máquinas. Hoy localStorage es suficiente y coherente con URL y último cliente/proyecto.

---

## 7. Interacción y microcopy

- El trigger muestra **nombre visible**, no el slug (`Acme Studio`, no `acme-studio`).
- Debajo, rol: Propietario / Invitado.
- Al cambiar: toast corto “Las próximas publicaciones irán a {nombre}.” Las reuniones ya publicadas no se mencionan (no se tocan).
- Un solo workspace: no mostrar “elegir”. Mostrar “Se guarda en {nombre}”.
- Cero workspaces: no inventar un tenant. Bloquear Analizar con el empty state, no con un 403 de API.

Lo que **no** va en Home: gestionar miembros, invitar, borrar gente. Eso se queda en el menú del control (como en `/wiki`) o se abre el diálogo existente. Home no se convierte en admin de tenant.

---

## 8. Qué no hace este cambio

- No elige cliente/proyecto por defecto más allá del “último destino” que ya existe.
- No mueve reuniones publicadas de un workspace a otro.
- No pide confirmar el tenant en cada Analizar si el default es válido.
- No cambia el contrato de la API.

---

## 9. Implementación sugerida (pequeña)

1. Extraer de `/wiki` `loadTenants` + regla 0 / 1 / N a un hook `usePreferredWikiTenant`.
2. Montar `WikiTenantControls` en `HomeWikiStats` y `WikiSettings`.
3. Auto-persistir cuando `tenants.length === 1`.
4. En `useWikiPublish`, si hay preferida válida, no abrir el sheet por tenant.
5. Escuchar `wiki-config-changed` en Ajustes (Home ya lo hace).

Archivos: `WikiTenantControls.tsx` (reuso), `HomeWikiStats.tsx`, `WikiSettings.tsx`, `wiki/page.tsx` (usar el hook), `useWikiPublish.ts`, `catalogs.ts`.

---

## 10. Criterio de éxito

Un usuario con un solo workspace nunca ve un picker de tenant. Analizar publica ahí.

Un usuario con dos workspaces elige en Home o Ajustes, recarga la app y Analizar sigue yendo al que eligió, sin pasar por `/wiki`.
