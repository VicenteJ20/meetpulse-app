import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('development and production builds use isolated Next.js output directories', async () => {
  const [nextConfig, gitignore] = await Promise.all([
    readFile(path.join(frontendRoot, 'next.config.js'), 'utf8'),
    readFile(path.join(frontendRoot, '.gitignore'), 'utf8'),
  ]);

  assert.match(nextConfig, /process\.env\.NODE_ENV === 'development'/);
  assert.match(nextConfig, /process\.env\.NEXT_DIST_DIR \|\| \(isDevelopment \? '\.next-dev' : '\.next'\)/);
  assert.match(nextConfig, /distDir: nextOutputDirectory/);
  assert.match(gitignore, /^\/\.next-dev\/$/m);
  assert.match(gitignore, /^\/\.next-validation\/$/m);
});

test('a BlockNote chunk failure preserves access to saved markdown', async () => {
  const [boundary, summaryPanel] = await Promise.all([
    readFile(
      path.join(frontendRoot, 'src/components/MeetingDetails/SummaryEditorErrorBoundary.tsx'),
      'utf8'
    ),
    readFile(path.join(frontendRoot, 'src/components/MeetingDetails/SummaryPanel.tsx'), 'utf8'),
  ]);

  assert.match(boundary, /ChunkLoadError/);
  assert.match(boundary, /Your generated summary remains saved/);
  assert.match(boundary, /window\.location\.reload\(\)/);
  assert.match(boundary, /fallbackMarkdown/);
  assert.match(summaryPanel, /<SummaryEditorErrorBoundary/);
  assert.match(summaryPanel, /fallbackMarkdown=\{/);
});
