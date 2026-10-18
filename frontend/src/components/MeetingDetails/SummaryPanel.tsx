"use client";

import { Summary, SummaryResponse, Transcript } from '@/types';
import { EditableTitle } from '@/components/EditableTitle';
import { BlockNoteSummaryView, BlockNoteSummaryViewRef } from '@/components/AISummary/BlockNoteSummaryView';
import { EmptyStateSummary } from '@/components/EmptyStateSummary';
import { ModelConfig } from '@/components/ModelSettingsModal';
import { SummaryGeneratorButtonGroup } from './SummaryGeneratorButtonGroup';
import { SummaryEditorErrorBoundary } from './SummaryEditorErrorBoundary';
import { SummaryUpdaterButtonGroup } from './SummaryUpdaterButtonGroup';
import Analytics from '@/lib/analytics';
import { useEffect, useRef, useState, RefObject } from 'react';
import { toast } from 'sonner';
import { Languages, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Segmented } from '@/components/ui/segmented';
import { InsightsView } from './InsightsView';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { LanguagePickerPopover } from '@/components/LanguagePickerPopover';
import { useRecentLanguages } from '@/hooks/useRecentLanguages';
import { labelForCode } from '@/lib/summary-languages';
import {
  readCachedDetectedSummaryLanguage,
  readMeetingSummaryLanguage,
  saveMeetingSummaryLanguage,
  SummaryLanguageStorage,
} from '@/lib/summary-language-preferences';
import type { WikiPublishUiStatus } from '@/hooks/meeting-details/useWikiPublish';

interface SummaryPanelProps {
  meeting: {
    id: string;
    title: string;
    created_at: string;
  };
  meetingTitle: string;
  onTitleChange: (title: string) => void;
  isEditingTitle: boolean;
  onStartEditTitle: () => void;
  onFinishEditTitle: () => void;
  isTitleDirty: boolean;
  summaryRef: RefObject<BlockNoteSummaryViewRef>;
  isSaving: boolean;
  onSaveAll: () => Promise<void>;
  onCopySummary: () => Promise<void>;
  onOpenFolder: () => Promise<void>;
  aiSummary: Summary | null;
  summaryStatus: 'idle' | 'processing' | 'summarizing' | 'regenerating' | 'completed' | 'error';
  transcripts: Transcript[];
  modelConfig: ModelConfig;
  setModelConfig: (config: ModelConfig | ((prev: ModelConfig) => ModelConfig)) => void;
  onSaveModelConfig: (config?: ModelConfig) => Promise<void>;
  onGenerateSummary: (customPrompt: string) => Promise<void>;
  onStopGeneration: () => void;
  customPrompt: string;
  summaryResponse: SummaryResponse | null;
  onSaveSummary: (summary: Summary | { markdown?: string; summary_json?: any[] }) => Promise<void>;
  onSummaryChange: (summary: Summary) => void;
  onDirtyChange: (isDirty: boolean) => void;
  summaryError: string | null;
  onRegenerateSummary: () => Promise<void>;
  getSummaryStatusMessage: (status: 'idle' | 'processing' | 'summarizing' | 'regenerating' | 'completed' | 'error') => string;
  availableTemplates: Array<{ id: string, name: string, description: string }>;
  selectedTemplate: string;
  onTemplateSelect: (templateId: string, templateName: string) => void;
  isModelConfigLoading?: boolean;
  onOpenModelSettings?: (openFn: () => void) => void;
  wikiStatus: WikiPublishUiStatus;
  onRetryWiki: () => Promise<void> | void;
  onOpenWiki: () => void;
}

