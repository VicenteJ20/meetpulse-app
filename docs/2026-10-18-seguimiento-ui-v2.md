# Seguimiento: UI v2 de MeetPulse

Rama: `enhance/ui-v2`. Estado al 18 de octubre de 2026.

Este documento deja lo que quedó hecho, lo que falta y el orden recomendado. Lo que falta está ordenado por prioridad.

## 1. Lo que ya está hecho

- **Base visual Quiet Studio v2:** tokens, foco de campos, interruptor con resorte, casilla animada, diálogos, menús, paleta de comandos, skeleton con shimmer y movimiento compartido (`globals.css`).
- **Modales:** centrados sin `transform`, para que la animación de apertura no deslice.
- **Inicio:** simplificado. Título automático, cliente y proyecto con autocompletado, selectores reales de motor de transcripción, idioma y modelo de resumen.
- **Biblioteca:** clientes, luego proyectos y luego reuniones, con migas de pan. Los filtros de fecha y etiqueta quedan dentro de la lista de reuniones.
- **Preguntar:** chat general al estilo Claude. Queda centrado al inicio, el campo baja cuando hay mensajes, y el cliente y proyecto se bloquean al empezar la conversación.
- **Reunión guardada:**
  - Chat como tercera columna; el encabezado ocupa todo el ancho.
  - Columnas redimensionables, con el ancho guardado por dispositivo.
  - Insights propios con chips de tiempo.
  - Si el resumen es de formato antiguo, se ofrece generar los insights de nuevo.
  - Transcripción en bloques por hablante.
  - Encabezado y estado vacío del chat lateral como el mock.
- **Transcripción:** rótulos Tú (micrófono) y Participantes (audio del sistema), tiempos anclados al reloj de grabación. El campo `speaker` ya existía en la base de datos.
- **Sobre mí:** texto libre en Ajustes que se envía al resumen y a las solicitudes del asistente.
- **Modelos locales:** catálogo editable en `frontend/src-tauri/models/builtin_models.json`, con ciclo de vida (`current`, `legacy`, `retiring`), sucesor y fecha de retiro. Incluye Gemma 4 E4B, Gemma 4 12B, Qwen 3.8 27B y Bonsai 27B (experimental).
- **Modelos de nube:** salen en vivo del proveedor, filtrados por reglas editables en `frontend/src/config/models.json`.
- **Chat, fase 1:**
  - Envío optimista: el mensaje aparece al instante y el texto vuelve al campo si falla o se detiene.
  - Espera con etapas y shimmer.
  - Scroll inteligente con botón "Ir al final".
  - Botón enviar y detener.
  - Markdown propio con citas como chips y fuentes agrupadas.
  - Nombre del asistente centralizado en `frontend/src/config/brand.ts` (`ASSISTANT_NAME = "Meety"`) y aviso "Meety puede cometer errores. Revisa las respuestas."

## 2. Pendiente, en este orden

### 2.1 Hacer a Meety más conversacional y útil (antes del streaming)

**Problema observado.** Se le pidió "toma el análisis de esta reunión y redáctame un correo para el cliente con la minuta". En lugar de redactar el correo, devolvió fragmentos de la transcripción.

**Causas probables**, en `frontend/src-tauri/src/desktop/assistant.rs`:

- El prompt del sistema lo define como un asistente de búsqueda: "Separate evidence from proposals. Never invent…", con salida JSON `{answer, sourceIds}`. Eso lo empuja a citar y no a redactar.
- El contexto que recibe son fragmentos de la transcripción. No recibe el resumen ni los insights de la reunión, que es justo lo que se le pide usar.
- No distingue entre preguntar ("¿qué se decidió?") y encargar una tarea ("redacta", "reescribe", "resume para el cliente").

**Propuesta.**

1. **Intención.** Clasificar cada mensaje en dos tipos: consulta de hechos y tarea de redacción. La clasificación puede ser una instrucción en el mismo prompt, sin una segunda llamada.
2. **Contexto.** Para la reunión abierta, incluir siempre el resumen y los insights guardados, además de los fragmentos relevantes de la transcripción. Si no hay insights, decirlo y ofrecer generarlos.
3. **Prompt de sistema.** Reescribirlo como el de un asistente de trabajo que usa el material para producir entregables (correos, minutas, listas, mensajes). Las reglas pasan a ser:
   - Las afirmaciones sobre hechos citan fuente.
   - La redacción sigue el tono pedido.
   - Se respeta el idioma del usuario.
   - Se usa "Sobre mí" para firmar y adaptar el estilo.
