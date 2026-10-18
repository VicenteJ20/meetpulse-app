'use client';

import { SuggestInput } from '@/components/ui/suggest-input';
import { useEffect, useState } from 'react';
import { useAssistant } from '@/contexts/AssistantContext';
import { ArrowRight, Check, Headphones, Import, Mic, Search, Sparkles, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useConfig } from '@/contexts/ConfigContext';
import { useImportDialog } from '@/contexts/ImportDialogContext';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { EmptyState, PageHeader, Surface } from '@/components/ui/product';
import { DataFlowChip } from '@/components/DataFlowChip';
import { LanguageSelect, SummaryModelSelect, TranscriptionEngineSelect } from '@/components/home/EngineSelects';
import { OPEN_PALETTE_EVENT } from '@/components/Rail';
import { cn } from '@/lib/utils';

const RECORDING_CONTEXT_KEY = 'meetpulse-recording-context';

function Ready({ ok, label }: { ok: boolean; label: string }) {
  const Icon = ok ? Check : TriangleAlert;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs', ok ? 'text-muted-foreground' : 'text-warning')}>
      <span className={cn('grid size-4 place-items-center rounded-full', ok ? 'bg-success/15 text-success' : 'bg-warning/15')}>
        <Icon className="size-2.5" strokeWidth={3} />
      </span>
      {label}
    </span>
  );
}

export function HomeWorkspace({
  onStartRecording,
  hasMicrophone,
  hasSystemAudio,
  recoverableCount = 0,
  onOpenRecovery,
}: {
  onStartRecording: () => void;
  hasMicrophone: boolean;
  hasSystemAudio: boolean;
  recoverableCount?: number;
  onOpenRecovery?: () => void;
}) {
  const router = useRouter();
  const { meetings, setCurrentMeeting } = useSidebar();
  const { betaFeatures } = useConfig();
  const { openImportDialog } = useImportDialog();
  const { t, formatDate } = useTranslation();
  const { setTarget } = useAssistant();
  const [draft, setDraft] = useState({ title: '', client: '', project: '', additionalContext: '' });

  useEffect(() => {
    setTarget(null);
    try {
      const stored = localStorage.getItem(RECORDING_CONTEXT_KEY);
      if (stored) setDraft(JSON.parse(stored));
    } catch {
      // Sin contexto guardado: se parte vacío.
    }
  }, [setTarget]);

  // El título se genera solo (fecha y hora); aquí únicamente se elige a qué cliente y proyecto pertenece.
  const updateDraft = (key: 'client' | 'project', value: string) => {
    const next = { ...draft, title: '', [key]: value, ...(key === 'client' ? { project: '' } : {}) };
    setDraft(next);
    localStorage.setItem(RECORDING_CONTEXT_KEY, JSON.stringify(next));
  };

  const clients = Array.from(new Set(meetings.map((m) => m.client).filter((v): v is string => !!v)));
  const projects = Array.from(new Set(
    meetings.filter((m) => !draft.client || m.client === draft.client).map((m) => m.project).filter((v): v is string => !!v),
  ));

  const recent = meetings.slice(0, 5);
  const openMeeting = (meeting: (typeof meetings)[number]) => {
    setCurrentMeeting(meeting);
    router.push(`/meeting-details?id=${encodeURIComponent(meeting.id)}`);
  };

  return (
    <main className="custom-scrollbar h-dvh overflow-y-auto">
      <div className="mx-auto flex max-w-[760px] flex-col gap-7 px-8 pb-16 pt-10">
        <div className="animate-enter flex flex-col gap-4">
          <PageHeader title={t('recording.new')} description={t('home.sub')} />
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
            className="flex h-10 w-full items-center gap-2.5 rounded-full border border-input bg-card px-3.5 text-sm text-muted-foreground transition-[border-color,box-shadow] duration-150 hover:border-brand hover:shadow-[0_0_0_3px_hsl(var(--brand)/0.12)]"
          >
            <Sparkles className="size-4 text-brand" />
            <span className="flex-1 text-left">{t('home.askBar')}</span>
            <Kbd>Ctrl K</Kbd>
          </button>
        </div>

        <Surface className="animate-enter flex flex-col gap-6 p-6" >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted-foreground">
              {t('home.fieldClient')}
              <SuggestInput
                value={draft.client}
                onValueChange={(value) => updateDraft('client', value)}
                placeholder={t('home.clientPlaceholder')}
                options={clients}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted-foreground">
              {t('home.fieldProject')}
              <SuggestInput
                value={draft.project}
                onValueChange={(value) => updateDraft('project', value)}
                placeholder={t('home.clientPlaceholder')}
                options={projects}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" variant="recording" onClick={onStartRecording}>
              <Mic /> {t('recording.start')}
            </Button>
            {betaFeatures.importAndRetranscribe && (
              <Button size="lg" variant="outline" onClick={() => openImportDialog()}>
                <Import /> {t('home.importAudio')}
              </Button>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1">
              <Ready ok={hasMicrophone} label={hasMicrophone ? t('home.mic') : t('home.noMic')} />
              <Ready ok={hasSystemAudio} label={hasSystemAudio ? t('home.sys') : t('home.noSys')} />
            </div>
          </div>

          {recoverableCount > 0 && (
            <button className="flex items-center gap-2 text-sm font-medium text-brand hover:underline" onClick={onOpenRecovery}>
              {recoverableCount} {recoverableCount === 1 ? t('home.recoverableOne') : t('home.recoverableMany')} <ArrowRight className="size-4" />
            </button>
          )}

          <div className="grid gap-3 border-t border-border pt-5 sm:grid-cols-[1.4fr_0.8fr_1.4fr]">
            <TranscriptionEngineSelect />
            <LanguageSelect />
            <SummaryModelSelect />
          </div>
          <DataFlowChip className="self-start" />
        </Surface>

        <section className="animate-enter flex flex-col gap-3" style={{ animationDelay: '80ms' }}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t('home.recent')}</h2>
            {meetings.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => router.push('/library')}>
                {t('home.viewLibrary')} <ArrowRight />
              </Button>
            )}
          </div>
          {recent.length > 0 ? (
            <Surface className="stagger divide-y divide-border overflow-hidden">
              {recent.map((meeting, index) => (
                <button
                  key={meeting.id}
                  style={{ '--i': index } as React.CSSProperties}
                  onClick={() => openMeeting(meeting)}
                  className="group flex w-full items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium group-hover:text-brand">{meeting.title}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {[meeting.client, meeting.project].filter(Boolean).join(' / ') || t('library.noClient')}
                    </p>
                  </div>
                  {meeting.created_at && (
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {formatDate(meeting.created_at, { dateStyle: 'medium' })}
                    </span>
                  )}
                </button>
              ))}
            </Surface>
          ) : (
            <Surface>
              <EmptyState
                icon={<Search />}
                title={t('home.noRecent')}
                description={t('home.noRecentDescription')}
              />
            </Surface>
          )}
        </section>
      </div>
    </main>
  );
}
