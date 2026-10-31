/* Lógica compartida de los demos: renderizado con mock data e interacciones.
   Cada dirección aporta su propio HTML/CSS; aquí solo hay estructura y comportamiento. */
(function () {
  const MP = window.MP;
  const D = MP.data;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fmt = (t) => String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(Math.floor(t % 60)).padStart(2, "0");
  const toSec = (s) => { const [m, x] = s.split(":").map(Number); return m * 60 + x; };
  const icon = (n, fill) => `<i class="ph${fill ? "-fill" : ""} ph-${n}" aria-hidden="true"></i>`;
  Object.assign(MP, { $, $$, esc, fmt, icon });

  /* ---------- Tema: sistema, claro, oscuro ---------- */
  MP.getTheme = () => document.documentElement.dataset.theme || "system";
  MP.setTheme = function (m) {
    if (m === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = m;
    try { localStorage.setItem("mp-theme", m); } catch (e) {}
    document.dispatchEvent(new CustomEvent("mp:theme"));
  };
  MP.initTheme = function () {
    const order = ["system", "light", "dark"];
    const names = { system: "Sistema", light: "Claro", dark: "Oscuro" };
    const icons = { system: "circle-half", light: "sun", dark: "moon" };
    const btn = $("[data-theme-toggle]");
    const paint = () => {
      const m = MP.getTheme();
      if (btn) {
        btn.innerHTML = icon(icons[m]) + (btn.dataset.label !== undefined ? `<span>${names[m]}</span>` : "");
        btn.title = "Tema: " + names[m];
        btn.setAttribute("aria-label", "Tema: " + names[m] + ". Cambiar");
      }
      $$('[data-seg="theme"] [data-value]').forEach((b) => b.setAttribute("aria-checked", String(b.dataset.value === m)));
    };
    if (btn) btn.addEventListener("click", () => MP.setTheme(order[(order.indexOf(MP.getTheme()) + 1) % order.length]));
    document.addEventListener("mp:theme", paint);
    $$('[data-seg="theme"] [data-value]').forEach((b) => b.addEventListener("click", () => MP.setTheme(b.dataset.value)));
    paint();
  };

  /* Controles segmentados genéricos (excepto el de tema) y navegación de demo */
  MP.initControls = function () {
    $$("[data-seg]").forEach((g) => {
      if (g.dataset.seg === "theme") return;
      $$("[data-value]", g).forEach((b) => b.addEventListener("click", () => {
        $$("[data-value]", g).forEach((x) => x.setAttribute("aria-checked", String(x === b)));
        g.dispatchEvent(new CustomEvent("mp:seg", { detail: b.dataset.value, bubbles: true }));
      }));
    });
    $$("[data-goto]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); location.href = b.dataset.goto; }));
  };

  /* ---------- Toast ---------- */
  let toastTimer;
  MP.toast = function (msg) {
    let el = $(".toast");
    if (!el) { el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-on"), 2600);
  };

  /* ---------- Pestañas ---------- */
  MP.initTabs = function () {
    $$("[data-tabs]").forEach((root) => {
      const btns = $$("[data-tab]", root);
      const show = (name) => {
        btns.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
        $$("[data-tab-panel]", root).forEach((p) => (p.hidden = p.dataset.tabPanel !== name));
        root.dataset.current = name;
      };
      btns.forEach((b) => b.addEventListener("click", () => show(b.dataset.tab)));
      MP["showTab_" + (root.dataset.tabs || "main")] = show;
      const q = new URLSearchParams(location.search).get("tab");
      show(q && btns.some((b) => b.dataset.tab === q) ? q : root.dataset.initial || btns[0].dataset.tab);
    });
    // Cambio de panel en pantallas angostas
    $$("[data-pane-btn]").forEach((b) =>
      b.addEventListener("click", () => {
        const shell = $(".shell");
        shell.dataset.pane = b.dataset.paneBtn;
        $$("[data-pane-btn]").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
      })
    );
  };

  /* ---------- Transcripción ---------- */
  const whoLabel = (w) => (w === "you" ? "Tú" : "Participantes");
  const marks = () => {
    const m = {};
    D.decisions.forEach((d) => (m[d.t] = "decision"));
    D.actions.forEach((a) => (m[a.t] = m[a.t] || "action"));
    D.questions.forEach((q) => { if (!q.risk) m[q.t] = m[q.t] || "question"; });
    return m;
  };
  const MARK_LABEL = { decision: ["check-circle", "Decisión"], action: ["list-checks", "Acción"], question: ["question", "Pregunta"] };

  function lineHTML(turn, mode, mark) {
    const tag = mark ? `<span class="mark-tag mark-${mark}">${icon(MARK_LABEL[mark][0])}${MARK_LABEL[mark][1]}</span>` : "";
    const time = `<button class="time" data-seek="${turn.t}" title="Reproducir desde ${fmt(turn.t)}">${fmt(turn.t)}</button>`;
    const text = `<p class="text" data-raw="${esc(turn.text)}" data-tag="${esc(tag)}">${esc(turn.text)}${tag}</p>`;
    if (mode === "rows")
      return `<div class="row line" data-who="${turn.who}" data-t="${turn.t}" id="l-${turn.t}">${time}<span class="who">${turn.who === "you" ? "TÚ" : "PART."}</span>${text}</div>`;
    return `<div class="line" data-t="${turn.t}" id="l-${turn.t}">${time}${text}</div>`;
  }

  MP.appendLine = function (el, turn, mode, extraClass) {
    const mk = marks()[turn.t];
    if (mode === "rows") {
      el.insertAdjacentHTML("beforeend", lineHTML(turn, mode, mk));
      if (extraClass) el.lastElementChild.classList.add(extraClass);
      return;
    }
    let g = el.lastElementChild;
    if (!g || !g.classList.contains("group") || g.dataset.who !== turn.who) {
      const src = turn.who === "you" ? icon("microphone") + "Micrófono" : icon("speaker-high") + "Audio del sistema";
      el.insertAdjacentHTML(
        "beforeend",
        `<div class="group" data-who="${turn.who}"><div class="group-head"><span class="avatar">${turn.who === "you" ? "VJ" : icon("users")}</span><span class="who">${whoLabel(turn.who)}</span><span class="src">${src}</span></div><div class="lines"></div></div>`
      );
      g = el.lastElementChild;
    }
    $(".lines", g).insertAdjacentHTML("beforeend", lineHTML(turn, mode, mk));
    if (extraClass) $(".lines", g).lastElementChild.classList.add(extraClass);
  };

  MP.renderTranscript = function (el, mode) {
    mode = mode || el.dataset.mode || "grouped";
    el.dataset.mode = mode;
    el.innerHTML = "";
    D.turns.forEach((t) => MP.appendLine(el, t, mode));
  };

  MP.initSearch = function (input) {
    const list = $("[data-transcript]");
    const count = $("[data-search-count]");
    if (!input || !list) return;
    const run = () => {
      const q = input.value.trim().toLowerCase();
      let hits = 0;
      $$(".line", list).forEach((l) => {
        const p = $(".text", l);
        const raw = p.dataset.raw;
        const tag = p.dataset.tag;
        const match = !q || raw.toLowerCase().includes(q);
        l.hidden = !match;
        if (q && match) {
          hits++;
          const i = raw.toLowerCase().indexOf(q);
          p.innerHTML = esc(raw.slice(0, i)) + "<mark>" + esc(raw.slice(i, i + q.length)) + "</mark>" + esc(raw.slice(i + q.length)) + tag;
        } else p.innerHTML = raw.replace(/&/g, "&amp;").replace(/</g, "&lt;") + tag;
      });
      $$(".group", list).forEach((g) => (g.hidden = !$$(".line:not([hidden])", g).length));
      if (count) count.textContent = q ? (hits === 1 ? "1 resultado" : hits + " resultados") : "";
      let empty = $(".search-empty", list.parentElement);
      if (q && !hits) {
        if (!empty) { empty = document.createElement("div"); empty.className = "search-empty"; list.after(empty); }
        empty.innerHTML = `${icon("magnifying-glass")}<p>Nada coincide con “${esc(input.value)}”.</p>`;
      } else if (empty) empty.remove();
    };
    input.addEventListener("input", run);
    addEventListener("keydown", (e) => {
      if (document.body.hasAttribute("data-palette")) {
        const a = document.activeElement, typing = a && (/INPUT|TEXTAREA|SELECT/.test(a.tagName) || a.isContentEditable);
        if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey) { e.preventDefault(); input.focus(); }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); input.focus(); input.select(); }
      if (e.key === "Escape" && document.activeElement === input) { input.value = ""; run(); input.blur(); }
    });
  };

  /* Tamaño de lectura */
  MP.initFontSize = function () {
    let step = 0;
    $$("[data-font]").forEach((b) =>
      b.addEventListener("click", () => {
        step = Math.max(-1, Math.min(3, step + Number(b.dataset.font)));
        document.documentElement.style.setProperty("--fs-read-step", step);
      })
    );
  };

  /* ---------- Reproductor y onda ---------- */
  const P = (MP.player = { t: 0, playing: false, speed: 1, timer: null });
  const dur = () => D.meeting.dur;

  MP.renderWave = function (el, n) {
    n = n || 110;
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let who = "others", left = 0, html = "";
    for (let i = 0; i < n; i++) {
      if (left <= 0) { who = who === "you" ? "others" : "you"; left = 2 + Math.floor(rnd() * 7); }
      left--;
      const quiet = rnd() < 0.12;
      const h = quiet ? 0.1 + rnd() * 0.12 : 0.28 + rnd() * 0.72;
      html += `<span data-who="${who}" style="--h:${h.toFixed(2)}"></span>`;
    }
    el.innerHTML = html;
    el.addEventListener("click", (e) => {
      const r = el.getBoundingClientRect();
      MP.seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur());
    });
  };

  MP.seek = function (t, opts) {
    opts = opts || {};
    P.t = Math.max(0, Math.min(dur(), t));
    paintPlayer();
    const list = $("[data-transcript]");
    if (!list) return;
    const lines = $$(".line", list).filter((l) => !l.hidden);
    let cur = null;
    lines.forEach((l) => { if (Number(l.dataset.t) <= P.t + 0.5) cur = l; });
    $$(".line.is-current", list).forEach((l) => l.classList.remove("is-current"));
    if (cur) {
      cur.classList.add("is-current");
      if (opts.scroll !== false) cur.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
      if (opts.flash) {
        cur.classList.remove("is-flash"); void cur.offsetWidth; cur.classList.add("is-flash");
      }
    }
  };

  function paintPlayer() {
    const pct = (P.t / dur()) * 100;
    $$("[data-player-time]").forEach((e) => (e.textContent = fmt(P.t)));
    $$("[data-player-dur]").forEach((e) => (e.textContent = fmt(dur())));
    $$("[data-player-fill]").forEach((e) => (e.style.width = pct + "%"));
    $$("[data-playhead]").forEach((e) => (e.style.left = pct + "%"));
    $$("[data-wave]").forEach((w) => {
      const kids = w.children, n = kids.length, upto = Math.floor((P.t / dur()) * n);
      for (let i = 0; i < n; i++) kids[i].classList.toggle("is-played", i < upto);
    });
    $$("[data-play]").forEach((b) => { b.innerHTML = icon(P.playing ? "pause" : "play", true); b.setAttribute("aria-label", P.playing ? "Pausar" : "Reproducir"); });
    $$("[data-speed]").forEach((b) => (b.textContent = P.speed + "x"));
  }

  MP.initPlayer = function () {
    $$("[data-wave]").forEach((w) => MP.renderWave(w, Number(w.dataset.wave) || 110));
    $$("[data-play]").forEach((b) =>
      b.addEventListener("click", () => {
        P.playing = !P.playing;
        clearInterval(P.timer);
        if (P.playing) P.timer = setInterval(() => { if (P.t >= dur()) { P.playing = false; clearInterval(P.timer); paintPlayer(); return; } MP.seek(P.t + P.speed * 3, { scroll: true }); }, 1000);
        paintPlayer();
      })
    );
    $$("[data-speed]").forEach((b) => b.addEventListener("click", () => { P.speed = P.speed === 1 ? 1.5 : P.speed === 1.5 ? 2 : 1; paintPlayer(); }));
    paintPlayer();
  };

  // Clic en cualquier [data-seek] (tiempos, citas, chips)
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-seek]");
    if (!b) return;
    if (MP.revealTranscript) MP.revealTranscript();
    requestAnimationFrame(() => MP.seek(Number(b.dataset.seek), { flash: true }));
  });

  /* ---------- Insights ---------- */
  const chip = (t) => `<button class="chip-time" data-seek="${t}" title="Ir a ${fmt(t)} en la transcripción">${fmt(t)}</button>`;

  MP.renderInsights = function (el, opts) {
    opts = opts || {};
    const order = opts.sections || ["summary", "decisions", "actions", "topics", "talk", "questions"];
    const title = (ic, label, extra) => `<h3 class="ins-title">${icon(ic)}<span>${label}</span>${extra || ""}</h3>`;
    const S = {
      summary: () =>
        `<section class="ins ins-summary">${opts.noSummaryTitle ? "" : title("sparkle", "Resumen")}` +
        (opts.summaryAs === "list"
          ? `<ul class="ins-points">${D.summary.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>`
          : `<p class="ins-lead">${D.summary.map(esc).join(" ")}</p>`) +
        `</section>`,
      decisions: () =>
        `<section class="ins ins-decisions">${title("check-circle", "Decisiones", `<span class="count">${D.decisions.length}</span>`)}<ol class="decisions">${D.decisions
          .map((d) => `<li class="decision"><span class="d-text">${esc(d.text)}</span>${chip(d.t)}</li>`)
          .join("")}</ol></section>`,
      actions: () => {
        const done = D.actions.filter((a) => a.done).length;
        return `<section class="ins ins-actions">${title("list-checks", "Acciones", `<span class="count" data-actions-count>${done} de ${D.actions.length}</span>`)}<ul class="actions">${D.actions
          .map(
            (a, i) =>
              `<li class="action${a.done ? " is-done" : ""}"><label class="check"><input type="checkbox" data-action="${i}"${a.done ? " checked" : ""}><span class="box"></span><span class="sr">Marcar como hecha</span></label><div class="a-body"><span class="a-text">${esc(a.text)}</span><span class="a-meta"><span class="owner"><span class="avatar">${a.ini}</span>${esc(a.owner)}</span><span class="due">${icon("calendar-blank")}${a.due}</span></span></div>${chip(a.t)}</li>`
          )
          .join("")}</ul></section>`;
      },
      topics: () =>
        `<section class="ins ins-topics">${title("path", "Temas")}<div class="topic-bar">${D.topics
          .map((t, i) => `<button class="topic-seg" style="--w:${t.to - t.from};--i:${i}" data-seek="${t.from}" title="${esc(t.name)}"></button>`)
          .join("")}</div><ul class="topic-list">${D.topics
          .map((t, i) => `<li><button data-seek="${t.from}" style="--i:${i}"><span class="swatch"></span><span class="t-name">${esc(t.name)}</span><span class="t-range">${fmt(t.from)} a ${fmt(t.to)}</span></button></li>`)
          .join("")}</ul></section>`,
      talk: () => {
        const m = (p) => Math.round((p / 100) * (D.meeting.dur / 60));
        return `<section class="ins ins-talk">${title("chart-bar-horizontal", "Participación")}<div class="talk-bar"><span class="you" style="flex:${D.talk.you}"></span><span class="others" style="flex:${D.talk.others}"></span></div><div class="talk-legend"><span><i class="dot you"></i>Tú <b>${D.talk.you}%</b> <em>${m(D.talk.you)} min</em></span><span><i class="dot others"></i>Participantes <b>${D.talk.others}%</b> <em>${m(D.talk.others)} min</em></span></div></section>`;
      },
      questions: () =>
        `<section class="ins ins-questions">${title("question", "Preguntas abiertas y riesgos")}<ul class="qs">${D.questions
          .map((q) => `<li class="q${q.risk ? " q-risk" : ""}">${icon(q.risk ? "warning" : "question")}<span>${esc(q.text)}</span>${chip(q.t)}</li>`)
          .join("")}</ul></section>`,
    };
    el.innerHTML = order.map((k) => S[k]()).join("");
    $$("[data-action]", el).forEach((c) =>
      c.addEventListener("change", () => {
        D.actions[c.dataset.action].done = c.checked;
        c.closest(".action").classList.toggle("is-done", c.checked);
        const n = D.actions.filter((a) => a.done).length;
        $$("[data-actions-count]").forEach((e) => (e.textContent = n + " de " + D.actions.length));
        $$("[data-actions-stat]").forEach((e) => (e.textContent = n + "/" + D.actions.length));
      })
    );
  };

  /* ---------- Selector de modelo (combobox) ----------
     purpose "analysis" (resumen, chat, coach: texto) o "stt" (transcripción: audio).
     Cada función ("slot") guarda su propia elección y se recuerda entre páginas. */
  const M = (MP.models = { id: "llama32-3b", slots: {}, pickers: [] });
  M.defaults = { stt: "whisper-small", summary: "llama32-3b", chat: "llama32-3b", coach: "llama32-3b", retx: "gemini-stt" };
  try { Object.assign(M.slots, JSON.parse(localStorage.getItem("mp-slots") || "{}")); } catch (e) {}
  try { const qs = new URLSearchParams(location.search); if (qs.get("stt") === "cloud") M.slots.stt = "gemini-stt"; if (qs.get("stt") === "local") delete M.slots.stt; } catch (e) {}
  const saveSlots = () => { try { localStorage.setItem("mp-slots", JSON.stringify(M.slots)); } catch (e) {} };
  const allModels = () => D.models.concat(D.stt || []);
  const byId = (id) => allModels().find((m) => m.id === id);
  const selId = (slot) => (slot && (M.slots[slot] || M.defaults[slot])) || M.id;
  const cur = (slot) => {
    const m = byId(selId(slot));
    return m && m.status !== "key" ? m : byId(M.defaults[slot] || M.id) || byId(M.id);
  };
  M.cur = cur;
  const listFor = (purpose) => (purpose === "stt" ? D.stt : D.models.filter((m) => (m.caps || ["analysis"]).includes("analysis")));
  const privacy = (m, purpose) =>
    purpose === "stt"
      ? m.kind === "local"
        ? `${icon("shield-check", true)}<span>El audio se transcribe en este equipo. No sale de tu PC.</span>`
        : `${icon("cloud-arrow-up")}<span>El <b>audio</b> de la reunión se enviará a <b>${esc(m.provider)}</b> para transcribirlo.</span>`
      : m.kind === "local"
      ? `${icon("shield-check", true)}<span>Se procesa en este equipo. Nada sale de tu PC.</span>`
      : `${icon("cloud-arrow-up")}<span>El texto de la reunión se enviará a <b>${esc(m.provider)}</b>.</span>`;
  const stateHTML = (m, sel) =>
    m.status === "download" ? `<span class="mr-state is-download">${icon("download-simple")}Descargar</span>`
    : m.status === "key" ? `<span class="mr-state is-key">${icon("key")}Falta clave</span>`
    : m.status === "busy" ? `<span class="mr-state is-busy">${esc(m.progress)}</span>`
    : m.id === sel ? `<span class="mr-state is-on">${icon("check")}</span>` : "";

  // Chip de flujo de datos: qué sale del equipo según los motores elegidos
  MP.renderFlow = function () {
    const els = $$("[data-flow]");
    if (!els.length) return;
    const stt = cur("stt");
    const uses = [["Resumen", cur("summary")], ["Chat", cur("chat")], ["Coach", cur("coach")]];
    const cloud = {};
    const add = (prov, what) => ((cloud[prov] = cloud[prov] || new Set()).add(what));
    if (stt.kind === "cloud") add(stt.provider, "audio");
    uses.forEach(([, m]) => { if (m.kind === "cloud") add(m.provider, "texto"); });
    const keys = Object.keys(cloud);
    const tip = ["Transcripción: " + stt.name + (stt.kind === "local" ? " (local)" : " (nube)")]
      .concat(uses.map(([n, m]) => n + ": " + m.name + (m.kind === "local" ? " (local)" : " (nube)"))).join("\n");
    els.forEach((el) => {
      el.classList.toggle("is-cloud", keys.length > 0);
      el.innerHTML = keys.length
        ? `${icon("cloud-arrow-up")}<span>Nube: ${keys.map((k) => `${esc(k)} (${[...cloud[k]].join(" y ")})`).join(", ")}</span>`
        : `${icon("shield-check", true)}<span>Todo local</span>`;
      el.title = tip + "\nClic para cambiar";
    });
  };

  function pickerSync() {
    const m = cur();
    $$("[data-model-name]").forEach((e) => (e.textContent = m.name));
    $$("[data-model-kind]").forEach((e) => { e.textContent = m.kind === "local" ? "Local" : "Nube"; e.dataset.kind = m.kind; });
    $$("[data-model-privacy]").forEach((e) => (e.innerHTML = privacy(m)));
    M.pickers.forEach((p) => p.render());
    MP.renderFlow();
    document.dispatchEvent(new CustomEvent("mp:models"));
  }
  M.sync = pickerSync;
  M.setSlot = function (slot, id) { M.slots[slot] = id; saveSlots(); pickerSync(); };
  // Marca todos los modelos de un proveedor como listos (o con clave faltante)
  M.setProvider = function (provider, ready) {
    allModels().filter((m) => m.provider === provider && m.kind === "cloud").forEach((m) => (m.status = ready ? "ready" : "key"));
    if (!ready) {
      const gone = new Set(allModels().filter((m) => m.provider === provider).map((m) => m.id));
      Object.keys(M.slots).forEach((k) => { if (gone.has(M.slots[k])) delete M.slots[k]; });
      saveSlots();
      if (gone.has(M.id)) M.id = "llama32-3b";
    }
    pickerSync();
  };

  MP.initModelPickers = function () {
    $$("[data-model-picker]").forEach((root) => {
      if (root.dataset.ready) return;
      root.dataset.ready = "1";
      root.classList.add("model-picker");
      const slot = root.dataset.slot || "";
      const purpose = root.dataset.purpose || "analysis";
      root.innerHTML = `<button type="button" class="model-chip" aria-haspopup="dialog" aria-expanded="false"></button>
        <div class="model-pop" role="dialog" aria-label="${purpose === "stt" ? "Elegir motor de transcripción" : "Elegir modelo de IA"}" hidden>
          <label class="mp-search">${icon("magnifying-glass")}<input type="text" placeholder="${purpose === "stt" ? "Buscar motor o modelo" : "Buscar modelo o proveedor"}" autocomplete="off" aria-label="Buscar"></label>
          <div class="mp-list" role="listbox"></div>
          <div class="mp-foot"><p class="mp-privacy"></p><button type="button" class="mp-refresh" title="Actualizar lista" aria-label="Actualizar lista">${icon("arrow-clockwise")}</button></div>
        </div>`;
      const chipBtn = $(".model-chip", root), pop = $(".model-pop", root), input = $("input", root), list = $(".mp-list", root), priv = $(".mp-privacy", root);
      const open = (v) => {
        pop.hidden = !v;
        chipBtn.setAttribute("aria-expanded", String(v));
        if (v) { input.value = ""; render(); priv.innerHTML = privacy(cur(slot), purpose); setTimeout(() => input.focus(), 0); }
      };
      function render() {
        const m = cur(slot), sel = m.id;
        chipBtn.innerHTML = `<span class="mc-ico">${icon(m.kind === "local" ? "cpu" : "cloud")}</span><span class="mc-name">${esc(m.name)}</span><span class="mc-tag" data-kind="${m.kind}">${m.kind === "local" ? "Local" : "Nube"}</span>${icon("caret-up-down")}`;
        if (pop.hidden) return;
        const q = input.value.trim().toLowerCase();
        const groups = [["local", "En tu equipo"], ["cloud", "En la nube"]];
        let html = "";
        groups.forEach(([k, label]) => {
          const items = listFor(purpose).filter((x) => x.kind === k && (!q || (x.name + " " + x.provider).toLowerCase().includes(q)));
          if (!items.length) return;
          html += `<div class="mp-group"><p class="mp-group-title">${label}</p>` +
            items.map((x) => `<button type="button" class="model-row${x.id === sel ? " is-selected" : ""}" role="option" aria-selected="${x.id === sel}" data-id="${x.id}"><span class="mr-ico">${icon(k === "local" ? "cpu" : "cloud")}</span><span class="mr-main"><b class="mr-name">${esc(x.name)}${x.tag ? `<em class="mr-tag">${x.tag}</em>` : ""}</b><span class="mr-meta">${x.provider}${x.size ? ", " + x.size : ""}, ${x.note || x.ctx + " de contexto"}</span></span>${stateHTML(x, sel)}</button>`).join("") + `</div>`;
        });
        list.innerHTML = html || `<div class="mp-empty">${icon("magnifying-glass")}<p>No hay opciones que coincidan.</p></div>`;
      }
      M.pickers.push({ render, root, slot });
      chipBtn.addEventListener("click", () => open(pop.hidden));
      input.addEventListener("input", render);
      list.addEventListener("mouseover", (e) => { const r = e.target.closest(".model-row"); priv.innerHTML = privacy(byId(r ? r.dataset.id : selId(slot)), purpose); });
      list.addEventListener("click", (e) => {
        const r = e.target.closest(".model-row");
        if (!r) return;
        const m = byId(r.dataset.id);
        if (m.status === "key") { MP.toast("Añade la clave de " + m.provider + " en Ajustes para usar esta opción."); return; }
        if (m.status === "busy") return;
        if (m.status === "download") {
          m.status = "busy"; let n = 0; m.progress = "Descargando 0%";
          const iv = setInterval(() => { n += 9 + Math.random() * 12; if (n >= 100) { clearInterval(iv); m.status = "ready"; delete m.progress; MP.toast(m.name + " listo para usar."); } else m.progress = "Descargando " + Math.floor(n) + "%"; pickerSync(); }, 380);
          pickerSync(); return;
        }
        if (slot) { M.slots[slot] = m.id; saveSlots(); } else M.id = m.id;
        pickerSync(); open(false); chipBtn.focus();
        MP.toast((purpose === "stt" ? "Transcripción: " : "Modelo: ") + m.name + (m.kind === "local" ? ", local." : ", en la nube."));
      });
      $(".mp-refresh", root).addEventListener("click", (e) => {
        const b = e.currentTarget; b.classList.add("is-spin"); setTimeout(() => { b.classList.remove("is-spin"); MP.toast("Lista actualizada."); }, 900);
      });
      root.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !pop.hidden) { open(false); chipBtn.focus(); }
        if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !pop.hidden) {
          e.preventDefault();
          const rows = $$(".model-row", root), i = rows.indexOf(document.activeElement);
          const n = e.key === "ArrowDown" ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1);
          (rows[n] || rows[0]).focus();
        }
      });
      document.addEventListener("click", (e) => { if (!root.contains(e.target) && !pop.hidden) open(false); });
      render();
    });
    pickerSync();
  };

  /* ---------- Chat ---------- */
  function citeHTML(text) {
    return text.split(/(\[\d{1,2}:\d{2}\])/).map((p) => {
      const m = p.match(/^\[(\d{1,2}:\d{2})\]$/);
      return m ? `<button class="cite" data-seek="${toSec(m[1])}">${m[1]}</button>` : esc(p).replace(/\n/g, "<br>");
    }).join("");
  }
  MP.citeHTML = citeHTML;
  function metaHTML(ms) {
    const m = cur();
    return `<div class="msg-meta"><span>${esc(m.name)}</span><span class="mc-tag" data-kind="${m.kind}">${m.kind === "local" ? "Local" : "Nube"}</span><span>${ms} s</span><button class="icon-btn" data-copy title="Copiar respuesta" aria-label="Copiar respuesta">${icon("copy")}</button></div>`;
  }
  MP.initChat = function (cfg) {
    const { list, form, input, suggest, clear } = cfg;
    const send = $("button[type=submit]", form);
    const scroll = () => list.scrollTo({ top: list.scrollHeight, behavior: reduce ? "auto" : "smooth" });
    const emptyHTML = `<div class="chat-empty">${icon("chats-circle")}<h4>Pregunta lo que quieras sobre esta reunión</h4><p>${cfg.emptyText || "Las respuestas citan el momento exacto de la transcripción."}</p></div>`;
    const addUser = (t) => { list.querySelector(".chat-empty")?.remove(); list.insertAdjacentHTML("beforeend", `<div class="msg msg-user"><div class="msg-body">${esc(t)}</div></div>`); };
    const aiShell = () => {
      list.insertAdjacentHTML("beforeend", `<div class="msg msg-ai"><span class="msg-avatar">${icon("sparkle", true)}</span><div class="msg-col"><div class="msg-body"></div></div></div>`);
      return list.lastElementChild;
    };
    const R = cfg.replies || D.replies;
    const pick = (q) => { q = q.toLowerCase(); const k = Object.keys(R).find((x) => x !== "_" && q.includes(x)); return R[k || "_"]; };
    function reply(q) {
      const node = aiShell(); const body = $(".msg-body", node);
      body.innerHTML = `<span class="typing" aria-label="Escribiendo"><span></span><span></span><span></span></span>`;
      scroll();
      const full = pick(q);
      const toks = full.split(/(\[\d{1,2}:\d{2}\])/).flatMap((p) => (/^\[/.test(p) ? [p] : p.split(/(\s+)/))).filter(Boolean);
      let i = 0;
      setTimeout(() => {
        body.textContent = "";
        const iv = setInterval(() => {
          i = Math.min(toks.length, i + 2);
          body.innerHTML = citeHTML(toks.slice(0, i).join("")) + (i < toks.length ? '<span class="caret"></span>' : "");
          scroll();
          if (i >= toks.length) { clearInterval(iv); $(".msg-col", node).insertAdjacentHTML("beforeend", metaHTML((0.8 + Math.random() * 1.6).toFixed(1))); suggest && (suggest.hidden = false); scroll(); }
        }, reduce ? 0 : 38);
      }, reduce ? 0 : 750);
    }
    function ask(t) {
      t = t.trim(); if (!t) return;
      addUser(t); input.value = ""; input.style.height = ""; send.disabled = true;
      suggest && (suggest.hidden = true);
      scroll(); reply(t);
    }
    (cfg.empty ? [] : D.chat).forEach((m) => {
      if (m.role === "user") addUser(m.text);
      else { const n = aiShell(); $(".msg-body", n).innerHTML = citeHTML(m.text); $(".msg-col", n).insertAdjacentHTML("beforeend", metaHTML("1,4".replace(",", "."))); }
    });
    if (suggest) {
      suggest.innerHTML = (cfg.suggestions || D.suggestions).map((s) => `<button type="button" class="suggest">${esc(s)}</button>`).join("");
      suggest.addEventListener("click", (e) => { const b = e.target.closest(".suggest"); if (b) ask(b.textContent); });
    }
    form.addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });
    input.addEventListener("input", () => { send.disabled = !input.value.trim(); input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 140) + "px"; });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    list.addEventListener("click", (e) => {
      const c = e.target.closest("[data-copy]"); if (!c) return;
      const txt = $(".msg-body", c.closest(".msg")).textContent;
      try { navigator.clipboard.writeText(txt); } catch (x) {}
      MP.toast("Respuesta copiada.");
    });
    if (clear) clear.addEventListener("click", () => { list.innerHTML = emptyHTML; suggest && (suggest.hidden = false); });
    if (cfg.empty) list.innerHTML = emptyHTML;
    send.disabled = true;
    setTimeout(scroll, 50);
  };

  /* ---------- Simulación en vivo ---------- */
  MP.initLive = function () {
    const btn = $("[data-live-toggle]");
    const list = $("[data-transcript]");
    const sc = $("[data-transcript-scroll]");
    if (!btn || !list || !sc) return;
    const badge = $$("[data-live-badge]");
    const listening = $("[data-listening]");
    const back = $("[data-back-live]");
    let iv = null, i = 0;
    const nearBottom = () => sc.scrollHeight - sc.scrollTop - sc.clientHeight < 120;
    const tick = () => {
      if (i >= D.live.length) { stop(); MP.toast("Simulación terminada."); return; }
      const stick = nearBottom();
      const last = D.turns[D.turns.length - 1];
      const turn = { t: last.t + 14 + Math.floor(Math.random() * 20), ...D.live[i++] };
      D.turns.push(turn); D.meeting.dur = Math.max(D.meeting.dur, turn.t + 6);
      MP.appendLine(list, turn, list.dataset.mode, "is-new");
      paintPlayer();
      if (stick) sc.scrollTo({ top: sc.scrollHeight, behavior: reduce ? "auto" : "smooth" });
      else if (back) back.hidden = false;
    };
    const start = () => {
      document.body.classList.add("is-live"); btn.setAttribute("aria-pressed", "true");
      btn.innerHTML = `${icon("stop-circle", true)}<span>Detener</span>`;
      badge.forEach((b) => (b.hidden = false)); if (listening) listening.hidden = false;
      sc.scrollTo({ top: sc.scrollHeight, behavior: reduce ? "auto" : "smooth" });
      iv = setInterval(tick, 3200);
    };
    function stop() {
      clearInterval(iv); document.body.classList.remove("is-live"); btn.setAttribute("aria-pressed", "false");
      btn.innerHTML = `${icon("record", true)}<span>Simular en vivo</span>`;
      badge.forEach((b) => (b.hidden = true)); if (listening) listening.hidden = true; if (back) back.hidden = true;
    }
    btn.addEventListener("click", () => (iv && document.body.classList.contains("is-live") ? stop() : start()));
    if (back) back.addEventListener("click", () => { sc.scrollTo({ top: sc.scrollHeight, behavior: reduce ? "auto" : "smooth" }); back.hidden = true; });
    sc.addEventListener("scroll", () => { if (back && nearBottom()) back.hidden = true; });
    stop();
  };

  /* ---------- Home ---------- */
  MP.renderRecent = function (el) {
    el.innerHTML = D.recent.map((r) =>
      `<a class="mt" href="${r.id === "m1" ? "meeting.html" : "#"}" ${r.id === "m1" ? "" : 'data-demo'}><span class="mt-date">${r.date}</span><span class="mt-title">${esc(r.title)}${r.status === "processing" ? ' <span class="pill accent">Procesando</span>' : r.status === "nosummary" ? ' <span class="pill warn">Sin resumen</span>' : ""}</span><span class="mt-ctx"><span>${esc(r.client)}</span><span>${esc(r.project)}</span></span><span class="mt-dur">${r.dur}</span><span class="mt-acts"><b>${r.acts}</b> acciones</span><span class="mt-topic">${esc(r.topic)}</span></a>`).join("");
    el.addEventListener("click", (e) => { const a = e.target.closest("[data-demo]"); if (a) { e.preventDefault(); MP.toast("En el demo solo la primera reunión tiene datos."); } });
  };
  MP.renderReadiness = function (el) {
    el.innerHTML = D.readiness.map((r) => `<li class="ck${r.ok ? " ck-ok" : ""}">${icon(r.ok ? "check-circle" : "warning-circle", r.ok)}<span class="ck-name">${r.name}</span><span class="ck-val">${r.val}</span></li>`).join("");
  };
  MP.initMeter = function (el) {
    if (!el) return;
    const n = Number(el.dataset.meter) || 28;
    el.innerHTML = Array.from({ length: n }, () => "<span></span>").join("");
    const bars = [...el.children];
    const paint = () => bars.forEach((b, i) => { const base = reduce ? 0.4 : 0.15 + Math.random() * 0.85; b.style.setProperty("--h", (i < n * 0.78 ? base * (1 - i / n * 0.5) : 0.1).toFixed(2)); });
    paint();
    if (!reduce) setInterval(paint, 140);
  };
  MP.initRecordButtons = function () {
    $$("[data-record]").forEach((b) => b.addEventListener("click", () => MP.toast("Demo: aquí empezaría la grabación.")));
    $$("[data-import]").forEach((b) => b.addEventListener("click", () => MP.toast("Demo: aquí se abriría la importación de audio.")));
    $$("[data-noop]").forEach((b) => b.addEventListener("click", () => MP.toast(b.dataset.noop)));
  };

  /* ---------- Arranque ---------- */
  MP.boot = function () {
    MP.initTheme();
    MP.initControls();
    const t = $("[data-transcript]");
    if (t) MP.renderTranscript(t, t.dataset.mode);
    $$("[data-insights]").forEach((ins) => MP.renderInsights(ins, ins.dataset.opts ? JSON.parse(ins.dataset.opts) : {}));
    MP.initSearch($("[data-search]"));
    MP.initFontSize();
    MP.initTabs();
    MP.initPlayer();
    MP.initModelPickers();
    MP.renderFlow();
    const cl = $("[data-chat-list]");
    if (cl) MP.initChat({ list: cl, form: $("[data-chat-form]"), input: $("[data-chat-input]"), suggest: $("[data-suggest]"), clear: $("[data-chat-clear]") });
    MP.initLive();
    const rc = $("[data-recent]"); if (rc) MP.renderRecent(rc);
    const rd = $("[data-readiness]"); if (rd) MP.renderReadiness(rd);
    MP.initMeter($("[data-meter]"));
    MP.initRecordButtons();
    if (t) MP.seek(0, { scroll: false });
  };
  document.addEventListener("DOMContentLoaded", () => setTimeout(() => MP.boot(), 0));
})();
