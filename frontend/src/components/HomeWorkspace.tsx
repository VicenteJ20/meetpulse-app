'use client';

import { SuggestInput } from '@/components/ui/suggest-input';
import { useEffect, useState } from 'react';
import { useAssistant } from '@/contexts/AssistantContext';
import { ArrowRight, Check, Mic, Plus, Search, SlidersHorizontal, TriangleAlert } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EmptyState, PageHeader, Surface } from '@/components/ui/product';
import { DataFlowChip } from '@/components/DataFlowChip';
import { ChatModelSelect, LanguageSelect, SummaryModelSelect, TranscriptionEngineSelect } from '@/components/home/EngineSelects';
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
  const { t, formatDate } = useTranslation();
  const { setTarget } = useAssistant();
  const [contextOpen, setContextOpen] = useState(false);
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

  const recent = meetings.slice(0, 3);
  const openMeeting = (meeting: (typeof meetings)[number]) => {
    setCurrentMeeting(meeting);
    router.push(`/meeting-details?id=${encodeURIComponent(meeting.id)}`);
  };

  const hasContext = !!(draft.client || draft.project);
  const showContext = contextOpen || hasContext;

  return (
    <main className="custom-scrollbar flex h-dvh flex-col overflow-y-auto">
      <div className="mx-auto flex w-full flex-1 max-w-[640px] flex-col items-center justify-center gap-12 px-8 py-12">
        <div className="animate-enter flex w-full flex-col items-center gap-6 text-center">
          <Image src="/icon.png" alt="MeetPulse" width={56} height={56} priority className="rounded-2xl" />
          <PageHeader title={t('recording.new')} description={t('home.sub')} className="justify-center text-center" />

          <Button size="lg" variant="recording" className="h-14 rounded-full px-9 text-base" onClick={onStartRecording}>
            <Mic /> {t('recording.start')}
          </Button>

          {recoverableCount > 0 && (
            <button className="flex items-center gap-2 text-sm font-medium text-brand hover:underline" onClick={onOpenRecovery}>
              {recoverableCount} {recoverableCount === 1 ? t('home.recoverableOne') : t('home.recoverableMany')} <ArrowRight className="size-4" />
            </button>
          )}

          {showContext ? (
            <div className="grid w-full max-w-[460px] gap-3 text-left sm:grid-cols-2">
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
          ) : (
            <button
              type="button"
              onClick={() => setContextOpen(true)}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <Plus className="size-4" /> {t('home.addContext')}
            </button>
          )}

        </div>

        <section className="animate-enter flex w-full flex-col gap-2" style={{ animationDelay: '80ms' }}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">{t('home.recent')}</h2>
            {meetings.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => router.push('/library')}>
                {t('home.viewLibrary')} <ArrowRight />
              </Button>
            )}
          </div>
          {recent.length > 0 ? (
            <div className="stagger divide-y divide-border border-y border-border">
              {recent.map((meeting, index) => (
                <button
                  key={meeting.id}
                  style={{ '--i': index } as React.CSSProperties}
                  onClick={() => openMeeting(meeting)}
                  className="group flex w-full items-center gap-4 py-3 text-left"
                >
                  <p className="min-w-0 flex-1 truncate text-sm group-hover:text-brand">{meeting.title}</p>
                  {meeting.created_at && (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {formatDate(meeting.created_at, { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </button>
              ))}
            </div>
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

      <footer className="flex shrink-0 flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-border px-8 py-3">
        <Ready ok={hasMicrophone} label={hasMicrophone ? t('home.mic') : t('home.noMic')} />
        <Ready ok={hasSystemAudio} label={hasSystemAudio ? t('home.sys') : t('home.noSys')} />
        <DataFlowChip />
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm">
              <SlidersHorizontal /> {t('home.adjust')}
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" align="end" className="flex w-80 flex-col gap-4">
            <TranscriptionEngineSelect />
            <LanguageSelect />
            <SummaryModelSelect />
            <ChatModelSelect />
          </PopoverContent>
        </Popover>
      </footer>
    </main>
  );
}
