'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { appDataDir, join } from '@tauri-apps/api/path';
import { Pause, Play, Radio, Square } from 'lucide-react';
import { toast } from 'sonner';
import { useRecordingState } from '@/contexts/RecordingStateContext';
import { useTranscripts } from '@/contexts/TranscriptContext';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { recordingService } from '@/services/recordingService';
import { Button } from '@/components/ui/button';

/** Capture belongs to the app, so browsing a cited meeting must retain its controls. */
export function GlobalRecordingControls() {
  const { isRecording, isPaused } = useRecordingState();
  const { meetingTitle } = useTranscripts();
  const { locale } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const es = locale === 'es';
  if (!isRecording || pathname === '/') return null;
  async function control(stop = false) {
    if (busy) return;
    setBusy(true);
    try {
      if (stop) {
        const path = await join(await appDataDir(), `recording-${Date.now()}.wav`);
        // The existing global post-processing provider handles the native stop-complete event.
        await recordingService.stopRecording(path);
      } else if (isPaused) await recordingService.resumeRecording();
      else await recordingService.pauseRecording();
    } catch (error) { toast.error(String(error)); }
    finally { setBusy(false); }
  }
  return <section role="region" aria-label={es ? 'Controles de grabación' : 'Recording controls'} className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2">
    <Radio size={16} className="shrink-0 text-recording"/>
    <span className="min-w-0 flex-1 truncate text-sm font-medium">{meetingTitle}</span>
    <Button size="sm" variant="ghost" onClick={() => router.push('/')}>{es ? 'Volver al vivo' : 'Back to live'}</Button>
    <Button size="sm" variant="outline" disabled={busy} onClick={() => void control()}>{isPaused ? <Play size={14}/> : <Pause size={14}/>} {isPaused ? (es ? 'Reanudar' : 'Resume') : (es ? 'Pausar' : 'Pause')}</Button>
    <Button size="sm" variant="outline" className="border-destructive/30 text-destructive" disabled={busy} onClick={() => void control(true)}><Square size={14}/>{es ? 'Detener' : 'Stop'}</Button>
  </section>;
}
