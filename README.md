# MeetPulse

MeetPulse es una aplicación de escritorio de inteligencia para reuniones. Nació sobre la base open source de Meetily, pero hoy es un producto distinto: su foco es transformar cada conversación en contexto reutilizable para proyectos, clientes y equipos.

![Banner MeetPulse](/docs/meetpulse/Banner.png)

## Qué es MeetPulse

Las reuniones contienen decisiones, riesgos, acuerdos y contexto que normalmente termina disperso entre grabaciones, documentos y conversaciones. MeetPulse reúne ese ciclo en un solo flujo:

![Meetpulse flow](/docs/meetpulse/meetpulse-flow.png)

La aplicación se encarga de capturar y comprender una reunión. La Wiki convierte sus resultados en una biblioteca de proyecto estructurada, navegable y preparada para crecer con agentes de IA.

## La aplicación MeetPulse

![Home MeetPulse](/docs/meetpulse/banner-home.png)

### Captura confiable de reuniones

- Graba micrófono y audio del sistema en paralelo.
- Mezcla ambos canales con ducking y protección contra clipping para preservar la inteligibilidad.
- Muestra niveles de audio, permite pausar o reanudar, y ayuda a recuperar grabaciones interrumpidas.
- Gestiona permisos y dispositivos de audio, incluyendo detección de desconexiones y reconexión de dispositivos.

### Transcripción local y cloud, según el caso de uso

- Transcribe en tiempo real en el equipo mediante Whisper y Parakeet.
- Permite elegir español, inglés o detección automática según el motor utilizado.
- Descarga y administra modelos de transcripción desde la app.
- Importa audios existentes y retranscribe reuniones con otro modelo o idioma.
- Aprovecha aceleración disponible por plataforma: CPU, CUDA, Vulkan, Metal, CoreML, OpenBLAS o HIPBLAS.

### Gemini 3.1 Flash Lite: rapidez y eficiencia para reuniones

- Incluye soporte específico para **Gemini 3.1 Flash Lite** en transcripción casi en tiempo real, retranscripción y análisis de reuniones.
- Está pensado para equipos que buscan una relación costo/rendimiento especialmente competitiva sin renunciar a resultados de alta calidad.
- Aprovecha su contexto amplio para procesar conversaciones extensas y conservar mejor el hilo de la reunión al generar análisis y resúmenes.
- Gemini es una opción cloud: los segmentos de audio se envían a Google para su transcripción. Whisper y Parakeet siguen disponibles como alternativas totalmente locales.

![Transcription img](/docs/meetpulse/MeetPulse%20Transcription.png)

