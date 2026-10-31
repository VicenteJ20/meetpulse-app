# MeetPulse

La app de escritorio abre directamente en un espacio local: el asistente Coach/Chat, el historial por cliente/proyecto, la búsqueda semántica local y las exportaciones PDF funcionan desde la app. Consulta [Desktop workspace](docs/meetpulse/DESKTOP_WORKSPACE.md) para configuración y verificación.

MeetPulse es una aplicación de escritorio de inteligencia para reuniones. Nació sobre la base open source de Meetily, pero hoy es un producto distinto: su foco es transformar cada conversación en contexto reutilizable para proyectos, clientes y equipos.

![Banner MeetPulse](/docs/meetpulse/Banner.png)

## Qué es MeetPulse

Las reuniones contienen decisiones, riesgos, acuerdos y contexto que normalmente termina disperso entre grabaciones, documentos y conversaciones. MeetPulse reúne ese ciclo en un solo flujo:

![Meetpulse flow](/docs/meetpulse/meetpulse-flow.png)

La aplicación captura, transcribe y analiza cada reunión, y la organiza en una biblioteca local por cliente y proyecto.

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

## Arquitectura

```text
MeetPulse Desktop
├── Next.js + React          Interfaz de escritorio
├── Tauri + Rust             Captura de audio, transcripción y almacenamiento local
├── Modelos locales          Whisper, Parakeet y modelos de resumen
└── Modelos Externos         Gemini, OpenAI, Groq, OpenRouter, Anthropic...
```

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
