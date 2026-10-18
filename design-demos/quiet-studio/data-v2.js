/* Extiende la mock data para Quiet Studio v2: motores de transcripción (local y nube),
   Gemini en transcripción y análisis, biblioteca, acciones globales y corpus para el asistente. */
(function () {
  const D = MP.data;

  // Los modelos existentes son de análisis (resumen, chat, coach)
  D.models.forEach((m) => { m.caps = m.caps || ["analysis"]; });
  D.models.push({ id: "gemini-31-flash-lite", name: "Gemini 3.1 Flash-Lite", provider: "Google", kind: "cloud", ctx: "1M", status: "ready", caps: ["analysis"], tag: "Contexto largo" });

  // Motores de transcripción: locales y remotos
  D.stt = [
    { id: "whisper-small", name: "Whisper small", provider: "Whisper", kind: "local", size: "466 MB", note: "Equilibrado, español e inglés", status: "ready", tag: "Recomendado" },
    { id: "whisper-base", name: "Whisper base", provider: "Whisper", kind: "local", size: "142 MB", note: "Rápido, menos preciso", status: "ready" },
    { id: "whisper-medium", name: "Whisper medium", provider: "Whisper", kind: "local", size: "1,5 GB", note: "Más preciso, pide más equipo", status: "download" },
    { id: "parakeet-v3", name: "Parakeet v3", provider: "Parakeet", kind: "local", size: "650 MB", note: "Muy rápido con GPU", status: "ready" },
    { id: "gemini-stt", name: "Gemini 3.1 Flash-Lite", provider: "Google", kind: "cloud", note: "Casi en tiempo real, conserva frases mixtas", status: "ready", tag: "Nube" },
  ];

  // Biblioteca: reuniones con estados
  D.recent.forEach((r, i) => { r.tags = [["ERP", "Sprint"], ["Diseño", "Checkout"], ["Logística"], ["Equipo"], ["Pagos", "Kickoff"]][i] || []; r.engine = i === 4 ? "gemini" : "whisper"; });
  D.recent.push(
    { id: "m6", date: "Mié 7 oct", title: "Llamada con soporte de la pasarela", client: "Estudio Marea", project: "Tienda web", dur: "18 min", acts: 0, topic: "Pasarela de pruebas", status: "processing", tags: ["Pagos"], engine: "whisper" },
    { id: "m7", date: "Mar 6 oct", title: "Planificación trimestral", client: "Interno", project: "Equipo", dur: "1 h 12 min", acts: 0, topic: "Sin resumen", status: "nosummary", tags: ["Equipo"], engine: "whisper" }
  );

  // Acciones de todas las reuniones
  D.allActions = [
    { text: "Medir tiempos del catálogo con 12 000 productos", owner: "Tú", ini: "VJ", due: "Jue 22", bucket: "week", meeting: "Planificación sprint 14", mid: "m1", t: 1160, done: false },
    { text: "Agendar la demo con bodega", owner: "Tú", ini: "VJ", due: "Mar 27", bucket: "later", meeting: "Planificación sprint 14", mid: "m1", t: 2590, done: false },
    { text: "Escribir al soporte de la pasarela de pruebas", owner: "Tú", ini: "VJ", due: "Hoy", bucket: "overdue", meeting: "Revisión de diseño del checkout", mid: "m2", t: 760, done: false },
    { text: "Agregar botón Duplicar pedido en el historial", owner: "Camila Herrera", ini: "CH", due: "Vie 23", bucket: "week", meeting: "Planificación sprint 14", mid: "m1", t: 52, done: false },
    { text: "Enviar la estimación revisada de facturación", owner: "Valentina Rojas", ini: "VR", due: "Lun 26", bucket: "later", meeting: "Planificación sprint 14", mid: "m1", t: 2530, done: false },
    { text: "Actualizar el prototipo del checkout", owner: "Daniela Soto", ini: "DS", due: "Jue 22", bucket: "week", meeting: "Revisión de diseño del checkout", mid: "m2", t: 410, done: false },
    { text: "Pedir cotización a dos proveedores más", owner: "Tú", ini: "VJ", due: "Vie 16", bucket: "overdue", meeting: "Entrevista con proveedor de logística", mid: "m3", t: 1900, done: false },
    { text: "Documentar el proceso de despliegue", owner: "Rodrigo Pinto", ini: "RP", due: "Lun 26", bucket: "later", meeting: "Retrospectiva del trimestre", mid: "m4", t: 1500, done: false },
    { text: "Confirmar con TI de Calderón la entrega de credenciales", owner: "Matías Cordero", ini: "MC", due: "Mié 21", bucket: "week", meeting: "Planificación sprint 14", mid: "m1", t: 228, done: true },
  ];

  // Asistente: alcance, historial e índice local (la búsqueda real queda para la próxima funcionalidad)
  D.scopes = [
    { id: "all", icon: "books", name: "Todas mis reuniones", desc: "Busca en las 128 reuniones indexadas" },
    { id: "meeting", icon: "notebook", name: "Esta reunión", desc: "Solo la reunión abierta" },
    { id: "client", icon: "buildings", name: "Bodegas Calderón", desc: "Cliente y todos sus proyectos" },
    { id: "recent", icon: "calendar-dots", name: "Últimos 30 días", desc: "Reuniones recientes" },
  ];
  D.history = [
    { title: "Riesgos abiertos de la semana", when: "Hoy" },
    { title: "Costos de despacho de logística", when: "Ayer" },
    { title: "¿Qué decidimos sobre el catálogo?", when: "Lun" },
  ];
  D.index = { meetings: 128, fragments: "4.310", updated: "hace 2 min" };

  const S = (id, t, quote) => ({ id, t, quote });
  D.sources = {
    m1: { title: "Planificación sprint 14", date: "Hoy", client: "Bodegas Calderón" },
    m2: { title: "Revisión de diseño del checkout", date: "Ayer", client: "Estudio Marea" },
    m3: { title: "Entrevista con proveedor de logística", date: "Mar 13 oct", client: "Interno" },
    m4: { title: "Retrospectiva del trimestre", date: "Lun 12 oct", client: "Interno" },
    m5: { title: "Kickoff sitio de donaciones", date: "Jue 8 oct", client: "Fundación Raíz" },
  };
  D.askReplies = [
    { keys: ["pendiente", "acciones", "tarea", "me toca", "mis acciones"], scopes: ["all", "recent"], text: "Tienes 4 acciones abiertas en 3 reuniones. Una ya venció: pedir cotización a dos proveedores más. Las próximas son medir los tiempos del catálogo (jueves 22) y agendar la demo con bodega (martes 27).",
      sources: [S("m3", 1900, "Quedamos en pedir cotización a dos proveedores más antes de cerrar."), S("m1", 1160, "Puedo medir los tiempos con 12 000 productos y traer números el jueves."), S("m1", 2590, "Yo agendo la demo con bodega para el martes 27.")] },
    { keys: ["erp", "calderón", "calderon", "credenciales"], scopes: ["all", "client", "recent"], text: "Sobre el ERP de Bodegas Calderón: queda en solo lectura hasta validar todo en el ambiente de pruebas, y el bloqueo son las credenciales, que según Matías llegan antes del miércoles. Es el único tema de esa cuenta con riesgo abierto.",
      sources: [S("m1", 760, "Propongo que el ERP quede en solo lectura hasta que validemos todo en pruebas."), S("m1", 228, "Matías pidió las credenciales el lunes y TI de Calderón respondió que llegan antes del miércoles.")] },
    { keys: ["checkout", "teléfono", "telefono", "pasarela", "pago"], scopes: ["all", "recent"], text: "En el checkout se decidió pedir el teléfono solo con despacho a domicilio. La pasarela de pruebas sigue caída y puede bloquear el inicio del lunes. En el kickoff de Fundación Raíz también se habló de pasarelas de pago, pero con otro proveedor.",
      sources: [S("m2", 410, "El teléfono solo es obligatorio con despacho a domicilio."), S("m2", 760, "La pasarela de pagos de pruebas sigue caída desde ayer."), S("m5", 980, "Evaluemos dos pasarelas antes de definir las donaciones recurrentes.")] },
    { keys: ["despacho", "logística", "logistica", "costos", "proveedor", "tarifa"], scopes: ["all", "recent"], text: "El proveedor de logística cotizó por kilo, con una tarifa menor en la región metropolitana y un mínimo mensual. Se decidió pedir cotización a dos proveedores más antes de cerrar.",
      sources: [S("m3", 1240, "La tarifa por kilo baja en la región metropolitana, pero hay un mínimo mensual."), S("m3", 1900, "Quedamos en pedir cotización a dos proveedores más.")] },
    { keys: ["decid", "decisiones", "semana"], scopes: ["all", "recent", "client"], text: "Esta semana se tomaron 7 decisiones en 3 reuniones. Destacan: el ERP en solo lectura, el catálogo paginado a 40 productos y el teléfono obligatorio solo con despacho a domicilio.",
      sources: [S("m1", 760, "El ERP queda en solo lectura hasta validar."), S("m1", 1335, "Decidimos paginar a 40 productos por página."), S("m2", 410, "El teléfono solo es obligatorio con despacho a domicilio.")] },
    { keys: ["riesgo", "bloqueo"], scopes: ["all", "recent", "client"], text: "Hay 2 riesgos abiertos. Las credenciales del ERP (Bodegas Calderón), que impiden validar precios mayoristas, y la pasarela de pruebas caída (Estudio Marea), que puede frenar el inicio del lunes.",
      sources: [S("m1", 251, "Sin ese acceso no puedo validar los precios mayoristas."), S("m2", 760, "La pasarela de pagos de pruebas sigue caída desde ayer.")] },
  ];
  D.askSuggestions = {
    all: ["¿Qué tengo pendiente esta semana?", "Resume las decisiones de la semana", "¿Qué riesgos hay abiertos?", "¿Qué se dijo sobre costos de despacho?"],
    meeting: D.suggestions,
    client: ["¿Qué quedó pendiente con el ERP?", "¿Hay riesgos abiertos en esta cuenta?"],
    recent: ["¿Qué decidimos este mes?", "¿Qué tengo pendiente?"],
  };
})();
