#!/usr/bin/env node

/**
 * Development-only Next.js launcher for Tauri.
 *
 * Tauri considers a dev server ready as soon as its port accepts connections.
 * Next, however, can still be compiling app/layout.js after a clean .next
 * cache. Starting Next behind an internal port lets us expose Tauri's port
 * only after both the root route and layout chunk are actually available.
 */
const http = require('http');
const net = require('net');
const { rmSync } = require('fs');
const { join } = require('path');
const { spawn } = require('child_process');

const projectRoot = join(__dirname, '..');
const nextCache = join(projectRoot, '.next');
const tauriPort = 3118;
const nextPort = 3119;
let proxy;

try {
  rmSync(nextCache, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  console.log('[tauri-dev] Cleared stale .next cache.');
} catch (error) {
  console.error('[tauri-dev] Could not clear .next cache:', error);
  process.exit(1);
}

const nextBin = join(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
const child = spawn(process.execPath, [nextBin, 'dev', '-H', '127.0.0.1', '-p', String(nextPort)], {
  cwd: projectRoot,
  env: process.env,
  stdio: 'inherit',
});

function request(pathname) {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port: nextPort, path: pathname, timeout: 15_000 }, (response) => {
      response.resume();
      response.statusCode === 200 ? resolve() : reject(new Error(`HTTP ${response.statusCode} for ${pathname}`));
    });
    request.on('timeout', () => request.destroy(new Error(`Timed out waiting for ${pathname}`)));
    request.on('error', reject);
  });
}

async function waitForNext() {
  const deadline = Date.now() + 90_000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      await request('/');
      await request('/_next/static/chunks/app/layout.js');
      return;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  throw new Error(`Next.js did not finish compiling within 90 seconds: ${lastError?.message ?? 'unknown error'}`);
}

function startProxy() {
  proxy = http.createServer((clientRequest, clientResponse) => {
    const upstreamRequest = http.request({
      host: '127.0.0.1',
      port: nextPort,
      method: clientRequest.method,
      path: clientRequest.url,
      headers: { ...clientRequest.headers, host: `127.0.0.1:${nextPort}` },
    }, (upstreamResponse) => {
      clientResponse.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(clientResponse);
    });

    upstreamRequest.on('error', (error) => {
      if (!clientResponse.headersSent) clientResponse.writeHead(502);
      clientResponse.end(`Next.js proxy error: ${error.message}`);
    });
    clientRequest.pipe(upstreamRequest);
  });

  // Forward Next's HMR WebSocket as well, so hot reload continues to work.
  proxy.on('upgrade', (request, socket, head) => {
    const upstream = net.connect(nextPort, '127.0.0.1', () => {
      const headers = [];
      for (let index = 0; index < request.rawHeaders.length; index += 2) {
        const name = request.rawHeaders[index];
        const value = name.toLowerCase() === 'host' ? `127.0.0.1:${nextPort}` : request.rawHeaders[index + 1];
        headers.push(`${name}: ${value}`);
      }
      upstream.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n${headers.join('\r\n')}\r\n\r\n`);
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on('error', () => socket.destroy());
  });

  proxy.listen(tauriPort, '127.0.0.1', () => {
    console.log(`[tauri-dev] Next is ready; Tauri can now load http://127.0.0.1:${tauriPort}.`);
  });
  proxy.on('error', (error) => {
    console.error(`[tauri-dev] Could not expose port ${tauriPort}:`, error);
    stopChild('SIGTERM');
    process.exitCode = 1;
  });
}

function stopChild(signal) {
  proxy?.close();
  if (!child.killed) child.kill(signal);
}

process.on('SIGINT', () => stopChild('SIGINT'));
process.on('SIGTERM', () => stopChild('SIGTERM'));
child.on('error', (error) => {
  console.error('[tauri-dev] Failed to start Next.js:', error);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  proxy?.close();
  process.exitCode = code ?? (signal ? 1 : 0);
});

waitForNext()
  .then(startProxy)
  .catch((error) => {
    console.error('[tauri-dev] Next.js readiness check failed:', error.message);
    stopChild('SIGTERM');
    process.exitCode = 1;
  });
