/* Demo de grabación en vivo: transcripción simulada, coach opcional y chat opcional. */
(function () {
  const MP = window.MP;
  const $ = (s) => document.querySelector(s);
  const icon = MP.icon;
  const esc = MP.esc;
  const fmt = MP.fmt;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v === "1"; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v ? "1" : "0"); } catch (e) {} },
  };

  /* Guion de la reunión simulada. "coach" es lo que el coach detectaría en ese punto. */
  const SCRIPT = [
    { who: "others", text: "Buenos días. Hoy cerramos el flujo de pago del checkout para que desarrollo pueda empezar el lunes." },
    { who: "you", text: "Perfecto. ¿Tenemos definido en cuántos pasos queda el flujo en móvil?" },
    { who: "others", text: "Quedó en tres pasos: dirección, envío y pago. Quitamos el paso de resumen porque duplicaba información.", coach: { type: "topic", text: "Tema: flujo del checkout en móvil, tres pasos." } },
    { who: "others", text: "Falta decidir si pedimos el teléfono como campo obligatorio.", coach: { type: "question", text: "Pregunta abierta: ¿el teléfono será obligatorio?" } },
    { who: "you", text: "Para el courier sí lo necesitamos, pero podemos pedirlo solo cuando elijan despacho a domicilio." },
    { who: "others", text: "Me parece bien. Entonces el teléfono solo es obligatorio con despacho a domicilio.", coach: { type: "decision", text: "Decisión: el teléfono es obligatorio solo con despacho a domicilio." } },
    { who: "others", text: "Daniela, ¿puedes actualizar el prototipo con ese cambio antes del jueves?", coach: { type: "action", text: "Acción: Daniela actualiza el prototipo antes del jueves." } },
    { who: "you", text: "También hay que revisar los mensajes de error del pago rechazado. Hoy dicen solo “Error”.", coach: { type: "tip", text: "Nadie tiene asignado el tema de los mensajes de error del pago rechazado." } },
    { who: "others", text: "Es verdad, lo dejamos pendiente para la próxima reunión." },
    { who: "you", text: "Prefiero asignarlo ahora, si no se nos olvida." },
    { who: "others", text: "Entonces lo toma Rodrigo y lo revisa con soporte.", coach: { type: "action", text: "Acción: Rodrigo revisa los mensajes de error del pago rechazado con soporte." } },
    { who: "others", text: "Última cosa: la pasarela de pagos de pruebas sigue caída desde ayer.", coach: { type: "risk", text: "Riesgo: la pasarela de pruebas caída puede bloquear el inicio del lunes." } },
    { who: "you", text: "Escribo a su soporte hoy mismo.", coach: { type: "action", text: "Acción: Tú escribes al soporte de la pasarela hoy." } },
    { who: "others", text: "Perfecto. Cerramos aquí.", coach: { type: "tip", text: "Faltan fechas para dos de las tres acciones. ¿Las definen antes de cerrar?" } },
  ];
  const TYPES = {
    decision: ["check-circle", "Decisión"], action: ["list-checks", "Acción"], question: ["question", "Pregunta abierta"],
    risk: ["warning", "Riesgo"], tip: ["lightbulb", "Sugerencia"], topic: ["path", "Tema"],
  };
  const CHAT_REPLIES = {
    resum: "Hasta ahora: el checkout queda en tres pasos, el teléfono solo es obligatorio con despacho a domicilio y hay acciones asignadas a Daniela y Rodrigo.",
    pendiente: "Queda pendiente definir fechas para las acciones de Rodrigo y del soporte de la pasarela. Además la pasarela de pruebas sigue caída.",
    acci: "Por ahora: Daniela actualiza el prototipo antes del jueves, Rodrigo revisa los mensajes de error con soporte y tú escribes al soporte de la pasarela.",
    _: "Con lo dicho hasta ahora no hay una respuesta clara. Puedo volver a revisarlo cuando avancen más en la reunión.",
  };

  /* ---------- Estado ---------- */
  let elapsed = 0, idx = 0, paused = false, ended = false;
  const qp = new URLSearchParams(location.search);
  let coachOn = qp.has("coach") ? qp.get("coach") === "1" : store.get("mp-coach", false);
  let chatOn = qp.has("chat") ? qp.get("chat") === "1" : store.get("mp-chat", true);
  let coachCount = 0, coachSince = null, dockTab = qp.get("dock") === "chat" ? "chat" : "coach", dockOpen = coachOn || chatOn;
  const cards = [];
  const SPEED = 8;

  const panes = $("#panes"), scrollEl = $("#liveScroll"), list = $("#liveTranscript"), back = $("#backLive");
  const nearBottom = () => scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 120;

  /* ---------- Niveles de audio ---------- */
  function buildMeter(el) { el.innerHTML = Array.from({ length: 12 }, () => "<span></span>").join(""); return [...el.children]; }
  const mic = buildMeter($("#meterMic")), sys = buildMeter($("#meterSys"));
  let speaking = "others";
  function paintMeters() {
    const lvl = (bars, active) => {
      const v = paused || ended ? 0 : active ? 0.35 + Math.random() * 0.6 : Math.random() * 0.12;
      bars.forEach((b, i) => { const on = i / bars.length < v; b.className = on ? (i > 9 ? "hot" : "on") : ""; });
    };
    lvl(mic, speaking === "you"); lvl(sys, speaking === "others");
  }
  setInterval(paintMeters, reduce ? 600 : 130);

  /* ---------- Reloj ---------- */
  const clock = $("#clock");
  setInterval(() => { if (paused || ended) return; elapsed += SPEED; clock.textContent = fmt(elapsed); }, 1000);

  /* ---------- Transcripción simulada ---------- */
  const partial = $("#partial"), partialText = $("#partialText"), partialT = $("#partialT");
  const sttNow = () => MP.models.cur("stt");
  const isCloud = () => sttNow().kind === "cloud";
  function paintStt() {
    const m = sttNow();
    $("#sttLabel").innerHTML = `${icon(m.kind === "local" ? "cpu" : "cloud")}<span>${m.name}</span><em>${m.kind === "local" ? "local" : "nube"}</em>`;
    $("#sttNote").hidden = !isCloud();
  }
  document.addEventListener("mp:models", paintStt);
  // Escribe una línea confirmada en la transcripción (y el insight del coach, si corresponde)
  function commit(line) {
    const stick = nearBottom();
    const turn = { t: elapsed, who: line.who, text: line.text };
    MP.appendLine(list, turn, "grouped", "is-new");
    if (line.coach && coachOn) pushCard(line.coach, turn.t);
    idx++;
    if (stick) scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: reduce ? "auto" : "smooth" }); else back.hidden = false;
  }
  function nextLine() {
    if (paused || ended) return setTimeout(nextLine, 600);
    if (idx >= SCRIPT.length) { finish(); return; }
    const line = SCRIPT[idx];
    speaking = line.who;
    // Motor en la nube (Gemini): el texto llega en bloques, no palabra por palabra
    if (isCloud()) {
      $("#waiting").hidden = true;
      partial.hidden = false; partialT.textContent = fmt(elapsed); partialText.textContent = "Procesando el siguiente bloque de audio";
      setTimeout(() => {
        if (paused) return nextLine();
        partial.hidden = true; partialText.textContent = "";
        commit(SCRIPT[idx]);
        if (idx < SCRIPT.length) { elapsed += SPEED * 2; speaking = SCRIPT[idx].who; commit(SCRIPT[idx]); }
        setTimeout(nextLine, 900);
      }, reduce ? 0 : 4200);
      return;
    }
    // Texto parcial que se va completando antes de confirmarse la línea
    $("#waiting").hidden = true;
    partial.hidden = false; partialT.textContent = fmt(elapsed);
    const words = line.text.split(" "); let w = 0;
    const iv = setInterval(() => {
      if (paused) return;
      w = Math.min(words.length, w + 3);
      partialText.textContent = words.slice(0, w).join(" ");
      if (nearBottom()) scrollEl.scrollTop = scrollEl.scrollHeight;
      if (w >= words.length) {
        clearInterval(iv);
        setTimeout(() => {
          partial.hidden = true; partialText.textContent = "";
          commit(line);
          setTimeout(nextLine, 1500 + Math.random() * 1500);
        }, 350);
      }
    }, reduce ? 0 : 260);
  }
  scrollEl.addEventListener("scroll", () => { if (nearBottom()) back.hidden = true; });
  back.addEventListener("click", () => { scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: reduce ? "auto" : "smooth" }); back.hidden = true; });

  function finish() {
    ended = true; speaking = "";
    $("#recLabel").textContent = "FINALIZADA";
    $("#liveRoot").classList.add("is-paused");
    MP.toast("La reunión simulada terminó. Pulsa Detener para procesarla.");
  }

  /* ---------- Controles ---------- */
  $("#pauseBtn").addEventListener("click", () => {
    if (ended) return;
    paused = !paused;
    $("#pauseBtn").innerHTML = paused ? icon("play", true) + "<span>Reanudar</span>" : icon("pause", true) + "<span>Pausar</span>";
    $("#recLabel").textContent = paused ? "EN PAUSA" : "GRABANDO";
    $("#liveRoot").classList.toggle("is-paused", paused);
    renderCoachStatus();
  });
  $("#stopBtn").addEventListener("click", () => {
    const back = document.createElement("div");
    back.className = "modal-back";
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mt"><h3 id="mt">¿Detener la grabación?</h3><p>Se transcribirá y resumirá en este equipo. Tardará unos minutos según el modelo.</p><div class="acts"><button class="btn" data-x>Seguir grabando</button><button class="btn btn-primary" data-ok>Detener y procesar</button></div></div>`;
    document.body.appendChild(back);
    back.querySelector("[data-x]").focus();
    back.addEventListener("click", (e) => {
      if (e.target === back || e.target.closest("[data-x]")) back.remove();
      if (e.target.closest("[data-ok]")) location.href = "loading.html?state=processing";
    });
    addEventListener("keydown", function esc(e) { if (e.key === "Escape") { back.remove(); removeEventListener("keydown", esc); } });
  });

  /* ---------- Dock: coach y chat opcionales ---------- */
  const coachChip = $("#coachChip"), chatChip = $("#chatChip"), coachSwitch = $("#coachSwitch");
  function renderDock() {
    panes.dataset.dock = dockOpen ? "on" : "off";
    coachChip.setAttribute("aria-pressed", String(coachOn));
    coachSwitch.checked = coachOn;
    chatChip.setAttribute("aria-pressed", String(dockOpen && dockTab === "chat"));
    $("#tabCoach").setAttribute("aria-checked", String(dockTab === "coach"));
    $("#tabChat").setAttribute("aria-checked", String(dockTab === "chat"));
    $("#panelCoach").hidden = dockTab !== "coach";
    $("#panelChat").hidden = dockTab !== "chat";
    renderCoachStatus(); renderCoachList();
  }
  function renderCoachStatus() {
    const s = $("#coachStatus");
    if (!coachOn) s.textContent = "Apagado";
    else if (paused || ended) s.textContent = "En pausa";
    else s.innerHTML = '<span class="pulse"></span>Escuchando y analizando';
    const c = $("#coachCnt");
    c.hidden = !(coachOn && coachCount > 0); c.textContent = coachCount;
  }
  const plain = (t) => { const x = t.replace(/^(Acción|Decisión|Pregunta abierta|Riesgo|Tema): /, ""); return x.charAt(0).toUpperCase() + x.slice(1); };
  function cardHTML(c, i) {
    const [ic, label] = TYPES[c.type];
    return `<article class="c-card${c.pinned ? " is-pinned" : ""}${c.fresh ? " is-new" : ""}" data-i="${i}">
      <div class="c-top"><span class="ty-${c.type}" style="display:inline-flex;align-items:center;gap:6px">${icon(ic)}${label}</span><button class="chip-time" data-live-seek="${c.t}" title="Ir a ese momento">${fmt(c.t)}</button></div>
      <p class="c-text">${esc(plain(c.text))}</p>
      <div class="c-acts">
        ${c.type === "action" ? `<button class="primary" data-act="add">${icon("plus")}Añadir a acciones</button>` : ""}
        <button data-act="pin" class="${c.pinned ? "is-on" : ""}">${icon("push-pin", c.pinned)}${c.pinned ? "Fijado" : "Fijar"}</button>
        <button data-act="dismiss">${icon("x")}Descartar</button>
      </div></article>`;
  }
  function renderCoachList() {
    const el = $("#coachList");
    if (!coachOn) {
      el.innerHTML = `<div class="coach-empty">${icon("lightbulb")}<h4>El coach está apagado</h4><p>Cuando lo enciendas, irá marcando decisiones, acciones, preguntas abiertas y riesgos mientras hablan. No cambia la transcripción.</p><button class="btn btn-primary" id="coachOnBtn">Encender el coach</button><p style="font-size:.82em">Es opcional. Puedes encenderlo en cualquier momento de la reunión.</p></div>`;
      $("#coachOnBtn").addEventListener("click", () => setCoach(true));
      return;
    }
    const vis = cards.map((c, i) => [c, i]).filter(([c]) => !c.gone);
    if (!vis.length) {
      el.innerHTML = `<div class="coach-empty">${icon("ear")}<h4>Escuchando</h4><p>Los insights aparecerán aquí a medida que avance la reunión.${coachSince !== null ? " Activado a las " + fmt(coachSince) + "." : ""}</p></div>`;
      return;
    }
    vis.sort((a, b) => (b[0].pinned ? 1 : 0) - (a[0].pinned ? 1 : 0) || b[1] - a[1]);
    el.innerHTML = vis.map(([c, i]) => cardHTML(c, i)).join("");
    cards.forEach((c) => (c.fresh = false));
  }
  function pushCard(c, t) {
    cards.push({ ...c, t, pinned: false, gone: false, fresh: true });
    coachCount = cards.filter((x) => !x.gone).length;
    renderCoachStatus(); renderCoachList();
  }
  function setCoach(v) {
    coachOn = v; store.set("mp-coach", v);
    if (v) { coachSince = elapsed; dockOpen = true; dockTab = "coach"; MP.toast("Coach encendido. Verás insights desde ahora."); }
    else MP.toast("Coach apagado. La transcripción y el audio siguen igual.");
    renderDock();
  }
  coachChip.addEventListener("click", (e) => { e.preventDefault(); setCoach(!coachOn); });
  chatChip.addEventListener("click", () => {
    if (dockOpen && dockTab === "chat") dockOpen = false; else { dockOpen = true; dockTab = "chat"; }
    store.set("mp-chat", dockOpen && dockTab === "chat"); renderDock();
  });
  $("#tabCoach").addEventListener("click", () => { dockTab = "coach"; renderDock(); });
  $("#tabChat").addEventListener("click", () => { dockTab = "chat"; renderDock(); });
  $("#dockClose").addEventListener("click", () => { dockOpen = false; renderDock(); });
  $("#coachList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const i = Number(b.closest(".c-card").dataset.i), c = cards[i];
    if (b.dataset.act === "dismiss") { c.gone = true; coachCount = cards.filter((x) => !x.gone).length; }
    if (b.dataset.act === "pin") c.pinned = !c.pinned;
    if (b.dataset.act === "add") MP.toast("Añadida a las acciones de la reunión.");
    renderCoachStatus(); renderCoachList();
  });
  // Saltar al momento en la transcripción en vivo
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-live-seek]"); if (!b) return;
    const lines = [...list.querySelectorAll(".line")];
    const t = Number(b.dataset.liveSeek);
    const target = lines.filter((l) => Number(l.dataset.t) <= t).pop() || lines[0];
    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    target.classList.remove("is-flash"); void target.offsetWidth; target.classList.add("is-flash");
  });

  /* ---------- Chat opcional ---------- */
  MP.initChat({
    list: $("#liveChatList"), form: $("#liveChatForm"), input: $("#liveChatInput"), suggest: $("#liveSuggest"),
    empty: true, replies: CHAT_REPLIES, emptyText: "Responde con lo dicho hasta ahora en la reunión.",
    suggestions: ["Resume lo que llevamos", "¿Qué quedó pendiente?", "¿Qué acciones hay hasta ahora?"],
  });

  /* ---------- Arranque ---------- */
  try {
    $("#liveTitle").value = sessionStorage.getItem("mp-live-title") || "";
  } catch (e) {}
  $("#liveTitle").addEventListener("input", (e) => { try { sessionStorage.setItem("mp-live-title", e.target.value); } catch (x) {} });
  renderDock();
  paintStt();
  setTimeout(nextLine, 1400);
})();
