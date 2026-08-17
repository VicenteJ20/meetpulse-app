"use client";
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Summary, SummaryResponse, Transcript } from '@/types';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import Analytics from '@/lib/analytics';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { TranscriptPanel } from '@/components/MeetingDetails/TranscriptPanel';
import { SummaryPanel } from '@/components/MeetingDetails/SummaryPanel';
import { ModelConfig } from '@/components/ModelSettingsModal';

// Custom hooks
import { useMeetingData } from '@/hooks/meeting-details/useMeetingData';
import { useSummaryGeneration } from '@/hooks/meeting-details/useSummaryGeneration';
import { useTemplates } from '@/hooks/meeting-details/useTemplates';
import { useCopyOperations } from '@/hooks/meeting-details/useCopyOperations';
import { useMeetingOperations } from '@/hooks/meeting-details/useMeetingOperations';
import { useConfig } from '@/contexts/ConfigContext';
import { getWikiLastDestination } from '@/services/wiki-config';
import { useWikiPublish } from '@/hooks/meeting-details/useWikiPublish';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CalendarDays } from 'lucide-react';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { useRouter } from 'next/navigation';
import { slugifyWikiId } from '@/lib/wiki-slug';

interface TranscriptPage {
  transcripts: Transcript[];
  total_count: number;
}

async function loadCompleteTranscript(meetingId: string): Promise<Transcript[]> {
  const firstPage = await invoke<TranscriptPage>('api_get_meeting_transcripts', {
    meetingId,
    limit: 1,
    offset: 0,
  });
  if (!firstPage.total_count) return [];
  if (firstPage.total_count === 1) return firstPage.transcripts;
  const complete = await invoke<TranscriptPage>('api_get_meeting_transcripts', {
    meetingId,
    limit: firstPage.total_count,
    offset: 0,
  });
  return complete.transcripts;
}

function transcriptMarkdown(title: string, createdAt: string | undefined, transcripts: Transcript[]): string {
  const formatTime = (transcript: Transcript) => {
    if (transcript.audio_start_time === undefined) return transcript.timestamp;
    const totalSeconds = Math.floor(transcript.audio_start_time);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;
  };
  const date = createdAt ? new Date(createdAt).toISOString() : new Date().toISOString();
  const body = transcripts.map(transcript => `${formatTime(transcript)} ${transcript.text.trim()}`).join('\n');
  return `# Transcripción: ${title}\n\n## Fecha\n\n${date}\n\n## Contenido\n\n${body}\n`;
}

