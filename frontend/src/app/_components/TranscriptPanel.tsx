import { useAssistant } from '@/contexts/AssistantContext';
import { DataFlowChip } from '@/components/DataFlowChip';
import { cn } from '@/lib/utils';
import { VirtualizedTranscriptView } from '@/components/VirtualizedTranscriptView';
import { PermissionWarning } from '@/components/PermissionWarning';
import { Button } from '@/components/ui/button';
import { Copy, GlobeIcon, Lightbulb, MessagesSquare, Radio } from 'lucide-react';
import { useTranscripts } from '@/contexts/TranscriptContext';
import { useConfig } from '@/contexts/ConfigContext';
import { useRecordingState } from '@/contexts/RecordingStateContext';
import { usePermissionCheck } from '@/hooks/usePermissionCheck';
import { ModalType } from '@/hooks/useModalState';
import { useIsLinux } from '@/hooks/usePlatform';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/contexts/UiPreferencesContext';

/**
 * TranscriptPanel Component
 *
 * Displays transcript content with controls for copying and language settings.
 * Uses TranscriptContext, ConfigContext, and RecordingStateContext internally.
 */

interface TranscriptPanelProps {
  // indicates stop-processing state for transcripts; derived from backend statuses.
  isProcessingStop: boolean;
  isStopping: boolean;
  showModal: (name: ModalType, message?: string) => void;
  homeStats?: ReactNode;
}

export function TranscriptPanel({
  isProcessingStop,
  isStopping,
  showModal,
  homeStats
}: TranscriptPanelProps) {
  // Contexts
  const { transcripts, transcriptContainerRef, copyTranscript, meetingTitle } = useTranscripts();
  const { transcriptModelConfig } = useConfig();
  const { isRecording, isPaused } = useRecordingState();
  const { checkPermissions, isChecking, hasSystemAudio, hasMicrophone } = usePermissionCheck();
  const isLinux = useIsLinux();
  const { t } = useTranslation();
  const destination = useMemo(() => { try { const value = JSON.parse(localStorage.getItem('meetpulse-recording-context') || '{}'); return [value.client,value.project].filter(Boolean).join(' / '); } catch { return ''; } }, [meetingTitle]);
  const transcriptionLocation = ['localWhisper','parakeet'].includes(transcriptModelConfig.provider) ? 'Local' : `API · ${transcriptModelConfig.provider}`;

  // Convert transcripts to segments for virtualized view
  const segments = useMemo(() =>
    transcripts.map(t => ({
      id: t.id,
      timestamp: t.audio_start_time ?? 0,
      endTime: t.audio_end_time,
      text: t.text,
      confidence: t.confidence,
    })),
    [transcripts]
  );

  const { activeDuration } = useRecordingState();
  const { coach, toggleCoach, toggle, open } = useAssistant();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isRecording) { setElapsed(0); return; }
    if (typeof activeDuration === 'number') setElapsed(Math.floor(activeDuration));
  }, [isRecording, activeDuration]);
  useEffect(() => {
    if (!isRecording || isPaused) return;
    const timer = setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, [isRecording, isPaused]);
  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  return (
    <div ref={transcriptContainerRef} className="flex w-full flex-col overflow-y-auto bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-background/90 px-6 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-5 gap-y-2">
          {isRecording ? (
            <div className="flex items-center gap-2.5">
              <span className={cn('size-2.5 rounded-full', isPaused ? 'bg-warning' : 'animate-pulse bg-recording')} aria-hidden="true" />
              <div className="leading-none">
                <div className="font-mono text-lg font-medium tabular-nums">{clock}</div>
                <div className={cn('mt-1 text-[0.65rem] font-semibold tracking-wider', isPaused ? 'text-warning' : 'text-recording')}>
                  {isPaused ? t('live.paused') : t('live.recording')}
                </div>
              </div>
            </div>
          ) : (
            <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Radio className="size-4" /></span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold tracking-tight">{meetingTitle || t('live.untitled')}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {destination && <span className="truncate">{destination}</span>}
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-medium" title={t('live.engine')}>{transcriptionLocation}</span>
              <DataFlowChip />
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {isRecording && (
              <button
                type="button"
                aria-pressed={coach}
                title={t('live.coachTip')}
                onClick={toggleCoach}
                className={cn('inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[0.8rem] font-medium transition-colors', coach ? 'border-brand bg-accent text-accent-foreground' : 'border-border bg-card hover:bg-muted')}
              >
                <Lightbulb className="size-4" />
                {t('live.coach')}
                <span className={cn('relative h-4 w-7 rounded-full transition-colors', coach ? 'bg-brand' : 'bg-muted-foreground/30')}>
                  <span className={cn('absolute top-0.5 size-3 rounded-full bg-card shadow transition-all', coach ? 'left-3.5' : 'left-0.5')} />
                </span>
              </button>
            )}
            <button
              type="button"
              aria-pressed={open}
              title={t('live.chatTip')}
              onClick={toggle}
              className={cn('inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[0.8rem] font-medium transition-colors', open ? 'border-brand bg-accent text-accent-foreground' : 'border-border bg-card hover:bg-muted')}
            >
              <MessagesSquare className="size-4" />
              {t('live.chat')}
            </button>
            {transcripts?.length > 0 && (
              <Button variant="ghost" size="icon" onClick={copyTranscript} title={t('common.copy')} aria-label={t('common.copy')}>
                <Copy />
              </Button>
            )}
            {transcriptModelConfig.provider === 'localWhisper' && (
              <Button variant="ghost" size="icon" onClick={() => showModal('languageSettings')} title={t('settings.language')} aria-label={t('settings.language')}>
                <GlobeIcon />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Permission Warning - Not needed on Linux */}
      {!isRecording && !isChecking && !isLinux && (
        <div className="flex justify-center px-4 pt-4">
          <PermissionWarning
            hasMicrophone={hasMicrophone}
            hasSystemAudio={hasSystemAudio}
            onRecheck={checkPermissions}
            isRechecking={isChecking}
          />
        </div>
      )}

      {homeStats}

      {/* Transcript content */}
      <div className="pb-32">
        <div className="flex justify-center px-5">
          <div className="w-full max-w-4xl">
            <VirtualizedTranscriptView
              segments={segments}
              isRecording={isRecording}
              isPaused={isPaused}
              isProcessing={isProcessingStop}
              isStopping={isStopping}
              enableStreaming={isRecording}
              showConfidence={true}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
