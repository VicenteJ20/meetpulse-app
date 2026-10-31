/* Estados de carga: arranque de la app, procesamiento de una reunión y error. Simulados. */
(function () {
  const MP = window.MP;
  const $ = (s, r = document) => r.querySelector(s);
  const icon = MP.icon;
  const stage = $("#stage");
  let timers = [];
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  const CHECK = '<i class="ph ph-check"></i>';

  function stepsHTML(list) {
    return `<ol class="steps">${list.map((s, i) => `<li class="step" data-i="${i}"><span class="s-ico">${CHECK}</span><div><div class="s-t">${s.t}</div><div class="s-d">${s.d || ""}</div></div><span class="s-r"></span></li>`).join("")}</ol>`;
  }
  function setStep(i, state, right) {
    const el = stage.querySelector(`.step[data-i="${i}"]`); if (!el) return;
    el.className = "step " + (state ? "is-" + state : "");
    el.querySelector(".s-ico").innerHTML = state === "error" ? '<i class="ph ph-x"></i>' : CHECK;
    if (right !== undefined) el.querySelector(".s-r").textContent = right;
  }
  function progress(pct, label) {
    const f = $("#fill"); if (f) f.style.width = pct + "%";
    const l = $("#pLabel"); if (l && label !== undefined) l.textContent = label;
    const p = $("#pPct"); if (p) p.textContent = Math.round(pct) + "%";
  }

  /* 1. Inicio de la app */
  function startup() {
    const steps = [
      { t: "Iniciando la aplicación" },
      { t: "Abriendo la base de datos local", d: "128 reuniones" },
      { t: "Cargando el modelo de transcripción", d: "Whisper small, 466 MB" },
      { t: "Comprobando el audio", d: "Micrófono y audio del sistema" },
      { t: "Buscando Ollama", d: "http://localhost:11434" },
    ];
    stage.innerHTML = `<div class="splash"><div class="splash-in">
      <div><span class="splash-logo" title="Logo provisional"><i class="ph-fill ph-waveform"></i></span></div>
      <div><h1>Preparando MeetPulse</h1><p class="sub">Todo se ejecuta en este equipo.</p></div>
      <div><div class="bar-row"><span id="pLabel">Iniciando…</span><span class="mono" id="pPct">0%</span></div><div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><span id="fill"></span></div></div>
      ${stepsHTML(steps)}
      <div class="splash-foot"><span class="hint"><i class="ph ph-lock-simple"></i>Sin conexión no se pierde nada.</span><a class="btn btn-primary" id="enter" href="home.html" hidden>Abrir MeetPulse</a></div>
    </div></div>`;
    const plan = [[0, 600, 8], [1, 700, 22], [2, 2200, 78], [3, 800, 92], [4, 700, 100]];
    let at = 300;
    plan.forEach(([i, dur, pct], k) => {
      later(() => { setStep(i, "active"); progress(plan[k - 1] ? plan[k - 1][2] : 2, steps[i].t + "…"); }, at);
      if (i === 2) {
        for (let n = 1; n <= 5; n++) later(() => { progress(22 + (56 * n) / 5); setStep(2, "active", Math.round((466 * n) / 5) + " MB"); }, at + (dur * n) / 5);
      }
      at += dur;
      later(() => { setStep(i, "done", i === 2 ? "466 MB" : ""); progress(pct, i === 4 ? "Listo" : steps[Math.min(i + 1, 4)].t + "…"); }, at);
    });
    later(() => { $("#enter").hidden = false; $("#enter").focus(); }, at + 200);
  }

  /* 2. Procesando reunión */
  function processing() {
    const skGroup = (w) => `<div class="sk-group"><div class="sk-head"><span class="sk"></span><span class="sk" style="width:90px"></span></div><span class="sk" style="width:${w[0]}%"></span><span class="sk" style="width:${w[1]}%"></span><span class="sk" style="width:${w[2]}%"></span></div>`;
    const steps = [
      { t: "Audio guardado", d: "47 min, 128 MB" },
      { t: "Transcribiendo", d: "Whisper small, en este equipo" },
      { t: "Generando el resumen", d: "Llama 3.2 3B, local" },
      { t: "Buscando decisiones y acciones" },
    ];
    stage.innerHTML = `<div class="proc">
      <div class="proc-col" aria-hidden="true"><h2>Transcripción</h2>${skGroup([92, 80, 55])}${skGroup([88, 70, 40])}${skGroup([95, 64, 78])}${skGroup([86, 90, 35])}</div>
      <div class="proc-col">
        <div><h2 style="font-size:1.25em;letter-spacing:-.02em">Procesando Planificación sprint 14</h2><p style="color:var(--text-2);margin-top:4px">Puedes seguir usando MeetPulse. Te avisamos cuando termine.</p></div>
        <div class="proc-status"><div><div class="bar-row"><span id="pLabel">Guardando el audio…</span><span class="mono" id="pPct">0%</span></div><div class="bar" role="progressbar"><span id="fill"></span></div></div>${stepsHTML(steps)}</div>
        <div id="skIns" style="display:grid;gap:14px"><span class="sk" style="width:38%;height:14px"></span><span class="sk" style="width:96%"></span><span class="sk" style="width:90%"></span><span class="sk" style="width:62%"></span><span class="sk" style="width:30%;height:14px;margin-top:10px"></span><span class="sk" style="width:84%"></span><span class="sk" style="width:70%"></span></div>
        <div class="splash-foot"><span class="hint"><i class="ph ph-info"></i>Si cierras la app, el proceso continúa al volver a abrirla.</span><a class="btn btn-primary" id="enter" href="meeting.html" hidden>Ver la reunión</a></div>
      </div></div>`;
    setStep(0, "active");
    later(() => { setStep(0, "done"); setStep(1, "active", "0%"); progress(8, "Transcribiendo…"); }, 700);
    for (let n = 1; n <= 10; n++) later(() => { setStep(1, "active", n * 10 + "%"); progress(8 + n * 5.6, "Transcribiendo… " + n * 10 + "%"); }, 700 + n * 330);
    later(() => { setStep(1, "done", "03:12"); setStep(2, "active"); progress(66, "Generando el resumen…"); }, 4200);
    later(() => { setStep(2, "done", "28 s"); setStep(3, "active"); progress(90, "Buscando decisiones y acciones…"); }, 6600);
    later(() => { setStep(3, "done"); progress(100, "Listo"); $("#skIns").remove(); $("#enter").hidden = false; $("#enter").focus(); }, 7800);
  }

  /* 3. Error */
  function error() {
    const steps = [
      { t: "Iniciando la aplicación" },
      { t: "Abriendo la base de datos local", d: "128 reuniones" },
      { t: "Cargando el modelo de transcripción", d: "Whisper small" },
    ];
    stage.innerHTML = `<div class="splash"><div class="splash-in err-box">
      <span class="e-ico"><i class="ph-fill ph-warning"></i></span>
      <div><h1>No se pudo cargar el modelo de transcripción</h1><p class="sub">No encontramos el archivo de Whisper small. Tus reuniones y grabaciones están a salvo.</p></div>
      ${stepsHTML(steps)}
      <details><summary>Ver detalles técnicos</summary><pre>No se encontró el archivo del modelo
C:\\Users\\Vicente\\AppData\\Roaming\\Meetily\\models\\ggml-small.bin</pre></details>
      <div class="splash-foot" style="justify-content:flex-start;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" id="redl"><i class="ph ph-download-simple"></i>Descargar de nuevo</button>
        <a class="btn" href="settings.html?tab=transcription">Elegir otro modelo</a>
        <a class="btn btn-ghost" href="home.html">Continuar sin transcripción</a>
      </div></div></div>`;
    setStep(0, "done"); setStep(1, "done"); setStep(2, "error", "No encontrado");
    $("#redl").addEventListener("click", (e) => {
      const b = e.currentTarget; b.classList.add("is-loading"); b.innerHTML = '<i class="ph ph-circle-notch spin"></i>Descargando 0%';
      let n = 0; const iv = setInterval(() => { n += 11 + Math.random() * 10; if (n >= 100) { clearInterval(iv); b.className = "btn btn-primary"; b.innerHTML = '<i class="ph ph-check"></i>Listo, abrir MeetPulse'; b.onclick = () => (location.href = "home.html"); setStep(2, "done", "466 MB"); } else b.innerHTML = '<i class="ph ph-circle-notch spin"></i>Descargando ' + Math.floor(n) + "%"; }, 350);
    });
  }

  const VIEWS = { startup, processing, error };
  function show(v) {
    clear();
    (VIEWS[v] || startup)();
    document.querySelectorAll('[data-seg="state"] [data-value]').forEach((b) => b.setAttribute("aria-checked", String(b.dataset.value === v)));
    current = v;
    try { history.replaceState(null, "", "?state=" + v); } catch (e) {}
  }
  let current = new URLSearchParams(location.search).get("state");
  if (!VIEWS[current]) current = "startup";
  document.addEventListener("mp:seg", (e) => show(e.detail));
  $("#replay").addEventListener("click", () => show(current));
  show(current);
})();
