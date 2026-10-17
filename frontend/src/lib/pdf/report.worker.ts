import type { ReportSnapshot } from "./branding";
const scope = globalThis as unknown as {
  onmessage: (e: MessageEvent<ReportSnapshot>) => void;
  postMessage: (v: unknown, transfer?: Transferable[]) => void;
};
scope.onmessage = async ({ data }) => {
  try {
    const [{ pdf }, { buildReport }] = await Promise.all([
      import("@react-pdf/renderer"),
      import("./templates"),
    ]);
    const buffer = await (await pdf(buildReport(data)).toBlob()).arrayBuffer();
    scope.postMessage({ buffer }, [buffer]);
  } catch (error) {
    scope.postMessage({ error: String(error) });
  }
};
// Webpack loads worker dependencies asynchronously: do not lose the first request.
scope.postMessage({ ready: true });
