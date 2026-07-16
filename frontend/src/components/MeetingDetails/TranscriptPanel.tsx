"use client";

import { Transcript, TranscriptSegmentData } from '@/types';
import { TranscriptView } from '@/components/TranscriptView';
import { VirtualizedTranscriptView } from '@/components/VirtualizedTranscriptView';
import { TranscriptButtonGroup } from './TranscriptButtonGroup';
import { useMemo } from 'react';
import { ChevronDown, FileText } from 'lucide-react';
import { useTranslation } from '@/contexts/UiPreferencesContext';

interface TranscriptPanelProps {
  transcripts: Transcript[];
  customPrompt: string;
  onPromptChange: (value: string) => void;
  client: string;
  project: string;
  tags: string[];
  onClientChange: (value: string) => void;
  onProjectChange: (value: string) => void;
  onCopyTranscript: () => void;
  onOpenMeetingFolder: () => Promise<void>;
  isRecording: boolean;
  disableAutoScroll?: boolean;

  // Optional pagination props (when using virtualization)
  usePagination?: boolean;
  segments?: TranscriptSegmentData[];
  hasMore?: boolean;
  isLoadingMore?: boolean;
  totalCount?: number;
  loadedCount?: number;
  onLoadMore?: () => void;

  // Retranscription props
  meetingId?: string;
  meetingFolderPath?: string | null;
  onRefetchTranscripts?: () => Promise<void>;
}

export function TranscriptPanel({
  transcripts,
  customPrompt,
  onPromptChange,
  client,
  project,
  tags,
  onClientChange,
  onProjectChange,
  onCopyTranscript,
  onOpenMeetingFolder,
  isRecording,
  disableAutoScroll = false,
  usePagination = false,
  segments,
  hasMore,
  isLoadingMore,
  totalCount,
  loadedCount,
  onLoadMore,
  meetingId,
  meetingFolderPath,
  onRefetchTranscripts,
}: TranscriptPanelProps) {
  const { t } = useTranslation();
  // Convert transcripts to segments if pagination is not used but we want virtualization
  const convertedSegments = useMemo(() => {
    if (usePagination && segments) {
      return segments;
    }
    // Convert transcripts to segments for virtualization
    return transcripts.map(t => ({
      id: t.id,
      timestamp: t.audio_start_time ?? 0,
      endTime: t.audio_end_time,
      text: t.text,
      confidence: t.confidence,
    }));
  }, [transcripts, usePagination, segments]);

  return (
    <div className="relative hidden min-w-[320px] max-w-[560px] shrink-0 flex-col border-r border-border bg-card md:flex md:w-[38%] lg:w-[42%] xl:w-[40%]">
      {/* Title area */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-sm font-semibold">{t('meeting.transcript')}</p><p className="mt-0.5 text-xs text-muted-foreground">{usePagination ? (totalCount ?? convertedSegments.length) : convertedSegments.length} segments</p></div>
          <TranscriptButtonGroup
            transcriptCount={usePagination ? (totalCount ?? convertedSegments.length) : (transcripts?.length || 0)}
            onCopyTranscript={onCopyTranscript}
            onOpenMeetingFolder={onOpenMeetingFolder}
            meetingId={meetingId}
            meetingFolderPath={meetingFolderPath}
            onRefetchTranscripts={onRefetchTranscripts}
          />
        </div>
      </div>

      {!isRecording && convertedSegments.length > 0 && (
        <details className="group border-b border-border bg-muted/25">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium">
            <FileText className="h-4 w-4 text-muted-foreground" />
            {t('meeting.details')}
            <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground transition group-open:rotate-180" />
          </summary>
          <div className="space-y-3 px-4 pb-4">
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1.5 text-xs font-medium text-muted-foreground">{t('meeting.client')}<input type="text" placeholder={t('meeting.client')} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground" value={client} onChange={event => onClientChange(event.target.value)} /></label>
              <label className="space-y-1.5 text-xs font-medium text-muted-foreground">{t('meeting.project')}<input type="text" placeholder={t('meeting.project')} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground" value={project} onChange={event => onProjectChange(event.target.value)} /></label>
            </div>
            <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">{t('meeting.context')}<textarea placeholder={t('meeting.contextPlaceholder')} className="min-h-[76px] w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground" value={customPrompt} onChange={event => onPromptChange(event.target.value)} /></label>
            <div><p className="mb-2 text-xs font-medium text-muted-foreground">{t('meeting.tags')}</p>{tags.length > 0 ? <div className="flex flex-wrap gap-1.5">{tags.map(tag => <span key={tag} className="rounded-full border border-brand/20 bg-brand/8 px-2.5 py-1 text-xs text-brand">{tag}</span>)}</div> : <p className="text-xs text-muted-foreground">{t('meeting.noTags')}</p>}</div>
          </div>
        </details>
      )}

      {/* Transcript content - use virtualized view for better performance */}
      <div className="flex-1 overflow-hidden pb-4">
        <VirtualizedTranscriptView
          segments={convertedSegments}
          isRecording={isRecording}
          isPaused={false}
          isProcessing={false}
          isStopping={false}
          enableStreaming={false}
          showConfidence={true}
          disableAutoScroll={disableAutoScroll}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          totalCount={totalCount}
          loadedCount={loadedCount}
          onLoadMore={onLoadMore}
        />
      </div>

    </div>
  );
}
