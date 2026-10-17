"use client";

import { Transcript, TranscriptSegmentData } from '@/types';
import { TranscriptView } from '@/components/TranscriptView';
import { VirtualizedTranscriptView } from '@/components/VirtualizedTranscriptView';
import { TranscriptButtonGroup } from './TranscriptButtonGroup';
import { useMemo } from 'react';
import { ChevronDown, FileText } from 'lucide-react';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { slugifyWikiId } from '@/lib/wiki-slug';

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
    }));
  }, [transcripts, usePagination, segments]);

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col bg-card">
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
      <input
        type="text"
        list={listId}
        placeholder={label}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
        value={value}
        onChange={event => onChange(event.target.value)}
      />
      <datalist id={listId}>
        {options.map(option => <option key={option} value={option} />)}
      </datalist>

    </label>
  );
}
