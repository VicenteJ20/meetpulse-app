import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceRoots = ['src/app', 'src/components'];
const forbiddenLightUtilities = /\b(?:bg-white|bg-(?:gray|slate|neutral)-(?:50|100)|text-black|text-(?:gray|slate|neutral)-(?:600|700|800|900)|border-(?:gray|slate|neutral)-(?:100|200|300|400)|bg-(?:blue|red|green|amber|yellow|orange)-(?:50|100)|text-(?:blue|red|green|amber|yellow|orange)-(?:700|800|900)|border-(?:blue|red|green|amber|yellow|orange)-(?:100|200|300))\b/g;

async function collectTsxFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTsxFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.tsx') ? [entryPath] : [];
  }));
  return nested.flat();
}

test('UI components use theme-aware semantic colors', async () => {
  const files = (await Promise.all(sourceRoots.map(root => collectTsxFiles(path.join(frontendRoot, root))))).flat();
  const violations = [];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const matches = [...source.matchAll(forbiddenLightUtilities)];
    for (const match of matches) {
      const line = source.slice(0, match.index).split('\n').length;
      violations.push(`${path.relative(frontendRoot, file)}:${line} (${match[0]})`);
    }
  }

  assert.deepEqual(violations, [], `Use semantic theme tokens instead:\n${violations.join('\n')}`);
});

test('meeting summary controls keep semantic contrast and iconography', async () => {
  const [languagePicker, summaryControls] = await Promise.all([
    readFile(path.join(frontendRoot, 'src/components/LanguagePickerPopover.tsx'), 'utf8'),
    readFile(
      path.join(frontendRoot, 'src/components/MeetingDetails/SummaryGeneratorButtonGroup.tsx'),
      'utf8'
    ),
  ]);

  assert.doesNotMatch(languagePicker, /🔍|✓/);
  assert.match(languagePicker, /import \{ Check, Search \} from "lucide-react"/);
  assert.match(languagePicker, /bg-popover text-popover-foreground/);
  assert.match(languagePicker, /bg-brand\/10 font-medium text-brand/);
  assert.doesNotMatch(summaryControls, /slate-|text-white/);
  assert.match(summaryControls, /border-brand bg-brand text-brand-foreground/);
  assert.match(summaryControls, /data-\[state=open\]:bg-accent/);
});

test('BlockNote editors follow the application theme', async () => {
  const editorFiles = await Promise.all([
    readFile(path.join(frontendRoot, 'src/components/BlockNoteEditor/Editor.tsx'), 'utf8'),
    readFile(path.join(frontendRoot, 'src/components/AISummary/BlockNoteSummaryView.tsx'), 'utf8'),
  ]);

  for (const source of editorFiles) {
    assert.doesNotMatch(source, /theme="light"/);
    assert.match(source, /theme=\{resolvedTheme\}/);
  }
});

test('meeting summary document uses one semantic editorial surface', async () => {
  const [globalStyles, summaryPanel] = await Promise.all([
    readFile(path.join(frontendRoot, 'src/app/globals.css'), 'utf8'),
    readFile(path.join(frontendRoot, 'src/components/MeetingDetails/SummaryPanel.tsx'), 'utf8'),
  ]);

  assert.match(globalStyles, /\.meeting-summary-editor \.bn-container/);
  assert.match(globalStyles, /--bn-colors-editor-background: transparent/);
  assert.match(globalStyles, /--bn-colors-menu-background: hsl\(var\(--popover\)\)/);
  assert.match(globalStyles, /\.meeting-summary-editor \.bn-shadcn,/);
  assert.match(globalStyles, /background: transparent !important/);
  assert.match(globalStyles, /max-width: 880px/);
  assert.match(globalStyles, /border-left: 3px solid hsl\(var\(--brand\) \/ 0\.8\)/);
  assert.match(globalStyles, /\[data-content-type="table"\] \.tableWrapper/);
  assert.match(summaryPanel, /className="meeting-summary-editor w-full"/);
  assert.doesNotMatch(summaryPanel, /meeting-summary-editor w-full p-6/);
});

test('home readiness controls align device icons with a stable text gap', async () => {
  const controls = await readFile(
    path.join(frontendRoot, 'src/components/HomeReadinessControls.tsx'),
    'utf8'
  );

  assert.match(controls, /flex min-w-0 flex-1 items-center gap-3/);
  assert.match(controls, /flex h-9 w-5 shrink-0 items-center justify-center self-center/);
  assert.match(controls, /<Icon className="h-4 w-4" \/>/);
});

test('wiki documents reuse the semantic editorial surface without a nested dark canvas', async () => {
  const [wikiPage, globalStyles] = await Promise.all([
    readFile(path.join(frontendRoot, 'src/app/wiki/page.tsx'), 'utf8'),
    readFile(path.join(frontendRoot, 'src/app/globals.css'), 'utf8'),
  ]);

  assert.match(wikiPage, /mx-auto max-w-\[880px\]/);
  assert.match(wikiPage, /meeting-summary-editor wiki-document-editor/);
  assert.match(globalStyles, /\.wiki-document-editor\.meeting-summary-editor/);
  assert.match(globalStyles, /\.wiki-document-editor \.bn-editor h1/);
});