export default function PageContent({
  meeting,
  summaryData,
  shouldAutoGenerate = false,
  onAutoGenerateComplete,
  onMeetingUpdated,
  onRefetchTranscripts,
  // Pagination props for efficient transcript loading
  segments,
  hasMore,
  isLoadingMore,
  totalCount,
  loadedCount,
  onLoadMore,
}: {
  meeting: any;
  summaryData: Summary | null;
  shouldAutoGenerate?: boolean;
  onAutoGenerateComplete?: () => void;
  onMeetingUpdated?: () => Promise<void>;
  onRefetchTranscripts?: () => Promise<void>;
  // Pagination props
  segments?: any[];
  hasMore?: boolean;
  isLoadingMore?: boolean;
  totalCount?: number;
  loadedCount?: number;
  onLoadMore?: () => void;
}) {
  console.log('📄 PAGE CONTENT: Initializing with data:', {
    meetingId: meeting.id,
    summaryDataKeys: summaryData ? Object.keys(summaryData) : null,
    transcriptsCount: meeting.transcripts?.length
  });

  // State
  const lastWikiDestination = typeof window === 'undefined' ? null : getWikiLastDestination();
  const [customPrompt, setCustomPrompt] = useState<string>(meeting.additional_context || '');
  const [client, setClient] = useState<string>(meeting.client || lastWikiDestination?.clientId || '');
  const [project, setProject] = useState<string>(meeting.project || lastWikiDestination?.projectId || '');
  const [isRecording] = useState(false);
  const [summaryResponse] = useState<SummaryResponse | null>(null);
  const { serverAddress, refetchMeetings } = useSidebar();
  const { t, formatDate } = useTranslation();
  const router = useRouter();

  useEffect(() => {
    const lastDestination = getWikiLastDestination();
    setClient(meeting.client || lastDestination?.clientId || '');
    setProject(meeting.project || lastDestination?.projectId || '');
    setCustomPrompt(meeting.additional_context || '');
  }, [meeting.id, meeting.client, meeting.project, meeting.additional_context]);

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      try {
        await invoke('api_save_meeting_metadata', {
          meetingId: meeting.id,
          client: slugifyWikiId(client) || client,
          project: slugifyWikiId(project) || project,
          additionalContext: customPrompt,
        });
        // Keep the client/project hierarchy in Meeting Notes in sync as soon
        // as the user changes either field.
        await refetchMeetings();
      } catch (error) {
        console.error('Failed to auto-save meeting metadata:', error);
      }
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [meeting.id, client, project, customPrompt, refetchMeetings]);

  const analysisContext = [
    client.trim() ? `Client: ${client.trim()}` : '',
    project.trim() ? `Project: ${project.trim()}` : '',
    customPrompt.trim() ? `Additional context:\n${customPrompt.trim()}` : '',
  ].filter(Boolean).join('\n\n');

  // Ref to store the modal open function from SummaryGeneratorButtonGroup
  const openModelSettingsRef = useRef<(() => void) | null>(null);

  // Get model config from ConfigContext
  const { modelConfig, setModelConfig } = useConfig();

  // Custom hooks
  const meetingData = useMeetingData({ meeting, summaryData, onMeetingUpdated });
  const templates = useTemplates();

  // Callback to register the modal open function
  const handleRegisterModalOpen = (openFn: () => void) => {
    console.log('📝 Registering modal open function in PageContent');
    openModelSettingsRef.current = openFn;
  };

  // Callback to trigger modal open (called from error handler)
  const handleOpenModelSettings = () => {
    console.log('🔔 Opening model settings from PageContent');
    if (openModelSettingsRef.current) {
      openModelSettingsRef.current();
    } else {
      console.warn('⚠️ Modal open function not yet registered');
    }
  };

  // Save model config to backend database and sync via event
  const handleSaveModelConfig = async (config?: ModelConfig) => {
    if (!config) return;
    try {
      await invoke('api_save_model_config', {
        provider: config.provider,
        model: config.model,
        whisperModel: config.whisperModel,
        apiKey: config.apiKey ?? null,
        ollamaEndpoint: config.ollamaEndpoint ?? null,
      });

      // Emit event so ConfigContext and other listeners stay in sync
      const { emit } = await import('@tauri-apps/api/event');
      await emit('model-config-updated', config);

      toast.success('Model settings saved successfully');
    } catch (error) {
      console.error('Failed to save model config:', error);
      toast.error('Failed to save model settings');
    }
  };

  const getWikiMarkdown = useCallback(async () => {
    const live = await meetingData.blockNoteSummaryRef.current?.getMarkdown?.() || '';
    if (live) return live;
    if (meetingData.aiSummary && 'markdown' in meetingData.aiSummary) {
      return (meetingData.aiSummary as { markdown?: string }).markdown || '';
    }
    return '';
  }, [meetingData.aiSummary, meetingData.blockNoteSummaryRef]);

  const getWikiRawMarkdown = useCallback(async () => {
    const completeTranscript = await loadCompleteTranscript(meeting.id);
    const title = meetingData.meetingTitle.trim() || meeting.title;
    return transcriptMarkdown(title, meeting.created_at, completeTranscript);
  }, [meeting.id, meeting.title, meeting.created_at, meetingData.meetingTitle]);

  const wikiPublish = useWikiPublish({
    meeting,
    meetingTitle: meetingData.meetingTitle,
    client,
    project,
    getMarkdown: getWikiMarkdown,
    getRawMarkdown: getWikiRawMarkdown,
  });

  const summaryGeneration = useSummaryGeneration({
    meeting,
    transcripts: meetingData.transcripts,
    modelConfig: modelConfig,
    isModelConfigLoading: false, // ConfigContext loads on mount
    selectedTemplate: templates.selectedTemplate,
    onMeetingUpdated,
    updateMeetingTitle: meetingData.updateMeetingTitle,
    setAiSummary: meetingData.setAiSummary,
    onOpenModelSettings: handleOpenModelSettings,
    onSummaryCompleted: async ({ title, markdown }) => {
      if (title) meetingData.updateMeetingTitle(title);
      await wikiPublish.publishAfterAnalysis({ title, markdown });
    },
  });

  const copyOperations = useCopyOperations({
    meeting,
    transcripts: meetingData.transcripts,
    meetingTitle: meetingData.meetingTitle,
    aiSummary: meetingData.aiSummary,
    blockNoteSummaryRef: meetingData.blockNoteSummaryRef,
  });

  const meetingOperations = useMeetingOperations({
    meeting,
  });

  // Track page view
  useEffect(() => {
    Analytics.trackPageView('meeting_details');
  }, []);

  // Auto-generate summary when flag is set
  useEffect(() => {
    let cancelled = false;

    const autoGenerate = async () => {
      if (shouldAutoGenerate && meetingData.transcripts.length > 0 && !cancelled) {
        console.log(`🤖 Auto-generating summary with ${modelConfig.provider}/${modelConfig.model}...`);
        await summaryGeneration.handleGenerateSummary(analysisContext);

        // Notify parent that auto-generation is complete (only if not cancelled)
        if (onAutoGenerateComplete && !cancelled) {
          onAutoGenerateComplete();
        }
      }
    };

    autoGenerate();

    // Cleanup: cancel if component unmounts or meeting changes
    return () => {
      cancelled = true;
    };
  }, [shouldAutoGenerate, meeting.id]); // Re-run if meeting changes

  return (
    <>
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="flex h-screen flex-col bg-background"
    >
      <header className="flex shrink-0 items-center justify-between gap-5 border-b border-border bg-card/90 px-5 py-3 backdrop-blur">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-lg font-semibold tracking-[-0.02em]">{meetingData.meetingTitle || meeting.title}</h1>
            {(client || project) && <span className="hidden truncate rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground lg:inline">{[client, project].filter(Boolean).join(' / ')}</span>}
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />{meeting.created_at ? formatDate(meeting.created_at, { dateStyle: 'medium', timeStyle: 'short' }) : t('meeting.details')}</p>
        </div>
        <div className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground">
          {t((
            {
              draft: 'meeting.wikiStatus.draft',
              publishing: 'meeting.wikiStatus.publishing',
              published: 'meeting.wikiStatus.published',
              curating: 'meeting.wikiStatus.curating',
              curated: 'meeting.wikiStatus.curated',
              conflict: 'meeting.wikiStatus.conflict',
              diverged: 'meeting.wikiStatus.diverged',
              error: 'meeting.wikiStatus.error',
            } as const
          )[wikiPublish.status])}
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <TranscriptPanel
          transcripts={meetingData.transcripts}
          customPrompt={customPrompt}
          onPromptChange={setCustomPrompt}
          client={client}
          project={project}
          clientOptions={wikiPublish.clients.map(item => item.client_id)}
          projectOptions={wikiPublish.projects.map(item => item.project_id)}
          tags={meeting.tags || []}
          onClientChange={setClient}
          onProjectChange={setProject}
          onCopyTranscript={copyOperations.handleCopyTranscript}
          onOpenMeetingFolder={meetingOperations.handleOpenMeetingFolder}
          isRecording={isRecording}
          disableAutoScroll={true}
          // Pagination props for efficient loading
          usePagination={true}
          segments={segments}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          totalCount={totalCount}
          loadedCount={loadedCount}
          onLoadMore={onLoadMore}
          // Retranscription props
          meetingId={meeting.id}
          meetingFolderPath={meeting.folder_path}
          onRefetchTranscripts={onRefetchTranscripts}
        />
        <SummaryPanel
          meeting={meeting}
          meetingTitle={meetingData.meetingTitle}
          onTitleChange={meetingData.handleTitleChange}
          isEditingTitle={meetingData.isEditingTitle}
          onStartEditTitle={() => meetingData.setIsEditingTitle(true)}
          onFinishEditTitle={() => meetingData.setIsEditingTitle(false)}
          isTitleDirty={meetingData.isTitleDirty}
          summaryRef={meetingData.blockNoteSummaryRef}
          isSaving={meetingData.isSaving}
          onSaveAll={meetingData.saveAllChanges}
          onCopySummary={copyOperations.handleCopySummary}
          onOpenFolder={meetingOperations.handleOpenMeetingFolder}
          aiSummary={meetingData.aiSummary}
          summaryStatus={summaryGeneration.summaryStatus}
          transcripts={meetingData.transcripts}
          modelConfig={modelConfig}
          setModelConfig={setModelConfig}
          onSaveModelConfig={handleSaveModelConfig}
          onGenerateSummary={summaryGeneration.handleGenerateSummary}
          onStopGeneration={summaryGeneration.handleStopGeneration}
          customPrompt={analysisContext}
          summaryResponse={summaryResponse}
          onSaveSummary={meetingData.handleSaveSummary}
          onSummaryChange={meetingData.handleSummaryChange}
          onDirtyChange={meetingData.setIsSummaryDirty}
          summaryError={summaryGeneration.summaryError}
          onRegenerateSummary={summaryGeneration.handleRegenerateSummary}
          getSummaryStatusMessage={summaryGeneration.getSummaryStatusMessage}
          availableTemplates={templates.availableTemplates}
          selectedTemplate={templates.selectedTemplate}
          onTemplateSelect={templates.handleTemplateSelection}
          isModelConfigLoading={false}
          onOpenModelSettings={handleRegisterModalOpen}
          wikiStatus={wikiPublish.status}
          onRetryWiki={() => { void wikiPublish.retryPublish(); }}
          onOpenWiki={() => router.push('/wiki')}
        />
      </div>
    </motion.div>
    <Dialog open={wikiPublish.destinationOpen} onOpenChange={wikiPublish.setDestinationOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('meeting.wikiDestination')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{wikiPublish.selectedTenant ? t('meeting.wikiNeedsClientProject') : t('meeting.wikiDestinationDescription')}</p>
          {!wikiPublish.selectedTenant && (
          <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
            {t('meeting.wikiWorkspace')}
            <select value={wikiPublish.selectedTenant} onChange={event => wikiPublish.setSelectedTenant(event.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground">
              {wikiPublish.tenants.map(tenant => <option key={tenant.tenant_id} value={tenant.tenant_id}>{tenant.display_name || tenant.tenant_id} · {tenant.role === 'owner' ? t('wiki.owner') : t('wiki.guest')}</option>)}
            </select>
          </label>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              {t('meeting.client')}
              <input list="wiki-destination-clients" value={client} onChange={event => setClient(event.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" />
              <datalist id="wiki-destination-clients">{wikiPublish.clients.map(item => <option key={item.client_id} value={item.client_id} />)}</datalist>
              <span className="block font-normal text-[11px]">{t('meeting.wikiSlugPreview').replace('{id}', slugifyWikiId(client) || '—')}</span>
            </label>
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              {t('meeting.project')}
              <input list="wiki-destination-projects" value={project} onChange={event => setProject(event.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" />
              <datalist id="wiki-destination-projects">{wikiPublish.projects.map(item => <option key={item.project_id} value={item.project_id} />)}</datalist>
              <span className="block font-normal text-[11px]">{t('meeting.wikiSlugPreview').replace('{id}', slugifyWikiId(project) || '—')}</span>
            </label>
          </div>
        </div>
        <DialogFooter>
          <button onClick={() => wikiPublish.setDestinationOpen(false)} className="rounded-md border px-3 py-2 text-sm">{t('common.cancel')}</button>
          <button onClick={() => { wikiPublish.confirmDestination(); }} disabled={!wikiPublish.destination.ready || wikiPublish.isPublishing} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">{t('meeting.wikiPublishNow')}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
