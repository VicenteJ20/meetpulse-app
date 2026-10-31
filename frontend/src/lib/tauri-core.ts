// Drop-in replacement for '@tauri-apps/api/core' (webpack alias in next.config.js).
// It re-exports the real module and wraps `invoke` so the analytics layer can observe
// user-triggered commands without touching every call site. The real __TAURI_INTERNALS__
// object is frozen, so it cannot be patched in place.
import { invoke as tauriInvoke } from '../../node_modules/@tauri-apps/api/core.js';
import type { InvokeArgs, InvokeOptions } from '../../node_modules/@tauri-apps/api/core.js';

export * from '../../node_modules/@tauri-apps/api/core.js';

export type InvokeReporter = (
  command: string,
  args: InvokeArgs | undefined,
  success: boolean,
  durationMs: number,
) => void;

let reporter: InvokeReporter | null = null;

export function setInvokeReporter(next: InvokeReporter | null): void {
  reporter = next;
}

export function invoke<T>(cmd: string, args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  const result = tauriInvoke<T>(cmd, args, options);
  const report = reporter;
  if (!report) return result;
  const startedAt = Date.now();
  result.then(
    () => report(cmd, args, true, Date.now() - startedAt),
    () => report(cmd, args, false, Date.now() - startedAt),
  );
  return result;
}
