// Run against a production export. NODE_PATH may point to the bundled Playwright runtime.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, '.next-validation', 'desktop-qa');
fs.mkdirSync(output, { recursive: true });
const mime = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.woff': 'font/woff', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  let file = path.join(root, 'out', pathname === '/' ? 'index.html' : pathname);
  if (!path.extname(file)) file += '.html';
  if (!file.startsWith(path.join(root, 'out')) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader('content-type', mime[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
});
const transcript = Array.from({ length: 130 }, (_, i) => ({ id: `segment-${i}`, sequence_id: i, text: `Segmento ${i}: revisamos la planificación, los próximos pasos y la decisión de entregar el portal el viernes.`, timestamp: '10:00:00', audio_start_time: i * 12, audio_end_time: i * 12 + 10 }));
const metadata = { id: 'demo', title: 'Planificación de entrega', client: 'Estudio Norte', project: 'Portal de clientes', created_at: '2026-10-16T15:00:00Z', updated_at: '2026-10-16T15:00:00Z', tags: ['planificación'] };
const markdown = '# Acuerdos\n\nEl equipo confirmó la entrega del **portal** el viernes.\n\n## Próximos pasos\n\n- Revisar accesibilidad\n- Validar transcripción\n\n| Responsable | Entrega |\n| --- | --- |\n| Equipo | Viernes |\n\n[Documentación](https://example.com)\n';
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    page.on('console', m => { if (m.type() === 'error') console.log('BROWSER',m.text()); });
    page.on('requestfailed', r => console.log('REQUEST FAILED',r.url(),r.failure()));
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.exposeFunction('__savePdf', ({ filename, bytes }) => { assert.equal(Buffer.from(bytes).subarray(0,5).toString(), '%PDF-'); fs.writeFileSync(path.join(output, filename), Buffer.from(bytes)); return filename; });
    await page.addInitScript(({ transcript, metadata, markdown }) => {
      window.__calls = []; window.__messages = []; window.__recording = localStorage.getItem('qa-native-recording') === 'true'; let count = 0; const handlers = new Map();
      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener(event,id) { handlers.set(event,(handlers.get(event)||[]).filter(item=>item.id!==id)); } };
      window.__emit = (event,payload) => { for (const item of handlers.get(event)||[]) window[`_${item.handler}`]?.({event,id:item.id,payload}); };
      window.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
        transformCallback(fn) { const id = ++count; window[`_${id}`] = fn; return id; },
        invoke: async (cmd, args = {}) => {
          window.__calls.push({ cmd, args });
          if (cmd === 'plugin:event|listen') { const id=++count; handlers.set(args.event,[...(handlers.get(args.event)||[]),{id,handler:args.handler}]); return id; }
          if (cmd === 'get_onboarding_status') return { completed: true, model_status: { parakeet: false, whisper: false, summary: false } };
          if (cmd === 'api_list_templates') return [];
          if (/whisper_get_available_models|parakeet_get_available_models|get_ollama_models/.test(cmd)) return [];
          if (cmd === 'plugin:store|get') return [false, true];
          if (cmd === 'get_recording_state') return { is_recording: window.__recording, is_paused: false, is_active:window.__recording, recording_duration: 65, active_duration:65 };
          if (cmd === 'get_recording_meeting_name') return 'Revisión del portal';
          if (cmd === 'get_meeting_folder_path') return 'qa-recording';
          if (cmd === 'start_recording_with_devices_and_meeting') { window.__recording=true; localStorage.setItem('qa-native-recording','true'); queueMicrotask(()=>window.__emit('recording-started',{})); return null; }
          if (cmd === 'api_get_meetings') return [metadata];
          if (cmd === 'api_get_meeting' || cmd === 'api_get_meeting_metadata') return { ...metadata, transcripts: transcript };
          if (cmd === 'api_get_meeting_transcripts') { const rows = transcript.slice(args.offset, args.offset + args.limit); return { transcripts: rows, total_count: transcript.length, has_more: args.offset + rows.length < transcript.length }; }
          if (cmd === 'api_get_summary') return { status: 'completed', meeting_id: 'demo', data: { markdown } };
          if (cmd === 'api_get_model_config') return { provider: 'gemini', model: 'configured-model', whisperModel: 'large-v3' };
          if (cmd === 'api_get_transcript_config') return { provider: 'gemini', model: 'configured-model' };
          if (cmd === 'desktop_assistant_recent_sessions') return [];
          if (cmd === 'get_recording_preferences') return {};
          if (cmd === 'get_audio_devices' || cmd === 'get_transcript_history') return [];
          if (cmd === 'desktop_assistant_session') return { id: args.id, preferences: {}, messages: window.__messages };
          if (cmd === 'desktop_search_status') return { ready: false, indexed: 0, total: 130, totalBytes: 487351240, downloaded: 0 };
          if (cmd === 'desktop_search_query') return { sources: [{ id: 'segment-120', meetingId: 'demo', title: metadata.title, text: transcript[120].text, start: 1440 }], partial: true };
          if (cmd === 'desktop_search_index') return null;
          if (cmd === 'desktop_list_models') return { models: [{ id: 'configured-model', name: 'Configured model', text: true }], cached: false, stale: false };
          if (cmd === 'desktop_assistant_ask' && args.request.kind === 'coach') {
            const suggestion={id:'coach-'+window.__messages.length,role:'assistant',kind:'coach',text:JSON.stringify({title:'Confirmar responsable de la entrega',reason:'Hay una fecha propuesta y falta definir quién valida.',questions:['¿Quién valida la entrega?'],steps:['Asignar responsable y confirmar la fecha.']}),sources:[{id:'1',sessionId:args.request.sessionId,title:'Revisión del portal',text:'La entrega será el viernes.',start:0}],scope:'current',dismissed:false};
            window.__messages.push(suggestion);return {messages:[suggestion],partial:false};
          }
          if (cmd === 'desktop_assistant_ask') {
            const source = { id: 'segment-120', meetingId: 'demo', title: metadata.title, text: transcript[120].text, start: 1440 };
            const scope = args.request.allMeetings ? 'all meetings' : 'current';
            window.__messages.push({ id: 'user', role: 'user', kind: 'chat', text: args.request.question, sources: [], scope }, { id: 'answer', role: 'assistant', kind: 'chat', text: 'La entrega se acordó para el viernes. [1]', sources: [source], scope });
            return { messages: window.__messages, partial: false };
          }
          if (cmd === 'desktop_save_pdf') return window.__savePdf(args);
          return null;
        },
      };
      localStorage.setItem('meetpulse-ui-locale', 'es'); localStorage.setItem('meetpulse-theme', 'light');
    }, { transcript, metadata, markdown });
    await page.goto(url); await page.getByRole('heading', { name: 'Nueva grabación' }).waitFor();
    assert.equal(await page.getByText('Wiki de conocimiento').count(), 0);
    assert.equal(await page.getByText('Continuar con Google').count(), 0);
    await page.screenshot({ path: path.join(output, 'home-light.png') });
    await page.goto(`${url}/ask`);
    await page.getByRole('heading', { name: 'Recientes' }).waitFor();
    await page.getByRole('textbox', { name: 'Pregunta a la transcripción' }).fill('¿Qué fecha se acordó para la entrega?');
    await page.getByRole('button', { name: 'Enviar consulta' }).click();
    await page.getByText('La entrega se acordó para el viernes.').waitFor();
    assert.equal(await page.evaluate(() => window.__calls.some(c => c.cmd === 'desktop_assistant_ask' && c.args.request.allMeetings === true)), true, 'Ask page must search all meetings');
    await page.screenshot({ path: path.join(output, 'ask-fullscreen.png') });
    await page.keyboard.press('Control+k');
    await page.getByPlaceholder('Busca reuniones o ajustes, o pregunta algo').fill('¿Qué fecha se acordó para la entrega?');
    await page.getByText('Planificación de entrega', { exact: true }).last().waitFor();
    await page.waitForFunction(() => window.__calls.some(c => c.cmd === 'desktop_search_query'));
    assert.equal(await page.evaluate(() => window.__calls.some(c => c.cmd === 'desktop_search_query')), true, 'Ctrl+K must query the local semantic index');
    await page.keyboard.press('Escape');
    await page.goto(`${url}/meeting-details?id=demo`);
    try { await page.getByRole('button', { name: 'Transcripción PDF' }).waitFor({ timeout: 30000 }); } catch(e) { console.log(await page.locator('body').innerText()); console.log(errors); console.log(await page.evaluate(()=>window.__calls)); await page.screenshot({path:path.join(output,'failure.png')}); throw e; }
    await page.getByRole('button', { name: 'Asistente', exact: true }).click();
    await page.getByRole('textbox', { name: 'Pregunta a la transcripción' }).fill('¿Qué fecha se acordó?');
    await page.getByRole('button', { name: 'Enviar consulta' }).click();
    await page.getByText('La entrega se acordó para el viernes.').waitFor();
    await page.screenshot({ path: path.join(output, 'meeting-assistant-light.png') });
    await page.getByText('El equipo confirmó la entrega del', {exact:false}).first().click(); await page.keyboard.press('End'); await page.keyboard.type(' Ajuste sin guardar.');
    await page.getByRole('button', { name: 'Transcripción PDF' }).click();

    try { await page.waitForFunction(() => window.__calls.some(c => c.cmd === 'desktop_save_pdf'), null, { timeout: 60000 }); } catch(e) { console.log(await page.locator('body').innerText()); await page.screenshot({path:path.join(output,'pdf-failure.png')}); throw e; }
    await page.getByRole('button', { name: 'Análisis PDF' }).click();
    await page.waitForFunction(() => window.__calls.filter(c => c.cmd === 'desktop_save_pdf').length === 2, null, { timeout: 60000 });
    await page.getByRole('button', { name: /\[1\] Planificación/ }).click();
    await page.waitForSelector('.transcript-source-highlight');
    await page.setViewportSize({ width: 850, height: 700 });
    await page.evaluate(() => { document.documentElement.classList.add('dark'); });
    await page.screenshot({ path: path.join(output, 'meeting-assistant-narrow-dark.png') });
    await page.setViewportSize({width:1100,height:700});
    await page.goto(url); await page.getByRole('heading',{name:'Nueva grabación'}).waitFor();
    await page.getByRole('button',{name:'Iniciar grabación',exact:true}).click();
    await page.getByRole('button',{name:'Asistente',exact:true}).waitFor();
    await page.clock.install();
    await page.evaluate(()=>window.__emit('transcript-update',{text:'La entrega será el viernes y debemos definir la validación.',timestamp:'10:00:00',source:'microphone',sequence_id:1,chunk_start_time:0,is_partial:false,confidence:0.99,audio_start_time:0,audio_end_time:8,duration:8}));
    await page.clock.fastForward(5000);
    await page.getByRole('button',{name:'Asistente',exact:true}).click();
    await page.getByRole('tab',{name:'Coach',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c.cmd==='desktop_assistant_ask').length),0);
    await page.getByRole('button',{name:'Activar Coach'}).click();
    await page.getByRole('button',{name:'Actualizar ahora'}).click();
    await page.getByRole('button',{name:'Confirmar responsable de la entrega'}).waitFor();
    await page.getByRole('button',{name:'Confirmar responsable de la entrega'}).click();
    await page.getByText('¿Quién valida la entrega?').waitFor();
    await page.screenshot({path:path.join(output,'live-coach.png')});
    await page.getByRole('button',{name:'Cerrar asistente'}).click();
    await page.clock.fastForward(61000);
    assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c.cmd==='desktop_assistant_ask').length),1,'Coach must not repeat without new chunks');
    await page.getByRole('button',{name:/Asistente/}).first().click();
    await page.evaluate(()=>window.__emit('recording-paused',{}));
    await page.clock.fastForward(1000);
    assert.equal(await page.getByRole('button',{name:'Actualizar ahora'}).isDisabled(),true);
    await page.clock.resume();
    await page.getByRole('button',{name:'Reuniones',exact:true}).click();
    await page.getByText('Portal de clientes',{exact:true}).click();
    await page.getByText('Planificación de entrega',{exact:true}).click();
    try { await page.getByRole('region',{name:'Controles de grabación'}).waitFor(); } catch(e) { console.log('NAVIGATION',page.url(),await page.locator('body').innerText()); await page.screenshot({path:path.join(output,'navigation-failure.png')}); throw e; }
    assert.equal(await page.getByRole('button',{name:'Detener',exact:true}).isVisible(),true);
    await page.getByRole('button',{name:'Volver al vivo',exact:true}).click();
    const forbidden = await page.evaluate(() => window.__calls.filter(c => /google_auth|sign_in|wiki/i.test(c.cmd)));
    assert.deepEqual(forbidden, []);
    const serious = errors.filter(e => !e.includes('removeListener') && !e.includes('permissions'));
    assert.deepEqual(serious, []);
    console.log(JSON.stringify({ output, screenshots: 4, pdfs: 2, forbiddenWikiCalls: forbidden.length, errors }, null, 2));
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