export function SummaryPanel({
  meeting,
  meetingTitle,
  onTitleChange,
  isEditingTitle,
  onStartEditTitle,
  onFinishEditTitle,
  isTitleDirty,
  summaryRef,
  isSaving,
  onSaveAll,
  onCopySummary,
  onOpenFolder,
  aiSummary,
  summaryStatus,
  transcripts,
  modelConfig,
  setModelConfig,
  onSaveModelConfig,
  onGenerateSummary,
  onStopGeneration,
  customPrompt,
  summaryResponse,
  onSaveSummary,
  onSummaryChange,
  onDirtyChange,
  summaryError,
  onRegenerateSummary,
  getSummaryStatusMessage,
  availableTemplates,
  selectedTemplate,
  onTemplateSelect,
  isModelConfigLoading = false,
  onOpenModelSettings,
  wikiStatus,
  onRetryWiki,
  onOpenWiki
}: SummaryPanelProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'insights' | 'document'>('insights');
  const [summaryLang, setSummaryLang] = useState<string | null>(null);
  const [detectedSummaryLang, setDetectedSummaryLang] = useState<string | null>(null);
  const [summaryLangStorage, setSummaryLangStorage] = useState<SummaryLanguageStorage>('metadata');
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  const languageLoadVersionRef = useRef(0);
  const activeMeetingIdRef = useRef(meeting.id);
  const languageSaveVersionRef = useRef(0);
  const languageSaveLoopRunningRef = useRef(false);
  const latestLanguageSaveRequestRef = useRef<{
    version: number;
    meetingId: string;
    language: string | null;
    rollback: {
      language: string | null;
      storage: SummaryLanguageStorage;
    };
  } | null>(null);
  activeMeetingIdRef.current = meeting.id;
  const { addRecent } = useRecentLanguages();

  const effectiveLangLabel = summaryLang ? labelForCode(summaryLang) : 'Auto';
  const isLocalFallbackLanguage = summaryLangStorage === 'local_fallback';
  const autoSubtitle = isLocalFallbackLanguage
    ? 'Saved on this device for folderless meetings'
    : 'Uses dominant transcript language';
  const editorLanguage = summaryLang
    || detectedSummaryLang
    || (typeof navigator !== 'undefined' ? navigator.language : 'en');

  useEffect(() => {
    let cancelled = false;
    const loadVersion = languageLoadVersionRef.current + 1;
    languageLoadVersionRef.current = loadVersion;

    const loadSummaryLanguage = async () => {
      try {
        const [stored, detected] = await Promise.all([
          readMeetingSummaryLanguage(meeting.id),
          readCachedDetectedSummaryLanguage(meeting.id),
        ]);
        if (!cancelled && languageLoadVersionRef.current === loadVersion) {
          setSummaryLang(stored.language);
          setDetectedSummaryLang(detected);
          setSummaryLangStorage(stored.storage);
        }
      } catch (err) {
        console.error('Failed to load summary language:', err);
        toast.warning('Could not load saved summary language', {
          description: 'Using Auto until meeting metadata can be read.',
        });
        if (!cancelled && languageLoadVersionRef.current === loadVersion) {
          setSummaryLang(null);
          setDetectedSummaryLang(null);
        }
      }
    };

    loadSummaryLanguage();

    return () => {
      cancelled = true;
    };
  }, [meeting.id]);

  const persistLatestLanguageSelection = async () => {
    if (languageSaveLoopRunningRef.current) return;
    languageSaveLoopRunningRef.current = true;

    try {
      while (true) {
        const request = latestLanguageSaveRequestRef.current;
        if (!request) return;

        try {
          const saved = await saveMeetingSummaryLanguage(request.meetingId, request.language);
          const latest = latestLanguageSaveRequestRef.current;
          if (
            latest?.version === request.version &&
            activeMeetingIdRef.current === request.meetingId
          ) {
            setSummaryLang(saved.language);
            setSummaryLangStorage(saved.storage);
            if (saved.storage === 'local_fallback') {
              toast.info('Summary language saved on this device', {
                description: 'This meeting has no recording folder, so the preference cannot be written to meeting metadata.',
              });
            }
            if (request.language) {
              addRecent(request.language);
            }
            return;
          }

          if (latest?.version === request.version) return;
        } catch (err) {
          const latest = latestLanguageSaveRequestRef.current;
          if (
            latest?.version === request.version &&
            activeMeetingIdRef.current === request.meetingId
          ) {
            console.error('Failed to persist summary language:', err);
            toast.error('Failed to save summary language');
            setSummaryLang(request.rollback.language);
            setSummaryLangStorage(request.rollback.storage);
            return;
          }

          console.warn('Ignoring failed stale summary language save:', err);
          if (latest?.version === request.version) return;
        }
      }
    } finally {
      languageSaveLoopRunningRef.current = false;
    }
  };

  const handleLangChange = (code: string | null) => {
    const previous = summaryLang;
    const previousStorage = summaryLangStorage;
    const nextStored = code;
    languageLoadVersionRef.current += 1;
    latestLanguageSaveRequestRef.current = {
      version: languageSaveVersionRef.current + 1,
      meetingId: meeting.id,
      language: nextStored,
      rollback: {
        language: previous,
        storage: previousStorage,
      },
    };
    languageSaveVersionRef.current += 1;
    setSummaryLang(nextStored);
    setLangPickerOpen(false);
    void persistLatestLanguageSelection();
  };

  const isSummaryLoading = summaryStatus === 'processing' || summaryStatus === 'summarizing' || summaryStatus === 'regenerating';

  const languageSlot = (
    <Popover open={langPickerOpen} onOpenChange={setLangPickerOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          title={`Summary language: ${effectiveLangLabel}${isLocalFallbackLanguage ? ' (saved on this device)' : ''}`}
          aria-label="Set summary language"
          className="data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
        >
          <Languages />
          <span className="hidden xl:inline">{effectiveLangLabel}</span>
          <ChevronDown size={14} className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-auto p-0 border-0 shadow-none bg-transparent"
      >
        <LanguagePickerPopover
          value={summaryLang}
          onChange={handleLangChange}
          onClose={() => setLangPickerOpen(false)}
          autoSubtitle={autoSubtitle}
        />
      </PopoverContent>
    </Popover>
  );

  const summaryActions = aiSummary && !isSummaryLoading ? (
    <SummaryUpdaterButtonGroup
      isSaving={isSaving}
      isDirty={isTitleDirty || (summaryRef.current?.isDirty || false)}
      onSave={onSaveAll}
      onCopy={onCopySummary}
      onFind={() => console.log('Find in summary clicked')}
      onOpenFolder={onOpenFolder}
      hasSummary={!!aiSummary}
      wikiStatus={wikiStatus}
      onRetryWiki={onRetryWiki}
      onOpenWiki={onOpenWiki}
    />
  ) : null;

  const summaryMarkdown = (aiSummary as unknown as { markdown?: string } | null)?.markdown ?? '';
  const showInsights = mode === 'insights' && summaryMarkdown.trim().length > 0;

  const generatorGroup = (
    <SummaryGeneratorButtonGroup
      modelConfig={modelConfig}
      setModelConfig={setModelConfig}
      onSaveModelConfig={onSaveModelConfig}
      onGenerateSummary={onGenerateSummary}
      onStopGeneration={onStopGeneration}
      customPrompt={customPrompt}
      summaryStatus={summaryStatus}
      availableTemplates={availableTemplates}
      selectedTemplate={selectedTemplate}
      onTemplateSelect={onTemplateSelect}
      hasTranscripts={transcripts.length > 0}
      hasSummary={!!aiSummary}
      isModelConfigLoading={isModelConfigLoading}
      onOpenModelSettings={onOpenModelSettings}
      languageSlot={transcripts.length > 0 ? languageSlot : undefined}
    />
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      {/* Encabezado del panel: título a la izquierda, acciones a la derecha */}
      <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border px-4">
        {summaryMarkdown.trim() && !isSummaryLoading ? (
          <Segmented
            aria-label={t('meeting.summary')}
            value={mode}
            onValueChange={setMode}
            options={[
              { value: 'insights', label: t('insights.tabInsights') },
              { value: 'document', label: t('insights.tabDocument') },
            ]}
          />
        ) : (
          <h2 className="text-sm font-semibold tracking-tight">{t('meeting.summary')}</h2>
        )}
        <div className="ml-auto flex min-w-0 flex-nowrap items-center justify-end gap-1.5">
          {summaryActions}
          {generatorGroup}
        </div>
      </div>

      {isSummaryLoading ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-8 py-8" role="status" aria-live="polite">
          <p className="mb-2 text-sm font-medium text-muted-foreground">{t('meeting.generating')}</p>
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-5 w-11/12" />
          <Skeleton className="h-5 w-10/12" />
          <Skeleton className="h-5 w-7/12" />
          <Skeleton className="mt-6 h-4 w-1/5" />
          <Skeleton className="h-4 w-9/12" />
          <Skeleton className="h-4 w-8/12" />
          <Skeleton className="h-4 w-10/12" />
        </div>
      ) : !aiSummary ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <EmptyStateSummary
            onGenerate={() => onGenerateSummary(customPrompt)}
            hasModel={modelConfig.provider !== null && modelConfig.model !== null}
            isGenerating={isSummaryLoading}
          />
        </div>
      ) : transcripts?.length > 0 && (
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
          {summaryResponse && (
            <div className="fixed bottom-0 left-0 right-0 max-h-1/3 overflow-y-auto border-t border-border bg-card p-4 text-card-foreground shadow-lg">
              <h3 className="text-lg font-semibold mb-2">Meeting Summary</h3>
              <div className="grid grid-cols-2 gap-4">
                {([
                  ['Key Points', summaryResponse.summary.key_points.blocks],
                  ['Action Items', summaryResponse.summary.action_items.blocks],
                  ['Decisions', summaryResponse.summary.decisions.blocks],
                  ['Main Topics', summaryResponse.summary.main_topics.blocks],
                ] as const).map(([heading, blocks]) => (
                  <div key={heading} className="rounded-lg border border-border bg-muted/45 p-4">
                    <h4 className="font-medium mb-1">{heading}</h4>
                    <ul className="list-disc pl-4">
                      {blocks.map((block, i) => (
                        <li key={i} className="text-sm">{block.content}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              {summaryResponse.raw_summary ? (
                <div className="mt-4">
                  <h4 className="font-medium mb-1">Full Summary</h4>
                  <p className="text-sm whitespace-pre-wrap">{summaryResponse.raw_summary}</p>
                </div>
              ) : null}
            </div>
          )}
          {showInsights ? (
            <InsightsView
              markdown={summaryMarkdown}
              onChange={(next) => {
                onSummaryChange({ ...(aiSummary as object), markdown: next } as unknown as Summary);
                void onSaveSummary({ markdown: next });
              }}
            />
          ) : (
          <div className="meeting-summary-editor w-full">
            <SummaryEditorErrorBoundary
              fallbackMarkdown={(aiSummary as unknown as { markdown?: string }).markdown}
            >
              <BlockNoteSummaryView
                ref={summaryRef}
                summaryData={aiSummary}
                onSave={onSaveSummary}
                onSummaryChange={onSummaryChange}
                onDirtyChange={onDirtyChange}
                status={summaryStatus}
                error={summaryError}
                onRegenerateSummary={() => {
                  Analytics.trackButtonClick('regenerate_summary', 'meeting_details');
                  onRegenerateSummary();
                }}
                meeting={{
                  id: meeting.id,
                  title: meetingTitle,
                  created_at: meeting.created_at
                }}
                language={editorLanguage}
              />
            </SummaryEditorErrorBoundary>
          </div>
          )}
          {summaryStatus === 'error' && (
            <div className="mx-8 mb-6 rounded-lg bg-destructive/10 p-4 text-destructive">
              <p className="text-sm font-medium">{getSummaryStatusMessage(summaryStatus)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
