'use client';

import { desktopCapabilities } from '@/config/capabilities';
import { useEffect, useState } from 'react';
import { useAssistant } from '@/contexts/AssistantContext';
import { ArrowRight, Cloud, Cpu, Import, LockKeyhole, Mic, Search, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useConfig } from '@/contexts/ConfigContext';
import { useImportDialog } from '@/contexts/ImportDialogContext';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { useDataFlow } from '@/hooks/useDataFlow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { EmptyState, PageHeader, Surface } from '@/components/ui/product';
import { HomeWikiStats } from '@/components/HomeWikiStats';
import { TranscriptionLanguageControl } from '@/components/TranscriptionLanguageControl';
import { HomeReadinessControls } from '@/components/HomeReadinessControls';
import { DataFlowChip } from '@/components/DataFlowChip';
import { OPEN_PALETTE_EVENT } from '@/components/Rail';

const RECORDING_CONTEXT_KEY = 'meetpulse-recording-context';

function EngineChip({ label, name, cloud }: { label: string; name: string; cloud: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="inline-flex h-8 items-center gap-2 rounded-md border border-input bg-card px-2.5 text-sm">
        {cloud ? <Cloud className="size-4 text-warning" /> : <Cpu className="size-4 text-success" />}
        <span className="truncate font-medium">{name || '—'}</span>
      </span>
    </div>
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
  const flow = useDataFlow();
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

  const updateDraft = (key: string, value: string) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    localStorage.setItem(RECORDING_CONTEXT_KEY, JSON.stringify(next));
  };

  const recent = meetings.slice(0, 6);
  const openMeeting = (meeting: (typeof meetings)[number]) => {
    setCurrentMeeting(meeting);
    router.push(`/meeting-details?id=${encodeURIComponent(meeting.id)}`);
  };
  const fields = [
    { key: 'title', label: t('home.fieldTitle') },
    { key: 'client', label: t('home.fieldClient') },
    { key: 'project', label: t('home.fieldProject') },
  ] as const;

  return (
    <main className="custom-scrollbar h-dvh overflow-y-auto">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-8 pb-16 pt-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <PageHeader title={t('recording.new')} description={t('home.sub')} />
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
            className="flex h-10 w-full max-w-sm items-center gap-2.5 rounded-full border border-input bg-card px-3.5 text-sm text-muted-foreground transition-colors hover:border-brand hover:bg-accent/40"
          >
            <Sparkles className="size-4 text-brand" />
            <span className="flex-1 text-left">{t('home.askBar')}</span>
            <Kbd>Ctrl K</Kbd>
          </button>
        </div>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(16rem,0.9fr)]">
          <Surface className="flex flex-col gap-5 p-6">
            <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr]">
              {fields.map(({ key, label }) => (
                <label key={key} className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted-foreground">
                  {label}
                  <Input
                    value={draft[key]}
                    onChange={(event) => updateDraft(key, event.target.value)}
                    list={key === 'title' ? undefined : `prepare-${key}`}
                  />
                  {key !== 'title' && (
                    <datalist id={`prepare-${key}`}>
                      {Array.from(
                        new Set(
                          meetings
                            .filter((m) => key === 'client' || m.client === draft.client)
                            .map((m) => m[key])
                            .filter(Boolean),
                        ),
                      ).map((value) => (
                        <option key={value!} value={value!} />
                      ))}
                    </datalist>
                  )}
                </label>
              ))}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <Button size="lg" variant="recording" onClick={onStartRecording}>
                <Mic /> {t('recording.start')}
              </Button>
              {betaFeatures.importAndRetranscribe && (
                <Button size="lg" variant="outline" onClick={() => openImportDialog()}>
                  <Import /> {t('home.importAudio')}
                </Button>
              )}
              <TranscriptionLanguageControl />
            </div>

            <div className="flex flex-wrap items-end gap-x-5 gap-y-3 border-t border-border pt-4">
              <EngineChip label={t('home.transcribeWith')} name={flow.transcriptionName} cloud={!!flow.audioTo} />
              <EngineChip label={t('home.summarizeWith')} name={flow.analysisName} cloud={!!flow.textTo} />
              <DataFlowChip className="ml-auto self-center" />
            </div>

            {recoverableCount > 0 && (
              <button className="flex items-center gap-2 text-sm font-medium text-brand hover:underline" onClick={onOpenRecovery}>
                {recoverableCount} {recoverableCount === 1 ? t('home.recoverableOne') : t('home.recoverableMany')}{' '}
                <ArrowRight className="size-4" />
              </button>
            )}
          </Surface>

          <Surface className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">{t('home.ready')}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('home.localPrivacyDescription')}</p>
              </div>
              <div className="flex size-10 items-center justify-center rounded-xl bg-success/10 text-success">
                <LockKeyhole className="size-5" />
              </div>
            </div>
            <HomeReadinessControls hasMicrophone={hasMicrophone} hasSystemAudio={hasSystemAudio} />
          </Surface>
        </section>

        <Surface className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="font-semibold">{t('home.recent')}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {meetings.length} {meetings.length === 1 ? t('home.meetingCountOne') : t('home.meetingCountMany')}
              </p>
            </div>
            {meetings.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => router.push('/library')}>
                {t('home.viewLibrary')} <ArrowRight />
              </Button>
            )}
          </div>
          {recent.length > 0 ? (
            <div className="divide-y divide-border">
              {recent.map((meeting) => (
                <button
                  key={meeting.id}
                  onClick={() => openMeeting(meeting)}
                  className="group flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium group-hover:text-brand">{meeting.title}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {[meeting.client, meeting.project].filter(Boolean).join(' / ') || t('meeting.details')}
                    </p>
                  </div>
                  {meeting.created_at && (
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {formatDate(meeting.created_at, { dateStyle: 'medium' })}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Search />}
              title={t('home.noRecent')}
              description={t('home.noRecentDescription')}
              action={<Button variant="outline" onClick={onStartRecording}>{t('recording.start')}</Button>}
            />
          )}
        </Surface>

        {desktopCapabilities.wikiEnabled && <HomeWikiStats />}
      </div>
    </main>
  );
}
