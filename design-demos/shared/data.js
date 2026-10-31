/* Mock data compartida por los tres demos. Nada de esto es real. */
window.MP = window.MP || {};
MP.data = {
  meeting: {
    title: "Planificación sprint 14",
    client: "Bodegas Calderón",
    project: "Portal de pedidos",
    date: "vie 16 oct, 15:00",
    dur: 2832,
  },

  summary: [
    "El flujo de pedidos recurrentes ya está en producción y solo requiere un botón para duplicar pedidos.",
    "La integración con el ERP de bodega quedó bloqueada por las credenciales de pruebas, por lo que el ERP seguirá en solo lectura este sprint.",
    "Se paginará el catálogo, se posterga WhatsApp al sprint 16 y se congela el alcance de facturación hasta el viernes.",
  ],

  // who: you = micrófono, others = audio del sistema
  turns: [
    { t: 8, who: "others", text: "Buenas tardes a todos. Partamos revisando el sprint pasado: el flujo de pedidos recurrentes está en producción desde el jueves." },
    { t: 31, who: "you", text: "Perfecto. Soporte no ha visto errores nuevos, solo dos consultas sobre cómo repetir un pedido anterior." },
    { t: 52, who: "others", text: "Entonces conviene un botón visible de Duplicar pedido en el historial. Camila, ¿lo tomas tú?" },
    { t: 66, who: "others", text: "Es un cambio pequeño, no debería mover la estimación." },
    { t: 84, who: "you", text: "Yo lo reviso con ella para que quede igual que en la app móvil." },
    { t: 170, who: "others", text: "Pasemos a lo grande del sprint: la integración con el ERP de la bodega. ¿Ya tenemos ambiente de pruebas?" },
    { t: 228, who: "others", text: "Todavía no. Matías pidió las credenciales el lunes y TI de Calderón respondió que llegan antes del miércoles." },
    { t: 251, who: "you", text: "Sin ese acceso no puedo validar los precios mayoristas. Es el mayor riesgo que veo hoy." },
    { t: 312, who: "others", text: "De acuerdo, lo marcamos como bloqueo. Mientras tanto avanzamos con datos simulados." },
    { t: 760, who: "others", text: "Propongo que el ERP quede en solo lectura hasta que validemos todo en pruebas. Nada de escrituras en producción este sprint." },
    { t: 772, who: "you", text: "Me parece bien, reduce el riesgo y no frena el resto del trabajo." },
    { t: 905, who: "others", text: "Una pregunta abierta: ¿quién valida los precios mayoristas del lado del ERP, Calderón o nosotros?" },
    { t: 1010, who: "you", text: "Tampoco sabemos si el ambiente de pruebas replica el stock real. Eso cambia cómo probamos los pedidos grandes." },
    { t: 1090, who: "others", text: "Sigamos con el catálogo. Camila mostró que con muchos productos la carga se siente lenta." },
    { t: 1160, who: "you", text: "Puedo medir los tiempos con 12 000 productos y traer números el jueves." },
    { t: 1335, who: "others", text: "Entonces decidimos paginar a 40 productos por página en lugar del scroll infinito." },
    { t: 1350, who: "you", text: "Sí, es más predecible y mejora la búsqueda con el teclado." },
    { t: 1760, who: "others", text: "Hablemos de alcance. ¿Entran las notificaciones por WhatsApp en este sprint?" },
    { t: 1985, who: "others", text: "Mejor las dejamos para el sprint 16. Primero cerramos pedidos y facturación." },
    { t: 2010, who: "you", text: "De acuerdo. Así el equipo no se dispersa." },
    { t: 2410, who: "others", text: "Sobre facturación, necesito una estimación revisada antes de congelar el alcance." },
    { t: 2510, who: "others", text: "Congelamos el alcance de facturación hasta el viernes." },
    { t: 2530, who: "others", text: "Valentina, ¿puedes enviar la estimación revisada el lunes?" },
    { t: 2590, who: "you", text: "Yo agendo la demo con bodega para el martes 27." },
    { t: 2760, who: "others", text: "Gracias a todos. Cerramos aquí, el resumen les llega hoy mismo." },
  ],

  live: [
    { who: "others", text: "Una última cosa: alguien debería avisar a bodega del cambio de fecha de la demo." },
    { who: "you", text: "Lo incluyo en el correo de confirmación de la demo." },
    { who: "others", text: "Perfecto. Y recuerden subir sus horas antes del viernes." },
    { who: "you", text: "Anotado. Nos vemos el martes." },
  ],

  topics: [
    { name: "Revisión del sprint anterior", from: 0, to: 330 },
    { name: "Integración con el ERP", from: 330, to: 1080 },
    { name: "Rendimiento del catálogo", from: 1080, to: 1720 },
    { name: "Alcance y prioridades", from: 1720, to: 2400 },
    { name: "Facturación y cierre", from: 2400, to: 2832 },
  ],

  decisions: [
    { t: 760, text: "El ERP queda en solo lectura hasta validar todo en el ambiente de pruebas." },
    { t: 1335, text: "El catálogo se pagina a 40 productos por página, sin scroll infinito." },
    { t: 1985, text: "Las notificaciones por WhatsApp pasan al sprint 16." },
    { t: 2510, text: "El alcance de facturación se congela hasta el viernes." },
  ],

  actions: [
    { t: 52, text: "Agregar botón Duplicar pedido en el historial", owner: "Camila Herrera", ini: "CH", due: "Vie 23", done: false },
    { t: 228, text: "Confirmar con TI de Calderón la entrega de credenciales de pruebas", owner: "Matías Cordero", ini: "MC", due: "Mié 21", done: true },
    { t: 1160, text: "Medir tiempos del catálogo con 12 000 productos", owner: "Tú", ini: "VJ", due: "Jue 22", done: false },
    { t: 2530, text: "Enviar la estimación revisada de facturación", owner: "Valentina Rojas", ini: "VR", due: "Lun 26", done: false },
    { t: 2590, text: "Agendar la demo con bodega", owner: "Tú", ini: "VJ", due: "Mar 27", done: false },
  ],

  questions: [
    { t: 905, text: "¿Quién valida los precios mayoristas del lado del ERP?", risk: false },
    { t: 1010, text: "¿El ambiente de pruebas replica el stock real?", risk: false },
    { t: 251, text: "Riesgo: sin credenciales no se pueden validar los precios mayoristas.", risk: true },
  ],

  talk: { you: 38, others: 62 },

  models: [
    { id: "llama32-3b", name: "Llama 3.2 3B", provider: "Ollama", kind: "local", size: "2,0 GB", ctx: "128k", status: "ready", tag: "Recomendado" },
    { id: "qwen25-7b", name: "Qwen 2.5 7B", provider: "Ollama", kind: "local", size: "4,7 GB", ctx: "32k", status: "ready" },
    { id: "gemma3-4b", name: "Gemma 3 4B", provider: "Ollama", kind: "local", size: "3,3 GB", ctx: "128k", status: "download" },
    { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", provider: "Anthropic", kind: "cloud", ctx: "200k", status: "ready" },
    { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", provider: "Anthropic", kind: "cloud", ctx: "200k", status: "ready", tag: "Rápido" },
    { id: "groq-llama-70b", name: "Llama 3.3 70B", provider: "Groq", kind: "cloud", ctx: "128k", status: "key" },
    { id: "or-mistral-large", name: "Mistral Large", provider: "OpenRouter", kind: "cloud", ctx: "128k", status: "key" },
  ],

  chat: [
    { role: "user", text: "¿Qué quedó pendiente con el ERP?" },
    { role: "ai", text: "Hay un bloqueo y una decisión. El bloqueo: aún no llegan las credenciales del ambiente de pruebas [03:48]. La decisión: el ERP queda en solo lectura hasta validar todo [12:40]. Matías ya confirmó con TI de Calderón que las credenciales llegan antes del miércoles." },
  ],

  suggestions: [
    "¿Qué me toca a mí?",
    "Resume las decisiones",
    "Redacta un correo de seguimiento",
    "¿Qué riesgos quedaron abiertos?",
  ],

  replies: {
    "me toca": "Tienes dos acciones. Medir los tiempos del catálogo con 12 000 productos antes del jueves 22 [19:20] y agendar la demo con bodega para el martes 27 [43:10].",
    "decisiones": "Se tomaron cuatro decisiones. El ERP queda en solo lectura [12:40], el catálogo se pagina a 40 productos [22:15], WhatsApp pasa al sprint 16 [33:05] y el alcance de facturación se congela hasta el viernes [41:50].",
    "correo": "Asunto: Resumen sprint 14 y próximos pasos\n\nHola equipo, gracias por la reunión de hoy. Dejamos el ERP en solo lectura hasta validar en pruebas [12:40], paginamos el catálogo [22:15] y congelamos facturación hasta el viernes [41:50]. Cada responsable tiene su acción asignada con fecha en el resumen adjunto.",
    "riesgos": "Queda un riesgo y dos preguntas abiertas. Sin credenciales no se pueden validar los precios mayoristas [04:11]. Falta definir quién valida esos precios [15:05] y si el ambiente de pruebas replica el stock real [16:50].",
    "_": "Según la transcripción, eso se menciona cerca de [12:40], pero no hay una conclusión explícita. ¿Quieres que revise otro tramo de la reunión?",
  },

  recent: [
    { id: "m1", date: "Hoy 15:00", title: "Planificación sprint 14", client: "Bodegas Calderón", project: "Portal de pedidos", dur: "47 min", acts: 5, topic: "Integración con el ERP" },
    { id: "m2", date: "Ayer 11:30", title: "Revisión de diseño del checkout", client: "Estudio Marea", project: "Tienda web", dur: "32 min", acts: 3, topic: "Flujo de pago" },
    { id: "m3", date: "Mar 13 oct", title: "Entrevista con proveedor de logística", client: "Interno", project: "Operaciones", dur: "58 min", acts: 7, topic: "Costos de despacho" },
    { id: "m4", date: "Lun 12 oct", title: "Retrospectiva del trimestre", client: "Interno", project: "Equipo", dur: "41 min", acts: 2, topic: "Carga de trabajo" },
    { id: "m5", date: "Jue 8 oct", title: "Kickoff sitio de donaciones", client: "Fundación Raíz", project: "Sitio de donaciones", dur: "1 h 06 min", acts: 9, topic: "Pasarela de pagos" },
  ],

  readiness: [
    { ok: true, name: "Micrófono", val: "Micrófono integrado" },
    { ok: true, name: "Audio del sistema", val: "Altavoces, captura activa" },
    { ok: true, name: "Transcripción", val: "Whisper small, listo" },
    { ok: true, name: "Resumen", val: "Llama 3.2 3B, local" },
  ],
};
