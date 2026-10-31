import ts from 'typescript';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pdf } from '@react-pdf/renderer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, '.next-validation', 'template-fixture');
await mkdir(output, { recursive: true });
for (const filename of ['branding.ts', 'templates.tsx']) {
  const source = await readFile(path.join(root, 'src/lib/pdf', filename), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replaceAll('"./branding"', '"./branding.mjs"');
  await writeFile(path.join(output, filename.replace(/\.tsx?$/, '.mjs')), js);
}
const server = createServer((req, res) => {
  const file = path.join(root, 'public', new URL(req.url, 'http://localhost').pathname);
  if (!existsSync(file)) { res.writeHead(404); res.end(); return; }
  createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const { buildReport } = await import(pathToFileURL(path.join(output, 'templates.mjs')).href);
  const document = buildReport({ kind: 'transcript', locale: 'es', title: 'Planificación de entrega', date: '16 de octubre de 2026', client: 'Estudio Norte', project: 'Portal', assetBase: `http://127.0.0.1:${server.address().port}`, segments: Array.from({ length: 130 }, (_, i) => ({ start: i * 12, text: `Segmento ${i}: revisamos la planificación, los próximos pasos y la decisión de entregar el portal el viernes.` })) });
  if (!process.argv.includes('--analysis')) await writeFile(path.join(output, 'transcript.pdf'), Buffer.from(await (await pdf(document).toBlob()).arrayBuffer()));
  if (process.argv.includes('--analysis')) {
  const longAnalysis = buildReport({ kind: 'analysis', locale: 'es', title: 'Análisis extenso', date: '16 de octubre de 2026', client: 'Estudio Norte', project: 'Portal', assetBase: `http://127.0.0.1:${server.address().port}`, markdown: '# Decisiones y próximos pasos\n\n' + Array.from({ length: 35 }, (_, i) => `## Decisión ${i + 1}\n\nSe acordó validar la planificación, accesibilidad y calidad de la transcripción.\n\n- Confirmar responsable\n- Revisar la información del cliente\n\n| Responsable | Compromiso |\n| --- | --- |\n| Equipo ${i + 1} | Entrega el viernes |\n\n[Referencia](https://example.com)\n\n`).join('') });
  await writeFile(path.join(output, 'analysis-long.pdf'), Buffer.from(await (await pdf(longAnalysis).toBlob()).arrayBuffer()));
  } else {
    // Match production: each export uses its own worker and independent font subsets.
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--analysis'], { stdio: 'inherit' });
    if (result.status !== 0) throw new Error('Long analysis fixture failed');
  }
  console.log(output);
} finally { server.close(); }
