"use client";
import { useRef, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/contexts/UiPreferencesContext";
import type { ReportSnapshot } from "@/lib/pdf/branding";
import type { Transcript } from "@/types";

export function PdfExports({
  meeting,
  getAnalysis,
}: {
  meeting: {
    id: string;
    title: string;
    created_at?: string;
    client?: string;
    project?: string;
  };
  getAnalysis: () => Promise<string>;
}) {
  const { locale, formatDate } = useTranslation();
  const [busy, setBusy] = useState(false);
  const worker = useRef<Worker>();
  useEffect(() => () => worker.current?.terminate(), []);
  async function exportPdf(kind: ReportSnapshot["kind"]) {
    setBusy(true);
    try {
      const snapshot: ReportSnapshot = {
        kind,
        locale,
        title: meeting.title,
        date: meeting.created_at
          ? formatDate(meeting.created_at, {
              dateStyle: "long",
              timeStyle: "short",
            })
          : "",
        client: meeting.client,
        project: meeting.project,
        assetBase: `${location.origin}/`,
      };
      if (kind === "analysis") {
        snapshot.markdown = await getAnalysis();
        if (!snapshot.markdown.trim())
          throw new Error(
            locale === "es"
              ? "Genera o escribe un análisis primero."
              : "Generate or write an analysis first.",
          );
      } else {
        const segments: Transcript[] = [];
        let offset = 0;
        while (true) {
          const page = await invoke<{
            transcripts: Transcript[];
            has_more: boolean;
          }>("api_get_meeting_transcripts", {
            meetingId: meeting.id,
            limit: 500,
            offset,
          });
          segments.push(...page.transcripts);
          offset += page.transcripts.length;
          if (!page.has_more || !page.transcripts.length) break;
        }
        if (!segments.length)
          throw new Error(
            locale === "es"
              ? "No hay transcripción."
              : "No transcript available.",
          );
        snapshot.segments = segments.map((s) => ({
          text: s.text,
          start: s.audio_start_time,
        }));
      }
      const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
        const w = new Worker(
          new URL("../../lib/pdf/report.worker.ts", import.meta.url),
        );
        worker.current = w;
        w.onmessage = ({ data }) => {
          if (data.ready) {
            w.postMessage(snapshot);
            return;
          }
          w.terminate();
          data.error ? reject(new Error(data.error)) : resolve(data.buffer);
        };
        w.onerror = (e) => {
          w.terminate();
          reject(new Error(e.message));
        };
      });
      const title = meeting.title
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9_-]+/g, "_")
        .slice(0, 90);
      const saved = await invoke<string | null>("desktop_save_pdf", {
        filename: `${(meeting.created_at || new Date().toISOString()).slice(0, 10)}_${title}_${kind === "analysis" ? "analisis" : "transcripcion"}.pdf`,
        bytes: Array.from(new Uint8Array(bytes)),
      });
      if (saved) toast.success(locale === "es" ? "PDF guardado" : "PDF saved");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      {(["transcript", "analysis"] as const).map((kind) => (
        <Button
          key={kind}
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void exportPdf(kind)}
        >
          <FileDown size={15} />
          {kind === "transcript"
            ? locale === "es"
              ? "Transcripción PDF"
              : "Transcript PDF"
            : locale === "es"
              ? "Análisis PDF"
              : "Analysis PDF"}
        </Button>
      ))}
    </div>
  );
}
