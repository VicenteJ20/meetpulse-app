"use client";
import { SuggestInput } from '@/components/ui/suggest-input';
import { useState, useEffect, useRef, useCallback } from 'react';
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
import { desktopCapabilities } from '@/config/capabilities';
import { getWikiLastDestination } from '@/services/wiki-config';
import { useWikiPublish } from '@/hooks/meeting-details/useWikiPublish';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AssistantButton, LiveAssistantDockHost, useAssistant, useAssistantTarget } from '@/contexts/AssistantContext';
import { ResizeHandle } from '@/components/ui/resize-handle';
import { PdfExports } from '@/components/MeetingDetails/PdfExports';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { Segmented } from '@/components/ui/segmented';
import { SelectField } from '@/components/ui/select-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MeetingMetaPopover } from '@/components/MeetingDetails/MeetingMetaPopover';
import { DataFlowChip } from '@/components/DataFlowChip';
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
  const body = transcripts.map(transcript => `${formatTime(transcript)}${transcript.speaker === 'me' ? ' [Usuario]' : transcript.speaker === 'team' ? ' [Equipo]' : ''} ${transcript.text.trim()}`).join('\n');
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

  const { locale } = useTranslation();
  const [view, setView] = useState<'analysis' | 'transcript' | 'split'>('split');
  const { open: assistantOpen } = useAssistant();
  // Ancho de las columnas de transcripción y chat: se recuerda por dispositivo.
  const [columns, setColumns] = useState({ transcript: 460, chat: 380 });
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('meetpulse-meeting-columns') || '{}');
      setColumns(current => ({ transcript: Number(saved.transcript) || current.transcript, chat: Number(saved.chat) || current.chat }));
    } catch {}
  }, []);
  const resizeColumn = (key: 'transcript' | 'chat', value: number) => setColumns(current => {
    const next = { ...current, [key]: value };
    try { localStorage.setItem('meetpulse-meeting-columns', JSON.stringify(next)); } catch {}
    return next;
  });
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1200px)');
    const wantsSource = new URLSearchParams(window.location.search).has('sourceTime');
    const adapt = () => setView(current => query.matches ? 'split' : current === 'split' ? (wantsSource ? 'transcript' : 'analysis') : current);
    adapt();
    query.addEventListener('change', adapt);
    const showSource = () => setView(query.matches ? 'split' : 'transcript');
    window.addEventListener('meetpulse-source', showSource);
    return () => { query.removeEventListener('change', adapt); window.removeEventListener('meetpulse-source', showSource); };
  }, []);
  // State
  const lastWikiDestination = !desktopCapabilities.wikiEnabled || typeof window === 'undefined' ? null : getWikiLastDestination();
  const [customPrompt, setCustomPrompt] = useState<string>(meeting.additional_context || '');
  const [client, setClient] = useState<string>(meeting.client || lastWikiDestination?.clientId || '');
  const [project, setProject] = useState<string>(meeting.project || lastWikiDestination?.projectId || '');
  const [isRecording] = useState(false);
  const [summaryResponse] = useState<SummaryResponse | null>(null);
  const { serverAddress, refetchMeetings, meetings } = useSidebar();
  const { t, formatDate } = useTranslation();
  const router = useRouter();

  useEffect(() => {
    const lastDestination = desktopCapabilities.wikiEnabled ? getWikiLastDestination() : null;
    setClient(meeting.client || lastDestination?.clientId || '');
    setProject(meeting.project || lastDestination?.projectId || '');
    setCustomPrompt(meeting.additional_context || '');
  }, [meeting.id, meeting.client, meeting.project, meeting.additional_context]);

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      try {
        await invoke('api_save_meeting_metadata', {
          meetingId: meeting.id,
          client: client.trim(),
          project: project.trim(),
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

  useAssistantTarget({ id: `saved-${meeting.id}`, meetingId: meeting.id, title: meeting.title, folderPath: meeting.folder_path, context: JSON.stringify({ client, project, additionalContext: customPrompt }) });
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
    const editor = meetingData.blockNoteSummaryRef.current;
    const current = await editor?.getMarkdown?.();
    const summary = meetingData.aiSummary as unknown as { markdown?: string; summary_json?: unknown[] } | null;
    // Empty is meaningful after the user deletes the document; never resurrect saved text.
    if (editor && (typeof summary?.markdown === 'string' || Array.isArray(summary?.summary_json))) return current || '';
    if (current) return current;
    if (typeof summary?.markdown === 'string') return summary.markdown;
    return Object.values(meetingData.aiSummary || {}).filter(section => section && typeof section === 'object' && 'title' in section && Array.isArray(section.blocks)).map(section => `## ${section.title}\n\n${section.blocks.map(block => block.content || '').join('\n\n')}`).join('\n\n');
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
    <div className="flex h-dvh min-h-0 flex-col bg-background">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-border bg-card px-4 pb-3.5 pt-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <button type="button" onClick={() => router.push('/library')} className="hover:text-foreground hover:underline">
              {t('meeting.library')}
            </button>
            {client.trim() && (<><ChevronRight className="size-3 shrink-0" /><span className="truncate">{client}</span></>)}
            {project.trim() && (<><ChevronRight className="size-3 shrink-0" /><span className="truncate">{project}</span></>)}
          </nav>
          <input
            value={meetingData.meetingTitle || meeting.title}
            onChange={(event) => meetingData.handleTitleChange(event.target.value)}
            aria-label="Title"
            className="mt-0.5 w-full truncate rounded-md border border-transparent bg-transparent px-0 text-2xl font-semibold leading-tight tracking-[-0.03em] outline-none transition-colors hover:border-input focus:border-brand focus:px-2 sm:text-[1.65rem]"
          />
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5" />
              {meeting.created_at ? formatDate(meeting.created_at, { dateStyle: 'medium', timeStyle: 'short' }) : t('meeting.details')}
            </span>
            <span role="status" className="inline-flex items-center gap-1.5">
              {meetingData.isSaving ? t('meeting.saving') : meetingData.isSummaryDirty || meetingData.isTitleDirty ? t('meeting.unsaved') : t('meeting.savedLocal')}
            </span>
            <MeetingMetaPopover
              client={client}
              project={project}
              context={customPrompt}
              clientOptions={Array.from(new Set(meetings.map(item => item.client).filter(Boolean))) as string[]}
              projectOptions={Array.from(new Set(meetings.filter(item => item.client === client).map(item => item.project).filter(Boolean))) as string[]}
              tags={meeting.tags || []}
              onClientChange={setClient}
              onProjectChange={setProject}
              onContextChange={setCustomPrompt}
            />
            <DataFlowChip />
            {desktopCapabilities.wikiEnabled && (
              <span className="rounded-full border border-border px-2.5 py-0.5 font-medium">
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
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <PdfExports
            meeting={{ ...meeting, title: meetingData.meetingTitle || meeting.title, client, project }}
            getAnalysis={getWikiMarkdown}
            onCopySummary={() => void copyOperations.handleCopySummary()}
            onCopyTranscript={() => void copyOperations.handleCopyTranscript()}
          />
          <AssistantButton />
        </div>
      </header>

      {/* En ventanas angostas se muestra un panel a la vez */}
      <div className="shrink-0 border-b border-border bg-card px-4 py-2 xl:hidden">
        <Segmented
          aria-label="View"
          value={view === 'transcript' ? 'transcript' : 'analysis'}
          onValueChange={setView}
          options={[
            { value: 'analysis', label: t('meeting.summary') },
            { value: 'transcript', label: t('meeting.transcript') },
          ]}
        />
      </div>

      <div className="meeting-workspace" data-view={view} data-chat={assistantOpen ? 'on' : 'off'} style={{ '--col-t': `${columns.transcript}px`, '--col-c': `${columns.chat}px` } as React.CSSProperties}>
        <div className="meeting-transcript"><TranscriptPanel
          transcripts={meetingData.transcripts}
          customPrompt={customPrompt}
          onPromptChange={setCustomPrompt}
          client={client}
          project={project}
          clientOptions={Array.from(new Set(meetings.map(item => item.client).filter(Boolean))) as string[]}
          projectOptions={Array.from(new Set(meetings.filter(item => item.client === client).map(item => item.project).filter(Boolean))) as string[]}
          tags={meeting.tags || []}
          onClientChange={setClient}
          onProjectChange={setProject}
          onCopyTranscript={copyOperations.handleCopyTranscript}
          onOpenMeetingFolder={meetingOperations.handleOpenMeetingFolder}
          isRecording={isRecording}
          disableAutoScroll={true}
          usePagination={true}
          segments={segments}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          totalCount={totalCount}
          loadedCount={loadedCount}
          onLoadMore={onLoadMore}
          meetingId={meeting.id}
          meetingFolderPath={meeting.folder_path}
          onRefetchTranscripts={onRefetchTranscripts}
        />
        </div>
        <ResizeHandle data-handle="transcript" side="start" min={300} max={900} value={columns.transcript} onChange={value => resizeColumn('transcript', value)} label={t('meeting.resizeTranscript')} />
        <div className="meeting-analysis"><SummaryPanel
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
        /></div>
        <ResizeHandle data-handle="chat" side="end" min={300} max={640} value={columns.chat} onChange={value => resizeColumn('chat', value)} label={t('meeting.resizeChat')} />
        <LiveAssistantDockHost isOpen={assistantOpen} />
      </div>
    </div>
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
            <SelectField
              aria-label={t('meeting.wikiWorkspace')}
              value={wikiPublish.selectedTenant}
              onValueChange={wikiPublish.setSelectedTenant}
              options={wikiPublish.tenants.map(tenant => ({ value: tenant.tenant_id, label: `${tenant.display_name || tenant.tenant_id} · ${tenant.role === 'owner' ? t('wiki.owner') : t('wiki.guest')}` }))}
            />
          </label>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              {t('meeting.client')}
              <SuggestInput value={client} onValueChange={setClient} options={wikiPublish.clients.map(item => item.client_id)} />
              <span className="block font-normal text-[11px]">{t('meeting.wikiSlugPreview').replace('{id}', slugifyWikiId(client) || '—')}</span>
            </label>
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              {t('meeting.project')}
              <SuggestInput value={project} onValueChange={setProject} options={wikiPublish.projects.map(item => item.project_id)} />
              <span className="block font-normal text-[11px]">{t('meeting.wikiSlugPreview').replace('{id}', slugifyWikiId(project) || '—')}</span>
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => wikiPublish.setDestinationOpen(false)}>{t('common.cancel')}</Button>
          <Button onClick={() => { wikiPublish.confirmDestination(); }} disabled={!wikiPublish.destination.ready || wikiPublish.isPublishing}>{t('meeting.wikiPublishNow')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
