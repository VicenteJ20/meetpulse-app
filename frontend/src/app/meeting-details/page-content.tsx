"use client";
import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Summary, SummaryResponse } from '@/types';
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
import { getWikiConfig } from '@/services/wiki-config';
import { WikiApi, WikiApiError, listWikiTenants, type WikiTenant } from '@/services/wiki-api';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CalendarDays } from 'lucide-react';
import { useTranslation } from '@/contexts/UiPreferencesContext';

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
  const [customPrompt, setCustomPrompt] = useState<string>(meeting.additional_context || '');
  const [client, setClient] = useState<string>(meeting.client || '');
  const [project, setProject] = useState<string>(meeting.project || '');
  const [isRecording] = useState(false);
  const [summaryResponse] = useState<SummaryResponse | null>(null);
  const [isSavingToWiki, setIsSavingToWiki] = useState(false);
  const [isSavedToWiki, setIsSavedToWiki] = useState(false);
  const [wikiTenantPickerOpen, setWikiTenantPickerOpen] = useState(false);
  const [wikiTenants, setWikiTenants] = useState<WikiTenant[]>([]);
  const [selectedWikiTenant, setSelectedWikiTenant] = useState('');
  const { serverAddress, refetchMeetings } = useSidebar();
  const { t, formatDate } = useTranslation();

  useEffect(() => {
    setClient(meeting.client || '');
    setProject(meeting.project || '');
    setCustomPrompt(meeting.additional_context || '');
  }, [meeting.id, meeting.client, meeting.project, meeting.additional_context]);

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      try {
        await invoke('api_save_meeting_metadata', {
          meetingId: meeting.id,
          client,
          project,
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

  const openWikiTenantPicker = async () => {
    try {
      const tenants = await listWikiTenants();
      if (!tenants.length) { toast.error('Create or join a Wiki tenant before saving notes.'); return; }
      const configured = getWikiConfig().tenantId;
      setWikiTenants(tenants);
      setSelectedWikiTenant(tenants.some(tenant => tenant.tenant_id === configured) ? configured : tenants[0].tenant_id);
      setWikiTenantPickerOpen(true);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to load Wiki tenants'); }
  };

  const handleSaveToWiki = async () => {
    if (!selectedWikiTenant) return;
    const config = { ...getWikiConfig(), tenantId: selectedWikiTenant };
    if (!client.trim() || !project.trim()) { toast.error('Add both client and project before saving this note to Wiki'); return; }
    setIsSavingToWiki(true);
    try {
      await meetingData.saveAllChanges();
      let markdown = await meetingData.blockNoteSummaryRef.current?.getMarkdown?.() || '';
      if (!markdown && meetingData.aiSummary && 'markdown' in meetingData.aiSummary) {
        markdown = (meetingData.aiSummary as any).markdown || '';
      }
      if (!markdown) { toast.error('Add a summary before saving this note to Wiki'); return; }
      const participants = Array.isArray((meeting as any).participants) && (meeting as any).participants.length
        ? (meeting as any).participants.map(String)
        : ['Not specified'];
      await new WikiApi(config).ingest({
        clientId: client.trim(),
        projectId: project.trim(),
        title: meetingData.meetingTitle.trim() || meeting.title,
        dateTime: meeting.created_at || new Date().toISOString(),
        participants,
        markdown,
      });
      setIsSavedToWiki(true);
      toast.success('Note saved to Wiki');
    } catch (error) {
      if (error instanceof WikiApiError && error.status === 409) toast.info('This note is already saved in Wiki');
      else toast.error(error instanceof Error ? error.message : 'Failed to save note to Wiki');
    } finally {
      setIsSavingToWiki(false);
    }
  };

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
        <div className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground">{t('meeting.summary')}</div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <TranscriptPanel
          transcripts={meetingData.transcripts}
          customPrompt={customPrompt}
          onPromptChange={setCustomPrompt}
          client={client}
          project={project}
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
          onSaveToWiki={openWikiTenantPicker}
          isSavingToWiki={isSavingToWiki}
          isSavedToWiki={isSavedToWiki}
        />
      </div>
    </motion.div>
    <Dialog open={wikiTenantPickerOpen} onOpenChange={setWikiTenantPickerOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save note to Wiki</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Choose the workspace that should receive this meeting note.</p>
          <select value={selectedWikiTenant} onChange={event => setSelectedWikiTenant(event.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground">
            {wikiTenants.map(tenant => <option key={tenant.tenant_id} value={tenant.tenant_id}>{tenant.display_name || tenant.tenant_id} · {tenant.role === 'owner' ? t('wiki.owner') : t('wiki.guest')}</option>)}
          </select>
        </div>
        <DialogFooter>
          <button onClick={() => setWikiTenantPickerOpen(false)} className="rounded-md border px-3 py-2 text-sm">Cancel</button>
          <button onClick={() => { setWikiTenantPickerOpen(false); handleSaveToWiki(); }} disabled={!selectedWikiTenant || isSavingToWiki} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">Save to selected Wiki</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
