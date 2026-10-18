/* Demo de ajustes: claves de API, modelos de transcripción y controles. Todo es simulado. */
(function () {
  const MP = window.MP;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const icon = MP.icon;
  const esc = MP.esc;

  /* ---------- Claves de API ---------- */
  const EXTRA = {
    Anthropic: { models: ["Claude Sonnet 5.5", "Claude Haiku 5.5"], link: "console.anthropic.com/settings/keys" },
    Groq: { models: ["Llama 3.3 70B"] },
    OpenRouter: { models: ["Mistral Large"] },
    Google: { models: ["Gemini 3.1 Flash-Lite"], link: "aistudio.google.com/apikey" },
  };

  function renderKeyZone(zone, state) {
    const prov = zone.closest(".prov").dataset.provider;
    const pill = $("[data-status]", zone.closest(".prov"));
    const link = zone.dataset.link || (EXTRA[prov] && EXTRA[prov].link);
    if (state.saved) {
      pill.className = "pill good";
      pill.innerHTML = `<i class="ph-fill ph-circle" style="font-size:.6em"></i>Conectada`;
      zone.innerHTML = `
        <div class="key-field"><label>Clave de API</label>
          <div class="key-saved">${icon("key")}<code>••••••••••••${esc(state.last4)}</code><span class="pill good">${icon("check-circle", true)}Válida</span><span class="sp"></span>
            <button class="btn btn-sm" data-act="replace">Reemplazar</button>
            <button class="btn btn-sm btn-danger" data-act="remove">Quitar</button></div></div>
        <div><div class="hint" style="margin-bottom:6px">${zone.dataset.uses ? "Se usa para: " + esc(zone.dataset.uses) : "Modelos disponibles con esta clave"}</div><div class="models-found">${(EXTRA[prov] ? EXTRA[prov].models : []).map((m) => `<span>${esc(m)}</span>`).join("")}</div></div>`;
      return;
    }
    pill.className = "pill";
    pill.textContent = "Sin clave";
    zone.innerHTML = `
      <div class="key-field">
        <label for="k-${prov}">Clave de API</label>
        <div class="key-row">
          <input class="input input-mono" id="k-${prov}" type="password" placeholder="Pega tu clave aquí" autocomplete="off" spellcheck="false" aria-describedby="m-${prov}">
          <button class="icon-btn" data-act="eye" title="Mostrar u ocultar la clave" aria-label="Mostrar u ocultar la clave">${icon("eye")}</button>
          <button class="btn btn-primary" data-act="test">Probar y guardar</button>
        </div>
        <div class="field-msg info" id="m-${prov}">${link ? `Obtén una en <a class="hint-link" href="#" data-noop="Demo: se abriría ${esc(link)}.">${esc(link)}</a>.` : "Pega la clave de tu cuenta."}${state.cancel ? ` <button class="hint-link" data-act="cancel">Cancelar</button>` : ""}</div>
      </div>`;
  }

  function validate(v) {
    v = v.trim();
    if (!v) return "Ingresa una clave.";
    if (/\s/.test(v)) return "La clave contiene espacios. Revisa que la hayas copiado completa.";
    if (v.length < 20 || /bad|test|1234/i.test(v)) return "El proveedor rechazó la clave (error 401). Revisa que sea la correcta y que no haya expirado.";
    return "";
  }

  $$("[data-keyzone]").forEach((zone) => {
    const prov = zone.closest(".prov").dataset.provider;
    const st = { saved: zone.dataset.saved === "1", last4: zone.dataset.last4 || "" };
    renderKeyZone(zone, st);
    let armed = null;
    zone.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]"); if (!b) return;
      const act = b.dataset.act;
      if (act === "eye") {
        const inp = $("input", zone); const show = inp.type === "password";
        inp.type = show ? "text" : "password"; b.innerHTML = icon(show ? "eye-slash" : "eye");
      }
      if (act === "replace") { st.saved = false; st.cancel = true; renderKeyZone(zone, st); $("input", zone).focus(); }
      if (act === "cancel") { st.saved = true; st.cancel = false; renderKeyZone(zone, st); }
      if (act === "remove") {
        if (armed) { clearTimeout(armed); armed = null; st.saved = false; st.cancel = false; renderKeyZone(zone, st); MP.models.setProvider(prov, false); MP.toast("Clave de " + prov + " eliminada."); return; }
        b.textContent = "¿Seguro? Quitar"; armed = setTimeout(() => { armed = null; b.textContent = "Quitar"; }, 3000);
      }
      if (act === "test") {
        const inp = $("input", zone), msg = $(".field-msg", zone);
        const err = validate(inp.value);
        inp.classList.toggle("is-error", !!err);
        if (err) { msg.className = "field-msg err"; msg.innerHTML = `${icon("warning-circle", true)}${esc(err)}`; inp.focus(); return; }
        b.classList.add("is-loading"); b.innerHTML = `<i class="ph ph-circle-notch spin"></i>Probando`;
        msg.className = "field-msg info"; msg.textContent = "Conectando con " + prov + "…";
        setTimeout(() => {
          st.saved = true; st.cancel = false; st.last4 = inp.value.trim().slice(-4); renderKeyZone(zone, st);
          MP.models.setProvider(prov, true);
          MP.toast("Clave de " + prov + " guardada. Modelos disponibles.");
        }, 1100);
      }
    });
    zone.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("input")) { const t = $('[data-act="test"]', zone); if (t) t.click(); } });
    zone.addEventListener("input", (e) => { if (e.target.matches("input")) { e.target.classList.remove("is-error"); } });
  });

  // Ollama
  $("#ollamaDetect").addEventListener("click", (e) => {
    const b = e.currentTarget, msg = $("#ollamaMsg");
    b.classList.add("is-loading"); b.innerHTML = `<i class="ph ph-circle-notch spin"></i>Buscando`;
    msg.className = "field-msg info"; msg.textContent = "Buscando Ollama…";
    setTimeout(() => {
      b.classList.remove("is-loading"); b.innerHTML = `${icon("magnifying-glass")}Detectar`;
      msg.className = "field-msg ok"; msg.innerHTML = `${icon("check-circle", true)}Ollama responde. 2 modelos instalados.`;
    }, 900);
  });

  /* ---------- Motor de transcripción: modelos locales, opciones de la nube y flujo de datos ---------- */
  const Mo = MP.models;
  const localStt = () => MP.data.stt.filter((m) => m.kind === "local");
  function renderLocal() {
    const sel = Mo.cur("stt").id;
    $("#tmList").innerHTML = localStt().map((m) => {
      const right = m.status === "ready" ? `<span class="pill good">${icon("check")}Instalado</span>`
        : m.status === "busy" ? `<span class="pill accent">${esc(m.progress)}</span>`
        : `<button class="btn btn-sm" data-dl="${m.id}">${icon("download-simple")}Descargar</button>`;
      return `<div class="tm" role="radio" aria-checked="${m.id === sel}" data-id="${m.id}" tabindex="0">
        <div class="tm-head"><span class="radio"></span><div><div class="tm-n">${esc(m.name)}${m.tag ? ` <span class="pill accent" style="margin-left:6px">${m.tag}</span>` : ""}</div><div class="tm-d">${esc(m.note)}</div></div></div>
        <span class="tm-d tm-d2 mono">${m.size}</span>${right}</div>`;
    }).join("");
  }
  $("#tmList").addEventListener("click", (e) => {
    const dl = e.target.closest("[data-dl]");
    if (dl) {
      e.stopPropagation();
      const m = MP.data.stt.find((x) => x.id === dl.dataset.dl); m.status = "busy"; let n = 0; m.progress = "Descargando 0%"; Mo.sync();
      const iv = setInterval(() => { n += 8 + Math.random() * 14; if (n >= 100) { clearInterval(iv); m.status = "ready"; delete m.progress; MP.toast(m.name + " instalado."); } else m.progress = "Descargando " + Math.floor(n) + "%"; Mo.sync(); }, 350);
      return;
    }
    const row = e.target.closest(".tm"); if (!row) return;
    const m = MP.data.stt.find((x) => x.id === row.dataset.id);
    if (m.status !== "ready") { MP.toast("Descarga " + m.name + " para usarlo."); return; }
    Mo.setSlot("stt", m.id);
  });
  $("#tmList").addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { const row = e.target.closest(".tm"); if (row && !e.target.closest("button")) { e.preventDefault(); row.click(); } } });

  // Panel según el motor elegido, aviso de privacidad y resumen del flujo de datos
  function renderEngine() {
    const m = Mo.cur("stt"), cloud = m.kind === "cloud";
    $("#sttCloud").hidden = !cloud;
    $("#sttLocal").hidden = cloud;
    $("#sttWarn").innerHTML = cloud
      ? `<div class="notice warn"><i class="ph ph-cloud-arrow-up"></i><span>El <b>audio</b> de tus reuniones se enviará a <b>${esc(m.provider)}</b> para transcribirlo. Es el único caso en que el audio sale de este equipo.</span></div>`
      : `<div class="notice"><i class="ph ph-shield-check"></i><span>El audio se transcribe en este equipo y no sale de tu PC.</span></div>`;
    renderLocal();
  }
  function renderFlow() {
    const el = $("#flowSum"); if (!el) return;
    const rows = [["Audio", "waveform", Mo.cur("stt"), "Transcripción"], ["Texto de la reunión", "article", Mo.cur("summary"), "Resumen"], ["Preguntas", "chats-circle", Mo.cur("chat"), "Chat y asistente"], ["Insights en vivo", "lightbulb", Mo.cur("coach"), "Coach"]];
    const anyCloud = rows.some((r) => r[2].kind === "cloud");
    el.className = "flow-sum" + (anyCloud ? " is-cloud" : "");
    el.innerHTML = `<div class="fs-head">${anyCloud ? icon("cloud-arrow-up") : icon("shield-check", true)}<div><b>${anyCloud ? "Algunos datos salen de este equipo" : "Todo se queda en este equipo"}</b><span>Así viajan tus datos según los modelos elegidos.</span></div></div>
      <ul>${rows.map(([what, ic, m, fn]) => `<li><span class="fs-w">${icon(ic)}${what}<em>${fn}</em></span><span class="fs-arrow">${icon("arrow-right")}</span><span class="fs-t ${m.kind}">${icon(m.kind === "local" ? "cpu" : "cloud")}${esc(m.name)}<em>${m.kind === "local" ? "en este equipo" : "enviado a " + esc(m.provider)}</em></span></li>`).join("")}</ul>`;
  }
  document.addEventListener("mp:models", () => { renderEngine(); renderFlow(); });
  renderEngine(); renderFlow();

  $("#gTest").addEventListener("click", (e) => {
    const b = e.currentTarget; b.classList.add("is-loading"); b.innerHTML = `<i class="ph ph-circle-notch spin"></i>Probando`;
    setTimeout(() => { b.classList.remove("is-loading"); b.innerHTML = `${icon("waveform")}Probar con un audio`; MP.toast("Gemini transcribió el audio de prueba correctamente."); }, 1400);
  });
  const rb = $("#idxRebuild");
  if (rb) rb.addEventListener("click", () => {
    rb.classList.add("is-loading"); rb.innerHTML = `<i class="ph ph-circle-notch spin"></i>Reconstruyendo`; $("#idxDesc").textContent = "Reconstruyendo el índice, 128 reuniones…";
    setTimeout(() => { rb.classList.remove("is-loading"); rb.innerHTML = `${icon("arrow-clockwise")}Reconstruir`; $("#idxDesc").textContent = "Al día. 128 reuniones, 4.310 fragmentos, actualizado ahora."; MP.toast("Índice reconstruido."); }, 2200);
  });

  /* ---------- Medidor del micrófono ---------- */
  const mEl = $("#setMeter");
  mEl.innerHTML = Array.from({ length: 14 }, () => "<span></span>").join("");
  const bars = [...mEl.children];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  setInterval(() => { const v = reduce ? 0.4 : 0.1 + Math.random() * 0.65; bars.forEach((b, i) => (b.className = i / bars.length < v ? (i > 11 ? "hot" : "on") : "")); }, 140);

  /* ---------- Preferencias de coach y chat (compartidas con la pantalla en vivo) ---------- */
  const flag = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v === "1"; } catch (e) { return d; } };
  const setFlag = (k, v) => { try { localStorage.setItem(k, v ? "1" : "0"); } catch (e) {} };
  const cd = $("#coachDefault"), ch = $("#chatDefault");
  cd.checked = flag("mp-coach", false); ch.checked = flag("mp-chat", true);
  cd.addEventListener("change", () => setFlag("mp-coach", cd.checked));
  ch.addEventListener("change", () => setFlag("mp-chat", ch.checked));

  /* ---------- Borrar todo (con confirmación) ---------- */
  $("#wipeBtn").addEventListener("click", () => {
    const back = document.createElement("div");
    back.className = "modal-back";
    back.innerHTML = `<div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="wt"><h3 id="wt">¿Borrar todas las reuniones?</h3><p>Se eliminarán 128 reuniones con su audio, transcripciones y resúmenes. Esta acción no se puede deshacer.</p><div class="key-field" style="margin-top:14px"><label for="wc">Escribe BORRAR para confirmar</label><input class="input" id="wc" autocomplete="off"></div><div class="acts"><button class="btn" data-x>Cancelar</button><button class="btn btn-danger" data-ok disabled>Borrar todo</button></div></div>`;
    document.body.appendChild(back);
    const inp = $("#wc", back), ok = $("[data-ok]", back);
    inp.focus();
    inp.addEventListener("input", () => (ok.disabled = inp.value.trim().toUpperCase() !== "BORRAR"));
    back.addEventListener("click", (e) => {
      if (e.target === back || e.target.closest("[data-x]")) back.remove();
      if (e.target.closest("[data-ok]") && !ok.disabled) { back.remove(); MP.toast("Demo: aquí se borrarían los datos."); }
    });
  });
})();
