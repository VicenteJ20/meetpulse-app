import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const variableFragments = Array.from({ length: 160 }, (_, index) => {
  const sentence = index % 3 === 0
    ? 'Esta es una intervención extensa en español con algunas phrases in English para comprobar el ajuste de línea.'
    : 'Short bilingual chunk para validar alturas variables.';
  return {
    id: `segment-${index}`,
    text: Array.from({ length: (index % 9) + 1 }, () => sentence).join(' '),
  };
});

test('long live transcripts retain stable virtual-row invariants', async () => {
  const component = await readFile(
    path.join(frontendRoot, 'src/components/VirtualizedTranscriptView.tsx'),
    'utf8'
  );
  const streamingHook = await readFile(
    path.join(frontendRoot, 'src/hooks/useTranscriptStreaming.ts'),
    'utf8'
  );

  assert.equal(variableFragments.length, 160);
  assert.ok(variableFragments.some(fragment => fragment.text.length > 700));
  assert.match(component, /const VIRTUALIZATION_THRESHOLD = 1/);
  assert.match(component, /getItemKey:\s*\(index\) => segments\[index\]\?\.id/);
  assert.match(component, /estimateTranscriptSegmentHeight\(segments\[index\]\?\.text/);
  assert.match(component, /ref=\{virtualizer\.measureElement\}/);
  assert.doesNotMatch(component, /useAnimationFrameWithResizeObserver:\s*true/);
  assert.doesNotMatch(component, /startTransition|useReducer/);
  assert.doesNotMatch(streamingHook, /setInterval|visibleText|substring/);
  assert.match(streamingHook, /getDisplayText:.*=> segment\.text/);
});

test('row spacing is included in each measured element', async () => {
  const component = await readFile(
    path.join(frontendRoot, 'src/components/VirtualizedTranscriptView.tsx'),
    'utf8'
  );

  assert.match(component, /id=\{`segment-\$\{id\}`\} className="pb-3"/);
  assert.doesNotMatch(component, /id=\{`segment-\$\{id\}`\} className="mb-3"/);
  assert.match(component, /border-transparent bg-transparent/);
});

test('160 variable fragments produce monotonic, non-overlapping estimated offsets', async () => {
  const layoutSource = await readFile(
    path.join(frontendRoot, 'src/lib/transcriptLayout.ts'),
    'utf8'
  );
  const lineHeight = Number(layoutSource.match(/TRANSCRIPT_LINE_HEIGHT_PX = (\d+)/)?.[1]);
  const rowChrome = Number(layoutSource.match(/TRANSCRIPT_ROW_CHROME_PX = (\d+)/)?.[1]);
  const charactersPerLine = Number(
    layoutSource.match(/TRANSCRIPT_ESTIMATED_CHARACTERS_PER_LINE = (\d+)/)?.[1]
  );
  const estimateTranscriptSegmentHeight = (text) => {
    const lines = Math.max(1, Math.ceil(Math.max(1, text.length) / charactersPerLine));
    return rowChrome + lines * lineHeight;
  };

  assert.match(layoutSource, /Math\.ceil\(Math\.max\(1, text\.length\) \/ TRANSCRIPT_ESTIMATED_CHARACTERS_PER_LINE\)/);
  assert.ok(Number.isFinite(lineHeight));
  assert.ok(Number.isFinite(rowChrome));
  assert.ok(Number.isFinite(charactersPerLine));

  let previousBottom = 0;

  for (const fragment of variableFragments) {
    const top = previousBottom;
    const height = estimateTranscriptSegmentHeight(fragment.text);
    const bottom = top + height;

    assert.ok(height >= 60);
    assert.ok(top >= previousBottom);
    assert.ok(bottom > top);
    previousBottom = bottom;
  }

  assert.ok(previousBottom > 20_000);
  assert.ok(
    estimateTranscriptSegmentHeight(variableFragments.at(-1).text) >
      estimateTranscriptSegmentHeight('Short chunk')
  );
});
