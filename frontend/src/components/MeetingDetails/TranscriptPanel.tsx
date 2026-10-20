"use client";

import { SuggestInput } from '@/components/ui/suggest-input';
import { Transcript, TranscriptSegmentData } from '@/types';
import { TranscriptView } from '@/components/TranscriptView';
import { VirtualizedTranscriptView } from '@/components/VirtualizedTranscriptView';
import { TranscriptButtonGroup } from './TranscriptButtonGroup';
import { useEffect, useMemo } from 'react';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { publishMeetingTranscript } from '@/lib/meeting-transcript-bus';

interface TranscriptPanelProps {
  transcripts: Transcript[];
  customPrompt: string;
  onPromptChange: (value: string) => void;
  client: string;
  project: string;
  clientOptions?: string[];
  projectOptions?: string[];
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
  clientOptions = [],
  projectOptions = [],
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
      speaker: t.speaker,
    }));
  }, [transcripts, usePagination, segments]);

  useEffect(() => {
    publishMeetingTranscript(convertedSegments.map((segment) => ({
      id: segment.id,
      text: segment.text,
      start: segment.timestamp,
    })));
  }, [convertedSegments]);

  useEffect(() => () => publishMeetingTranscript([]), []);

  const total = usePagination ? (totalCount ?? convertedSegments.length) : convertedSegments.length;

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col bg-card">
      <div className="flex min-h-[52px] shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <div className="shrink-0">
          <h2 className="whitespace-nowrap text-sm font-semibold tracking-tight">{t('meeting.transcript')}</h2>
        </div>
        <span className="hidden whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground md:inline">{t('meeting.segments').replace('{n}', String(total))}</span>
        <div className="ml-auto">
        <TranscriptButtonGroup
          transcriptCount={total}
          onCopyTranscript={onCopyTranscript}
          onOpenMeetingFolder={onOpenMeetingFolder}
          meetingId={meetingId}
          meetingFolderPath={meetingFolderPath}
          onRefetchTranscripts={onRefetchTranscripts}
        />
        </div>
      </div>

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

function MeetingMetadataField({
  label,
  value,
  options,
  listId,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  listId: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
      {label}
      <SuggestInput
        placeholder={label}
        value={value}
        onValueChange={onChange}
        options={options}
      />

    </label>
  );
}
