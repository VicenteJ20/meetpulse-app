#!/usr/bin/env node

/**
 * Development-only Next.js launcher for Tauri.
 *
 * A force-terminated Next process can leave an incomplete `.next` manifest.
 * Tauri then reaches the port while Webpack still references chunks from that
 * stale manifest, producing `ChunkLoadError: app/layout`. Start every Tauri
 * development session from a clean cache and forward shutdown signals to Next.
 */
const { rmSync } = require('fs');
const { join } = require('path');
const { spawn } = require('child_process');

const projectRoot = join(__dirname, '..');
const nextCache = join(projectRoot, '.next');

try {
  rmSync(nextCache, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  console.log('[tauri-dev] Cleared stale .next cache.');
} catch (error) {
  console.error('[tauri-dev] Could not clear .next cache:', error);
  process.exit(1);
}

const nextBin = join(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
const child = spawn(process.execPath, [nextBin, 'dev', '-H', '127.0.0.1', '-p', '3118'], {
  cwd: projectRoot,
  env: process.env,
  stdio: 'inherit',
});

const stopChild = (signal) => {
  if (!child.killed) child.kill(signal);
};

process.on('SIGINT', () => stopChild('SIGINT'));
process.on('SIGTERM', () => stopChild('SIGTERM'));
child.on('error', (error) => {
  console.error('[tauri-dev] Failed to start Next.js:', error);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