> Para demostrar el funcionamiento del producto, se realizó una prueba utilizando un video público de Midudev disponible en YouTube (puedes ver el video completo [AQUÍ](https://www.youtube.com/watch?v=rhmoIIzP3Us)). El texto que aparece en la imagen superior corresponde a un extracto de la transcripción de dicho contenido, cuya autoría y propiedad pertenecen a su creador.

### Resúmenes que se adaptan a tu forma de trabajar

- Genera, edita, guarda y regenera resúmenes desde la ficha de cada reunión.
- Usa plantillas y selecciona el idioma del resumen por reunión.
- Permite modelos locales integrados u Ollama; también Gemini, OpenAI, Anthropic, Groq, OpenRouter y endpoints compatibles con OpenAI.
- Incluye un editor enriquecido para transformar el resultado de IA en una nota útil antes de compartirla.

### Operación privada y preparada para escritorio

- Mantiene grabaciones, transcripciones y datos de reunión en el dispositivo.
- Organiza el historial de reuniones, permite buscar, renombrar, borrar y abrir las carpetas locales.
- Incluye onboarding, preferencias de apariencia e idioma, notificaciones y actualización de la aplicación.
- La analítica es opcional y anónima; no recopila contenido de reuniones, nombres ni rutas de archivos.

## La Wiki de conocimiento

La Wiki es el diferenciador de MeetPulse: no es solo un repositorio de resúmenes. Está diseñada como una biblioteca de conocimiento duradera, organizada por **espacio de trabajo → cliente → proyecto → documentos**.

Su diseño se inspira en el patrón de [LLM Wiki de Andrej Karpathy](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f): las fuentes permanecen separadas, mientras una capa de conocimiento persistente puede acumular síntesis, relaciones y contexto a lo largo del tiempo. También adopta los principios del [Open Knowledge Format](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing/): Markdown portable, frontmatter estructurado, archivos legibles por personas y agentes, e índices que permiten navegar conocimiento como un grafo.

### De reuniones aisladas a contexto de proyecto

- Publica un resumen de reunión a la Wiki con cliente, proyecto, fecha y participantes.
- Conserva cada publicación como fuente Markdown inmutable: la evidencia original no se reemplaza.
- Crea índices por espacio de trabajo, cliente y proyecto, junto con una bitácora cronológica de ingestas.
- Presenta indicadores de clientes, proyectos, fuentes, páginas y actividad reciente.
- Permite explorar y buscar clientes, proyectos y documentos desde una interfaz dedicada.

![Client list wiki](/docs/meetpulse/client-list.png)
### Un espacio compartido, con contexto editable

- Crea espacios de trabajo y permite administrar miembros, invitaciones y roles de propietario o invitado.
- Ofrece un documento de contexto editable por proyecto para objetivos, decisiones, restricciones, enlaces y antecedentes estables.
- Mantiene separados el contexto durable del proyecto y los análisis inmutables de cada reunión.
- Protege el acceso al espacio de trabajo mediante autenticación con Google y permisos por tenant.

![Project list wiki by client](/docs/meetpulse/project-list.png)

### Base para un agente bibliotecario

La Wiki ya proporciona las capas necesarias para evolucionar hacia un agente que administre la biblioteca: fuentes inmutables, contexto editable, estructura navegable e historial de cambios. Las próximas iteraciones podrán ampliar esta base con enriquecimiento automático, páginas derivadas interconectadas, consultas sobre la biblioteca y revisiones de consistencia.

Estas capacidades futuras se describen como hoja de ruta; no se presentan como funciones disponibles hoy.

![Document view](/docs/meetpulse/document-view.png)

> Para demostrar el funcionamiento del producto, se realizó una prueba utilizando un video público de Midudev disponible en YouTube (puedes ver el video completo [AQUÍ](https://www.youtube.com/watch?v=rhmoIIzP3Us)). El texto que aparece en la imagen superior corresponde a un Análisis de la transcripción de dicho contenido, cuya autoría y propiedad pertenecen a su creador.

## Arquitectura

```text
MeetPulse Desktop
├── Next.js + React          Interfaz de escritorio
├── Tauri + Rust             Captura de audio, transcripción y almacenamiento local
├── Modelos locales          Whisper, Parakeet y modelos de resumen
├── Modelos Externos         Gemini, OpenAI, Groq, OpenRouter, Anthropic...
└── Wiki API                 Autenticación, permisos y biblioteca compartida
    ├── Cloudflare R2        Fuentes y documentos Markdown
    └── Cloudflare D1        Identidad, tenants e invitaciones
```

La Wiki API vive actualmente en el repositorio complementario `meetpulse-api-wiki`.

## Desarrollo local

### Requisitos

- Node.js y `pnpm` (mediante Corepack)
- Rust y las dependencias de compilación de Tauri para tu plataforma
- En Windows, LLVM/Clang cuando sea requerido por las dependencias nativas

### Ejecutar en desarrollo

```powershell
cd frontend
corepack pnpm install
corepack pnpm run tauri:dev:cpu
```

Para usar otra aceleración, están disponibles `tauri:dev:cuda`, `tauri:dev:vulkan`, `tauri:dev:metal` y `tauri:dev:coreml` cuando correspondan a tu equipo.

### Compilar

```powershell
cd frontend
corepack pnpm run tauri:build
```

## Origen y licencia

MeetPulse utiliza Meetily como base histórica del codebase y reconoce el trabajo de su comunidad open source. **La identidad, experiencia de producto y dirección actual corresponden a MeetPulse.**

Este repositorio mantiene licencia MIT.
