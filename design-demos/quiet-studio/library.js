/* Biblioteca: reuniones con filtros y selección, y acciones de todas las reuniones. Mock. */
(function () {
  const MP = window.MP, D = MP.data;
  const { $, $$, icon, esc } = MP;
  const state = { q: "", client: "", pending: false, who: "all", sel: new Set() };

  /* ---------- Reuniones ---------- */
  const clients = [...new Set(D.recent.map((r) => r.client))];
  $("#clientChips").innerHTML = [["", "Todos"]].concat(clients.map((c) => [c, c])).map(([v, l]) => `<button class="chip" data-c="${esc(v)}" aria-pressed="${v === state.client}">${esc(l)}</button>`).join("");
  $("#clientChips").addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    state.client = b.dataset.c; $$(".chip", $("#clientChips")).forEach((x) => x.setAttribute("aria-pressed", String(x === b))); renderMeetings();
  });
  $("#q").addEventListener("input", (e) => { state.q = e.target.value.toLowerCase(); renderMeetings(); });
  $("#onlyPending").addEventListener("change", (e) => { state.pending = e.target.checked; renderMeetings(); });

  const rowHTML = (r) => {
    const status = r.status === "processing" ? '<span class="pill accent"><i class="ph ph-circle-notch spin"></i>Procesando</span>' : r.status === "nosummary" ? '<span class="pill warn">Sin resumen</span>' : "";
    const href = r.id === "m1" ? "meeting.html" : "#";
    return `<div class="lib-row${state.sel.has(r.id) ? " is-sel" : ""}" data-id="${r.id}">
      <label class="check"><input type="checkbox" data-sel="${r.id}"${state.sel.has(r.id) ? " checked" : ""}><span class="box"></span><span class="sr">Seleccionar</span></label>
      <a class="lr-main" href="${href}"${r.id === "m1" ? "" : " data-demo"}>
        <span class="lr-t">${esc(r.title)} ${status}</span>
        <span class="lr-c">${esc(r.client)}<i>/</i>${esc(r.project)}${(r.tags || []).map((t) => `<em class="tag">${esc(t)}</em>`).join("")}</span>
      </a>
      <span class="lr-d">${esc(r.date)}</span>
      <span class="lr-n mono">${r.dur}</span>
      <span class="lr-a">${r.acts ? `<b>${r.acts}</b> acciones` : '<span class="muted">Sin acciones</span>'}</span>
      <span class="lr-e" title="${r.engine === "gemini" ? "Transcrita en la nube (Gemini)" : "Transcrita en este equipo"}">${icon(r.engine === "gemini" ? "cloud" : "cpu")}</span>
      <span class="lr-x"><button class="btn btn-sm btn-ghost" data-ask="${r.id}" title="Preguntar sobre esta reunión">${icon("sparkle")}Preguntar</button></span>
    </div>`;
  };
  function renderMeetings() {
    const rows = D.recent.filter((r) =>
      (!state.client || r.client === state.client) &&
      (!state.pending || r.acts > 0) &&
      (!state.q || (r.title + " " + r.client + " " + r.project + " " + (r.tags || []).join(" ")).toLowerCase().includes(state.q)));
    $("#cMeet").textContent = D.recent.length;
    $("#meetList").innerHTML = rows.length
      ? rows.map(rowHTML).join("")
      : `<div class="lib-empty">${icon("magnifying-glass")}<h3>Ninguna reunión coincide</h3><p>Prueba con otras palabras o quita los filtros.</p><button class="btn" id="clearF">Limpiar filtros</button></div>`;
    const c = $("#clearF"); if (c) c.addEventListener("click", () => { state.q = ""; state.client = ""; state.pending = false; $("#q").value = ""; $("#onlyPending").checked = false; $$(".chip").forEach((x, i) => x.setAttribute("aria-pressed", String(i === 0))); renderMeetings(); });
    paintBulk();
  }
  function paintBulk() {
    const n = state.sel.size;
    $("#bulk").hidden = n === 0;
    $("#bulkN").textContent = n === 1 ? "1 seleccionada" : n + " seleccionadas";
  }
  $("#meetList").addEventListener("change", (e) => {
    const c = e.target.closest("[data-sel]"); if (!c) return;
    if (c.checked) state.sel.add(c.dataset.sel); else state.sel.delete(c.dataset.sel);
    c.closest(".lib-row").classList.toggle("is-sel", c.checked); paintBulk();
  });
  $("#meetList").addEventListener("click", (e) => {
    const d = e.target.closest("[data-demo]"); if (d) { e.preventDefault(); MP.toast("En el demo solo la primera reunión tiene detalle."); }
    const a = e.target.closest("[data-ask]");
    if (a) { const r = D.recent.find((x) => x.id === a.dataset.ask); MP.openAsk("¿Qué quedó pendiente en “" + r.title + "”?"); }
  });
  $("#bulkClear").addEventListener("click", () => { state.sel.clear(); renderMeetings(); });
  $("#bulkRe").addEventListener("click", () => { MP.toast("Demo: elegirías otro modelo y se reanalizarían " + state.sel.size + " reuniones."); });

  /* ---------- Acciones ---------- */
  const BUCKETS = [["overdue", "Vencidas", "warning"], ["week", "Esta semana", "calendar-check"], ["later", "Más adelante", "calendar-blank"], ["done", "Hechas", "check-circle"]];
  function renderActions() {
    const all = D.allActions.filter((a) => state.who === "all" || a.owner === "Tú");
    const open = all.filter((a) => !a.done);
    $("#cAct").textContent = D.allActions.filter((a) => !a.done).length;
    $("#actSummary").textContent = open.length + " abiertas en " + new Set(open.map((a) => a.mid)).size + " reuniones";
    const groups = BUCKETS.map(([b, label, ic]) => {
      const items = all.filter((a) => (b === "done" ? a.done : !a.done && a.bucket === b));
      if (!items.length) return "";
      return `<div class="act-group"><h3 class="${b === "overdue" ? "is-over" : ""}">${icon(ic)}${label}<span class="count">${items.length}</span></h3>${items.map((a) => {
        const i = D.allActions.indexOf(a);
        return `<div class="act-row${a.done ? " is-done" : ""}"><label class="check"><input type="checkbox" data-act="${i}"${a.done ? " checked" : ""}><span class="box"></span><span class="sr">Marcar como hecha</span></label>
          <div class="ar-main"><span class="a-text">${esc(a.text)}</span><span class="ar-from">${a.mid === "m1" ? `<a href="meeting.html#t=${a.t}">${esc(a.meeting)}</a>` : `<a href="#" data-demo>${esc(a.meeting)}</a>`}</span></div>
          <span class="owner"><span class="avatar">${a.ini}</span>${esc(a.owner)}</span>
          <span class="due${b === "overdue" ? " is-over" : ""}">${icon("calendar-blank")}${a.due}</span></div>`;
      }).join("")}</div>`;
    }).join("");
    $("#actList").innerHTML = groups || `<div class="lib-empty">${icon("check-circle")}<h3>No tienes acciones pendientes</h3><p>Cuando termines una reunión, las acciones aparecerán aquí.</p></div>`;
  }
  $("#actList").addEventListener("change", (e) => { const c = e.target.closest("[data-act]"); if (!c) return; D.allActions[c.dataset.act].done = c.checked; renderActions(); });
  $("#actList").addEventListener("click", (e) => { const d = e.target.closest("[data-demo]"); if (d) { e.preventDefault(); MP.toast("En el demo solo la primera reunión tiene detalle."); } });
  document.addEventListener("mp:seg", (e) => { state.who = e.detail; renderActions(); });

  renderMeetings(); renderActions();
})();