4. **Formato.** Dejar de forzar JSON en el chat. La respuesta es markdown libre con citas `[n]`, y las fuentes se derivan del texto. Esto también es el requisito del streaming (sección 2.2). El coach sigue en JSON.
5. **Seguimiento.** Que pueda preguntar un dato que falta, por ejemplo destinatario o tono, en lugar de inventarlo, y que ofrezca ajustes ("más corto", "más formal").
6. **Casos de prueba** a validar con el modelo en la nube y con uno local:
   - Redactar el correo de minuta para el cliente.
   - Lista de acciones por responsable.
   - Resumen de dos líneas para un chat.
   - "¿Qué me toca a mí?" usando Sobre mí.
   - Pregunta de hecho con citas.

### 2.2 Streaming de respuestas (fase 2)

**Alcance acordado.** Proveedores compatibles con OpenAI (OpenAI, Groq, OpenRouter, Ollama, custom) y Gemini. Claude y los modelos locales de la IA integrada quedan para después.

**Qué hay que hacer.**

- **Backend:** una función de generación por streaming en `frontend/src-tauri/src/summary/llm_client.rs`.
  - Compatibles con OpenAI: SSE con `stream: true`.
  - Gemini: `streamGenerateContent?alt=sse`.
  - Un evento `assistant-token` con `{requestId, delta}`, y cancelación que conserva lo escrito.
- **Formato:** requiere haber hecho el punto 4 de la sección 2.1 (respuesta en markdown libre).
- **Frontend:** añadir texto al mensaje en curso mientras llega, con cursor parpadeante. Las etapas de espera pasan de temporizador a estados reales.
- **Siempre reactivo:** si todavía no llega el primer token, se mantiene la burbuja de espera con su estado. El usuario nunca debe ver la interfaz quieta.
- **Fallback:** si el proveedor no soporta streaming, mostrar la respuesta completa con animación de entrada.

### 2.3 Otros pendientes

- **GPU para la IA integrada.** El PC de desarrollo (RTX 3050 6 GB) no tiene CUDA Toolkit, así que `llama-helper` se compila solo para CPU. `scripts/tauri-auto.js` ya compila `llama-helper` con el backend detectado; falta instalar el CUDA Toolkit y relanzar. Con 6 GB de VRAM, Gemma 4 12B y Qwen 3.8 27B cargarán solo parcialmente en GPU.
- **Gemma 4 sin probar.** Falta verificar que el `llama-cpp-2` fijado (0.1.146) soporta la arquitectura `gemma4`. Las capas del Qwen 3.8 27B (64) son una suposición por analogía con Bonsai.
- **Bonsai 27B.** Usa la cuantización `Q1_0_g128`, que según su README requiere el fork de PrismML. Si no carga, retirarlo del catálogo o marcarlo como `legacy`.
- **Hablante en grabaciones antiguas.** Los rótulos Tú y Participantes solo existen en grabaciones nuevas. Las anteriores no guardaron quién habló. La heurística actual compara la energía del micrófono contra el audio del sistema; conviene calibrarla con grabaciones reales.
- **Insights en reuniones antiguas.** Hay que regenerarlos para ver los chips de tiempo. La plantilla `standard_meeting.json` ya pide marcas `[mm:ss]`.
- **Verificación visual.** Varias pantallas se ajustaron sin verla en pantalla. Conviene una pasada completa de la app en claro y en oscuro.
- **Herramientas.**
  - ESLint no está instalado, así que `next lint` no corre.
  - Playwright no está instalado, así que el smoke `tests/desktop/browser-smoke.cjs` no corre.
  - Una compilación nativa anterior falló con `LNK1114` en `onig_sys`; en las últimas ejecuciones compiló bien.
- **Catálogo de nube.** Los ids de respaldo en `models.json` (Gemini 3.1 Flash-Lite, 3.5 Flash-Lite, 3.6 Flash) vienen de lo indicado por el equipo. Con clave API configurada se usan los ids reales que devuelve el proveedor.

## 3. Dónde se mantiene cada cosa

| Qué | Dónde |
|---|---|
| Modelos locales (IA integrada) | `frontend/src-tauri/models/builtin_models.json` |
| Modelos de nube y reglas de filtro | `frontend/src/config/models.json` |
| Nombre del asistente | `frontend/src/config/brand.ts` |
| Plantilla de insights | `frontend/src-tauri/templates/standard_meeting.json` |
| Textos de la interfaz | `frontend/src/i18n/catalogs.ts` |
| Prompt del asistente | `frontend/src-tauri/src/desktop/assistant.rs` |
