/* Shell de Quiet Studio v2: menú lateral, paleta de comandos (Ctrl+K) y asistente global (Ctrl+J).
   El asistente es un único componente que se monta como panel lateral, panel de reunión o página.
   La búsqueda en el índice local es simulada: la lógica real queda para la próxima funcionalidad. */
(function () {
  const MP = window.MP;
  const D = MP.data;
  const { $, $$, icon, esc } = MP;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.body.setAttribute("data-palette", "");

  const store = {
    get(k, d) { try { const v = sessionStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  /* ---------- Menú lateral ---------- */
  const rail = $(".rail");
  const current = (rail && rail.dataset.current) || "";
  if (rail) {
    const item = (id, label, ic, href) => {
      const sel = current === id ? ' aria-selected="true"' : "";
      return href
        ? `<a class="icon-btn" href="${href}" title="${label}" aria-label="${label}"${sel}>${icon(ic)}</a>`
        : `<button class="icon-btn" data-rail="${id}" title="${label}" aria-label="${label}"${sel}>${icon(ic)}</button>`;
    };
    rail.innerHTML = `<span class="logo-slot" title="Logo provisional"><i class="ph-fill ph-waveform"></i></span>
      ${item("home", "Inicio", "house", "home.html")}
      ${item("library", "Biblioteca", "books", "library.html")}
      ${current === "ask" ? item("ask", "Preguntar", "sparkle", "ask.html") : item("ask", "Preguntar (Ctrl+J)", "sparkle")}
      ${item("search", "Buscar (Ctrl+K)", "magnifying-glass")}
      ${item("live", "Grabar en vivo", "microphone", "live.html")}
      <span class="spacer"></span>
      <button class="icon-btn" data-theme-toggle></button>
      ${item("settings", "Ajustes", "gear-six", "settings.html")}`;
  }

  /* ---------- Asistente ---------- */
  function createAssistant(root, opts) {
    opts = Object.assign({ mode: "drawer", meeting: false }, opts);
    const scopes = D.scopes.filter((s) => s.id !== "meeting" || opts.meeting);
    // En una reunión abierta, el asistente empieza acotado a ella
    let scope = opts.meeting ? "meeting" : store.get("mp-scope", "all");
    if (!scopes.some((s) => s.id === scope)) scope = scopes[0].id;
    let log = store.get("mp-ask-log", []);
    let busy = false;

    root.innerHTML = `<div class="asst asst-${opts.mode}">
      <header class="asst-head">
        <div class="asst-ti"><b>Preguntar</b><span class="asst-index" title="${D.index.fragments} fragmentos, actualizado ${D.index.updated}"><i class="dot"></i>Índice al día, ${D.index.meetings} reuniones</span></div>
        <div class="asst-act">
          <div class="pop-wrap"><button class="icon-btn" data-hist title="Historial" aria-label="Historial" aria-haspopup="true">${icon("clock-counter-clockwise")}</button><div class="asst-pop hist-pop" hidden></div></div>
          <button class="icon-btn" data-new title="Nueva conversación" aria-label="Nueva conversación">${icon("note-pencil")}</button>
          ${opts.mode !== "page" ? `<a class="icon-btn" href="ask.html" title="Abrir en pantalla completa" aria-label="Abrir en pantalla completa">${icon("arrows-out-simple")}</a>` : ""}
          ${opts.mode === "drawer" ? `<button class="icon-btn" data-close title="Cerrar (Esc)" aria-label="Cerrar">${icon("x")}</button>` : ""}
        </div>
      </header>
      <div class="asst-scope"><div class="pop-wrap"><button class="scope-btn" aria-haspopup="listbox" aria-expanded="false"></button><div class="asst-pop scope-pop" role="listbox" hidden></div></div><span class="scope-hint"></span></div>
      <div class="asst-list scroll" aria-live="polite"></div>
      <div class="asst-bottom">
        <div class="suggest-row"></div>
        <form class="composer">
          <textarea rows="1" placeholder="Pregunta sobre tus reuniones" aria-label="Mensaje"></textarea>
          <div class="composer-bar"><div data-model-picker data-slot="chat" data-placement="top"></div><span class="hint asst-priv"></span><button class="send" type="submit" aria-label="Enviar">${icon("arrow-up", true)}</button></div>
        </form>
      </div></div>`;

    const q$ = (s) => $(s, root);
    const list = q$(".asst-list"), sug = q$(".suggest-row"), form = q$("form"), input = q$("textarea"), send = q$(".send");
    const scopeBtn = q$(".scope-btn"), scopePop = q$(".scope-pop"), histPop = q$(".hist-pop");
    const S = () => scopes.find((s) => s.id === scope);
    const scrollDown = () => list.scrollTo({ top: list.scrollHeight, behavior: reduce ? "auto" : "smooth" });

    const paintScope = () => {
      scopeBtn.innerHTML = `${icon(S().icon)}<span>${esc(S().name)}</span>${icon("caret-down")}`;
      q$(".scope-hint").textContent = S().desc;
      scopePop.innerHTML = scopes.map((s) => `<button role="option" class="scope-row${s.id === scope ? " is-on" : ""}" data-id="${s.id}" aria-selected="${s.id === scope}"><span class="mr-ico">${icon(s.icon)}</span><span class="mr-main"><b class="mr-name">${esc(s.name)}</b><span class="mr-meta">${esc(s.desc)}</span></span>${s.id === scope ? icon("check") : ""}</button>`).join("");
      sug.innerHTML = (D.askSuggestions[scope] || D.askSuggestions.all).map((t) => `<button type="button" class="suggest">${esc(t)}</button>`).join("");
    };
    const paintPriv = () => {
      const m = MP.models.cur("chat");
      q$(".asst-priv").innerHTML = m.kind === "local" ? `${icon("shield-check", true)}Se procesa en tu equipo` : `${icon("cloud-arrow-up")}Los fragmentos se envían a ${esc(m.provider)}`;
    };
    const emptyHTML = () => `<div class="chat-empty">${icon("sparkle")}<h4>Pregunta lo que quieras</h4><p>Busco en ${esc(S().name.toLowerCase())} y respondo con las fuentes.</p></div>`;

    const sourcesHTML = (srcs) => !srcs || !srcs.length ? "" :
      `<div class="srcs"><p class="srcs-t">${icon("quotes")}Fuentes<span>${srcs.length} fragmentos</span></p>${srcs.map((s, i) => {
        const m = D.sources[s.id];
        const href = s.id === "m1" ? `meeting.html#t=${s.t}` : "#";
        return `<a class="srcard" href="${href}"${s.id === "m1" ? "" : " data-demo-src"}><span class="src-n">${i + 1}</span><span class="src-b"><b>${esc(m.title)}</b><span class="src-m">${esc(m.date)}, ${esc(m.client)}, ${MP.fmt(s.t)}</span><q>${esc(s.quote)}</q></span></a>`;
      }).join("")}</div>`;
    const metaHTML = (extra) => {
      const m = MP.models.cur("chat");
      return `<div class="msg-meta"><span>${esc(m.name)}</span><span class="mc-tag" data-kind="${m.kind}">${m.kind === "local" ? "Local" : "Nube"}</span>${extra ? `<span class="mc-tag" data-kind="local">${extra}</span>` : ""}<button class="icon-btn" data-copy title="Copiar respuesta" aria-label="Copiar respuesta">${icon("copy")}</button></div>`;
    };
    const aiHTML = (e) => `<div class="msg msg-ai"><span class="msg-avatar">${icon("sparkle", true)}</span><div class="msg-col"><div class="msg-body">${MP.citeHTML(e.text)}</div>${e.action ? `<button class="btn btn-sm" data-widen>${icon("books")}Buscar en todas mis reuniones</button>` : ""}${sourcesHTML(e.sources)}${metaHTML(e.sources && e.sources.length ? "Búsqueda local" : "")}</div></div>`;

    function renderLog() {
      list.innerHTML = "";
      if (!log.length) { list.innerHTML = emptyHTML(); sug.hidden = false; return; }
      sug.hidden = true;
      list.insertAdjacentHTML("beforeend", log.map((e) => e.role === "user" ? `<div class="msg msg-user"><div class="msg-body">${esc(e.text)}</div></div>` : e.role === "sys" ? `<div class="asst-div"><span>${esc(e.text)}</span></div>` : aiHTML(e)).join(""));
      list.scrollTop = list.scrollHeight;
    }
    const save = () => store.set("mp-ask-log", log.slice(-40));

    function find(q) {
      const ql = q.toLowerCase();
      if (scope === "meeting") {
        const R = D.replies, k = Object.keys(R).find((x) => x !== "_" && ql.includes(x));
        return { found: true, text: R[k || "_"], sources: [] };
      }
      const hit = D.askReplies.find((r) => r.keys.some((k) => ql.includes(k)));
      if (hit && hit.scopes.includes(scope)) return { found: true, text: hit.text, sources: hit.sources };
      return hit
        ? { found: false, action: true, text: `No encontré eso en ${S().name}, pero sí aparece en otras reuniones. ¿Amplío la búsqueda?` }
        : { found: false, text: `No encontré nada sobre eso en ${S().name}. Prueba con otras palabras o amplía el alcance.` };
    }

    function ask(q) {
      q = (q || "").trim();
      if (!q || busy) return;
      busy = true;
      list.querySelector(".chat-empty")?.remove();
      sug.hidden = true;
      list.insertAdjacentHTML("beforeend", `<div class="msg msg-user"><div class="msg-body">${esc(q)}</div></div>`);
      log.push({ role: "user", text: q });
      input.value = ""; input.style.height = ""; send.disabled = true;
      const res = find(q);
      list.insertAdjacentHTML("beforeend", `<div class="msg msg-ai"><span class="msg-avatar">${icon("sparkle", true)}</span><div class="msg-col"><div class="msg-body"></div></div></div>`);
      const node = list.lastElementChild, body = $(".msg-body", node), col = $(".msg-col", node);
      scrollDown();
      const finish = () => {
        node.outerHTML = aiHTML(res);
        log.push({ role: "ai", text: res.text, sources: res.sources, action: res.action });
        save(); busy = false; scrollDown();
      };
      const stream = () => {
        const toks = res.text.split(/(\[\d{1,2}:\d{2}\])/).flatMap((p) => (/^\[/.test(p) ? [p] : p.split(/(\s+)/))).filter(Boolean);
        let i = 0;
        const iv = setInterval(() => {
          i = Math.min(toks.length, i + 2);
          body.innerHTML = MP.citeHTML(toks.slice(0, i).join("")) + (i < toks.length ? '<span class="caret"></span>' : "");
          scrollDown();
          if (i >= toks.length) { clearInterval(iv); finish(); }
        }, reduce ? 0 : 36);
      };
      if (scope === "meeting") {
        body.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';
        setTimeout(stream, reduce ? 0 : 650);
        return;
      }
      // Pasos de la búsqueda local
      const steps = [`Buscando en ${S().name.toLowerCase()}`, res.found ? `Leyendo ${res.sources.length} fragmentos relevantes` : "Sin coincidencias claras", res.found ? "Redactando la respuesta" : ""].filter(Boolean);
      body.innerHTML = '<ul class="rsteps"></ul>';
      const ul = $(".rsteps", body);
      steps.forEach((t, k) => setTimeout(() => {
        ul.querySelectorAll("li:not(.is-done)").forEach((li) => { li.classList.add("is-done"); li.querySelector("i").className = "ph ph-check"; });
        ul.insertAdjacentHTML("beforeend", `<li><i class="ph ph-circle-notch spin"></i>${esc(t)}</li>`);
        scrollDown();
        if (k === steps.length - 1) setTimeout(() => { body.textContent = ""; stream(); }, reduce ? 0 : 650);
      }, reduce ? 0 : k * 650));
      void col;
    }

    function setScope(id, silent) {
      if (id === scope) return;
      scope = id; store.set("mp-scope", scope);
      if (!silent && log.length) { log.push({ role: "sys", text: "Ahora busco en: " + S().name }); save(); }
      paintScope(); renderLog();
    }

    /* Eventos */
    form.addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });
    input.addEventListener("input", () => { send.disabled = !input.value.trim(); input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 140) + "px"; });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    sug.addEventListener("click", (e) => { const b = e.target.closest(".suggest"); if (b) ask(b.textContent); });
    list.addEventListener("click", (e) => {
      if (e.target.closest("[data-widen]")) { setScope("all"); const last = log.filter((x) => x.role === "user").pop(); if (last) setTimeout(() => ask(last.text), 80); }
      const c = e.target.closest("[data-copy]");
      if (c) { try { navigator.clipboard.writeText($(".msg-body", c.closest(".msg")).textContent); } catch (x) {} MP.toast("Respuesta copiada."); }
      const d = e.target.closest("[data-demo-src]");
      if (d) { e.preventDefault(); MP.toast("En el demo solo la primera reunión tiene detalle."); }
    });
    const closePops = () => { scopePop.hidden = true; histPop.hidden = true; scopeBtn.setAttribute("aria-expanded", "false"); };
    scopeBtn.addEventListener("click", (e) => { e.stopPropagation(); const open = scopePop.hidden; closePops(); scopePop.hidden = !open; scopeBtn.setAttribute("aria-expanded", String(open)); });
    scopePop.addEventListener("click", (e) => { const r = e.target.closest(".scope-row"); if (r) { setScope(r.dataset.id); closePops(); } });
    q$("[data-hist]").addEventListener("click", (e) => {
      e.stopPropagation(); const open = histPop.hidden; closePops();
      histPop.innerHTML = `<p class="mp-group-title">Conversaciones recientes</p>` + D.history.map((h) => `<button class="scope-row" data-h><span class="mr-main"><b class="mr-name">${esc(h.title)}</b><span class="mr-meta">${esc(h.when)}</span></span></button>`).join("");
      histPop.hidden = !open;
    });
    histPop.addEventListener("click", (e) => { if (e.target.closest("[data-h]")) { closePops(); MP.toast("Demo: aquí se abriría la conversación."); } });
    root.addEventListener("click", (e) => { if (!e.target.closest(".pop-wrap")) closePops(); });
    q$("[data-new]").addEventListener("click", () => { log = []; save(); renderLog(); input.focus(); });
    document.addEventListener("mp:models", paintPriv);

    paintScope(); paintPriv(); renderLog(); send.disabled = true;
    return { ask, setScope, focus: () => input.focus(), root, get scope() { return scope; } };
  }
  MP.createAssistant = createAssistant;

  /* Montaje según la página */
  const paneMount = $("[data-assistant-pane]");
  const pageMount = $("[data-assistant-page]");
  let inst = null, drawer = null;
  if (pageMount) {
    inst = createAssistant(pageMount, { mode: "page" });
  } else if (paneMount) {
    inst = createAssistant(paneMount, { mode: "pane", meeting: true });
  } else {
    drawer = document.createElement("aside");
    drawer.className = "ask-drawer";
    drawer.setAttribute("aria-label", "Asistente");
    drawer.hidden = true;
    document.body.appendChild(drawer);
    inst = createAssistant(drawer, { mode: "drawer" });
  }
  MP.assistant = inst;

  function setDrawer(open) {
    if (!drawer) return;
    drawer.hidden = !open;
    document.body.classList.toggle("has-drawer", open);
    $$('[data-rail="ask"]').forEach((b) => b.setAttribute("aria-selected", String(open)));
    if (open) setTimeout(() => inst.focus(), 30);
  }
  MP.openAsk = function (q) {
    if (drawer) setDrawer(true);
    else if (paneMount) { const p = $(".panes"); if (p) p.dataset.chat = "on"; const sh = $(".shell"); if (sh) sh.dataset.pane = "chat"; $$("[data-pane-btn]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.paneBtn === "chat"))); }
    if (q) setTimeout(() => inst.ask(q), 120); else inst.focus();
  };
  MP.toggleAsk = function () {
    if (drawer) setDrawer(drawer.hidden);
    else if (paneMount) { const p = $(".panes"); if (p) { const on = p.dataset.chat === "on"; p.dataset.chat = on ? "off" : "on"; const t = $("[data-chat-toggle]"); if (t) t.setAttribute("aria-pressed", String(!on)); } if (p && p.dataset.chat === "on") inst.focus(); }
    else inst.focus();
  };
  if (drawer) drawer.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) setDrawer(false); });
  $$('[data-rail="ask"]').forEach((b) => b.addEventListener("click", () => MP.toggleAsk()));
  $$('[data-rail="search"]').forEach((b) => b.addEventListener("click", () => openPalette()));
  $$("[data-open-palette]").forEach((b) => b.addEventListener("click", () => openPalette()));
  $$("[data-open-ask]").forEach((b) => b.addEventListener("click", () => MP.openAsk()));

  /* ---------- Paleta de comandos ---------- */
  let palette = null;
  function openPalette() {
    if (palette) return;
    palette = document.createElement("div");
    palette.className = "modal-back pal-back";
    palette.innerHTML = `<div class="palette" role="dialog" aria-modal="true" aria-label="Buscar y ejecutar">
      <label class="pal-in">${icon("magnifying-glass")}<input type="text" placeholder="Busca reuniones, acciones o ajustes, o pregunta algo" autocomplete="off" aria-label="Buscar"><kbd>Esc</kbd></label>
      <div class="pal-list scroll" role="listbox"></div>
      <div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd>navegar</span><span><kbd>Enter</kbd>abrir</span><span class="r">Las preguntas buscan en tu índice local</span></div></div>`;
    document.body.appendChild(palette);
    const inp = $("input", palette), listEl = $(".pal-list", palette);
    let items = [], sel = 0;
    const go = (u) => { location.href = u; };
    const NAV = [
      { ic: "house", t: "Inicio", h: "Ir a", run: () => go("home.html") },
      { ic: "books", t: "Biblioteca", h: "Ir a", run: () => go("library.html") },
      { ic: "sparkle", t: "Preguntar", h: "Ir a", run: () => go("ask.html") },
      { ic: "microphone", t: "Grabar en vivo", h: "Comando", run: () => go("live.html") },
      { ic: "list-checks", t: "Mis acciones pendientes", h: "Ir a", run: () => go("library.html?tab=actions") },
      { ic: "cpu", t: "Modelos de IA y API keys", h: "Ajustes", run: () => go("settings.html?tab=models") },
      { ic: "text-align-left", t: "Motor de transcripción", h: "Ajustes", run: () => go("settings.html?tab=transcription") },
      { ic: "lightbulb", t: "Coach y chat", h: "Ajustes", run: () => go("settings.html?tab=coach") },
      { ic: "shield-check", t: "Datos, privacidad e índice", h: "Ajustes", run: () => go("settings.html?tab=privacy") },
      { ic: "circle-half", t: "Cambiar tema", h: "Comando", run: () => { const o = ["system", "light", "dark"]; MP.setTheme(o[(o.indexOf(MP.getTheme()) + 1) % 3]); close(); } },
    ];
    const build = (q) => {
      const ql = q.trim().toLowerCase();
      const has = (s) => !ql || s.toLowerCase().includes(ql);
      const groups = [];
      const ask = ql.length > 2 ? [{ ic: "sparkle", t: `Preguntar: “${q.trim()}”`, h: "Asistente", ask: true, run: () => { close(); MP.openAsk(q.trim()); } }] : [];
      const question = /\?$/.test(q.trim()) || q.trim().split(/\s+/).length > 3;
      if (question && ask.length) groups.push(["Preguntar", ask]);
      const meet = D.recent.filter((r) => has(r.title + " " + r.client + " " + r.project + " " + (r.tags || []).join(" "))).slice(0, ql ? 5 : 4)
        .map((r) => ({ ic: "notebook", t: r.title, h: r.client + ", " + r.date, run: () => (r.id === "m1" ? go("meeting.html") : (close(), MP.toast("En el demo solo la primera reunión tiene detalle."))) }));
      if (meet.length) groups.push([ql ? "Reuniones" : "Reuniones recientes", meet]);
      if (ql) {
        const acts = D.allActions.filter((a) => !a.done && has(a.text + " " + a.owner)).slice(0, 4).map((a) => ({ ic: "list-checks", t: a.text, h: a.owner + ", " + a.due, run: () => go("library.html?tab=actions") }));
        if (acts.length) groups.push(["Acciones", acts]);
      }
      const nav = NAV.filter((n) => has(n.t + " " + n.h)).slice(0, ql ? 6 : 6);
      if (nav.length) groups.push([ql ? "Ir a y ajustes" : "Atajos", nav]);
      if (!question && ask.length) groups.push(["Preguntar", ask]);
      return groups;
    };
    const paint = () => {
      const groups = build(inp.value);
      items = groups.flatMap(([, g]) => g);
      sel = Math.min(sel, Math.max(0, items.length - 1));
      let n = 0;
      listEl.innerHTML = groups.length ? groups.map(([g, arr]) => `<p class="pal-g">${g}</p>` + arr.map((it) => { const i = n++; return `<button class="pal-row${i === sel ? " is-sel" : ""}" role="option" data-i="${i}"><span class="mr-ico${it.ask ? " is-ask" : ""}">${icon(it.ic)}</span><span class="pal-t">${esc(it.t)}</span><span class="pal-h">${esc(it.h)}</span></button>`; }).join("")).join("") : `<div class="mp-empty">${icon("magnifying-glass")}<p>No encontré nada. Prueba preguntándole al asistente.</p></div>`;
      const s = $(".is-sel", listEl); if (s) s.scrollIntoView({ block: "nearest" });
    };
    function close() { if (!palette) return; palette.remove(); palette = null; removeEventListener("keydown", onKey, true); }
    function onKey(e) {
      if (!palette) return;
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); paint(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); paint(); }
      else if (e.key === "Enter") { e.preventDefault(); const it = items[sel]; if (it) it.run(); }
    }
    addEventListener("keydown", onKey, true);
    inp.addEventListener("input", () => { sel = 0; paint(); });
    listEl.addEventListener("click", (e) => { const r = e.target.closest(".pal-row"); if (r) items[Number(r.dataset.i)].run(); });
    listEl.addEventListener("mousemove", (e) => { const r = e.target.closest(".pal-row"); if (r && Number(r.dataset.i) !== sel) { sel = Number(r.dataset.i); $$(".pal-row", listEl).forEach((x) => x.classList.toggle("is-sel", x === r)); } });
    palette.addEventListener("mousedown", (e) => { if (e.target === palette) close(); });
    paint(); inp.focus();
  }
  MP.openPalette = openPalette;

  addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); }
    if (mod && e.key.toLowerCase() === "j") { e.preventDefault(); MP.toggleAsk(); }
    if (e.key === "Escape" && drawer && !drawer.hidden && !document.querySelector(".pal-back")) setDrawer(false);
  });

  // ?ask=texto abre el asistente con una pregunta (útil para demostrar)
  const qa = new URLSearchParams(location.search).get("ask");
  if (qa) setTimeout(() => MP.openAsk(qa), 700);
  if (new URLSearchParams(location.search).has("palette")) setTimeout(openPalette, 500);

  /* Menús desplegables: <div class="menu-wrap" data-menu><button data-menu-btn>..</button><div class="menu" hidden>..</div></div> */
  $$("[data-menu]").forEach((w) => {
    const btn = $("[data-menu-btn]", w), menu = $(".menu", w);
    btn.addEventListener("click", (e) => { e.stopPropagation(); const open = menu.hidden; $$(".menu").forEach((m) => (m.hidden = true)); menu.hidden = !open; btn.setAttribute("aria-expanded", String(open)); });
    menu.addEventListener("click", () => { menu.hidden = true; });
  });
  document.addEventListener("click", () => $$(".menu").forEach((m) => (m.hidden = true)));
})();
