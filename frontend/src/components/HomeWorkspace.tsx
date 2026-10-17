'use client';

import { desktopCapabilities } from '@/config/capabilities';
import { useEffect, useState } from 'react';
import { useAssistant } from '@/contexts/AssistantContext';
import { ArrowRight, ChevronRight, Import, LockKeyhole, Mic, Radio, Settings2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useConfig } from '@/contexts/ConfigContext';
import { useImportDialog } from '@/contexts/ImportDialogContext';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { Button } from '@/components/ui/button';
import { EmptyState, PageHeader, Surface } from '@/components/ui/product';
import { HomeWikiStats } from '@/components/HomeWikiStats';
import { TranscriptionLanguageControl } from '@/components/TranscriptionLanguageControl';
import { HomeReadinessControls } from '@/components/HomeReadinessControls';

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
  const { meetings, setCurrentMeeting, isCollapsed, toggleCollapse } = useSidebar();
  const { betaFeatures } = useConfig();
  const { openImportDialog } = useImportDialog();
  const { t, locale } = useTranslation();
  const { setTarget } = useAssistant();
  const [draft, setDraft] = useState({ title: '', client: '', project: '', additionalContext: '' });
  useEffect(() => { setTarget(null); try { const stored = localStorage.getItem('meetpulse-recording-context'); if (stored) setDraft(JSON.parse(stored)); } catch {} }, [setTarget]);
  const updateDraft = (key: string, value: string) => { const next = { ...draft, [key]: value }; setDraft(next); localStorage.setItem('meetpulse-recording-context', JSON.stringify(next)); };
  const recent = meetings.slice(0, 6);

  const openMeeting = (meeting: typeof meetings[number]) => {
    setCurrentMeeting(meeting);
    router.push(`/meeting-details?id=${meeting.id}`);
  };

  return (
    <main className="custom-scrollbar h-screen overflow-y-auto">
      <div className="mx-auto max-w-[1380px] px-5 py-5 lg:px-6 lg:py-6">
        <PageHeader
          title={locale === 'es' ? 'Tus reuniones' : 'Your meetings'}
          description={locale === 'es' ? 'Prepara una grabación o retoma el trabajo de tu equipo.' : 'Prepare a recording or pick up your team’s work.'}
          actions={
            <Button variant="ghost" onClick={() => router.push('/settings')} className="hidden sm:inline-flex">
              <Settings2 /> {t('home.openSettings')}
            </Button>
          }
        />

        <section className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)]">
          <Surface className="relative overflow-hidden border-brand/20 bg-[linear-gradient(135deg,hsl(var(--card)),hsl(var(--accent)/.52))] p-5 sm:p-6">
            <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-brand/10 blur-3xl" />
            <div className="relative max-w-2xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/8 px-3 py-1.5 text-xs font-semibold text-brand">
                <Radio className="h-3.5 w-3.5" />
                {t('home.ready')}
              </div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{t('recording.new')}</h2>
              <p className="mt-3 max-w-xl text-sm leading-5 text-muted-foreground">{t('home.startHint')}</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">{(['title','client','project'] as const).map(key => <label key={key} className="text-xs text-muted-foreground">{key === 'title' ? (locale === 'es' ? 'Título' : 'Title') : key === 'client' ? (locale === 'es' ? 'Cliente' : 'Client') : (locale === 'es' ? 'Proyecto' : 'Project')}<input value={draft[key]} onChange={e => updateDraft(key,e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground" list={key === 'title' ? undefined : `prepare-${key}`}/>{key !== 'title' && <datalist id={`prepare-${key}`}>{Array.from(new Set(meetings.filter(m => key === 'client' || m.client === draft.client).map(m => m[key]).filter(Boolean))).map(value => <option key={value!}>{value}</option>)}</datalist>}</label>)}</div>
              <div className="mt-4 flex flex-wrap items-end gap-4">
                <TranscriptionLanguageControl />
                <div className="mt-4 flex flex-wrap gap-3 self-start">
                  <Button size="lg" onClick={onStartRecording} className="h-12 rounded-xl bg-recording px-6 text-recording-foreground shadow-lg shadow-red-950/15 hover:bg-recording/90">
                    <Mic className="h-5 w-5" /> {t('recording.start')}
                  </Button>
                  {betaFeatures.importAndRetranscribe && (
                    <Button size="lg" variant="outline" onClick={() => openImportDialog()} className="h-12 rounded-xl">
                      <Import /> {t('home.importAudio')}
                    </Button>
                  )}
                </div>
              </div>
              {recoverableCount > 0 && (
                <button className="mt-6 flex items-center gap-2 text-sm font-medium text-brand hover:underline" onClick={onOpenRecovery}>
                  {recoverableCount} {locale === 'es' ? (recoverableCount === 1 ? 'reunión recuperable' : 'reuniones recuperables') : (recoverableCount === 1 ? 'recoverable meeting' : 'recoverable meetings')} <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </Surface>

          <Surface className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">{t('home.ready')}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('home.localPrivacyDescription')}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <LockKeyhole className="h-5 w-5" />
              </div>
            </div>
            <HomeReadinessControls hasMicrophone={hasMicrophone} hasSystemAudio={hasSystemAudio} />
          </Surface>

          <Surface className={desktopCapabilities.wikiEnabled ? 'overflow-hidden' : 'overflow-hidden lg:col-span-2'}>
            <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
              <div>
                <h2 className="font-semibold">{t('home.recent')}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{meetings.length} {locale === 'es' ? (meetings.length === 1 ? 'reunión' : 'reuniones') : (meetings.length === 1 ? 'meeting' : 'meetings')}</p>
              </div>
              {meetings.length > 0 && <button onClick={() => { if (isCollapsed) toggleCollapse(); }} className="text-sm font-medium text-brand hover:underline">{t('home.viewAll')}</button>}
            </div>
            {recent.length > 0 ? (
              <div className="divide-y divide-border/60">
                {recent.map(meeting => (
                  <button key={meeting.id} onClick={() => openMeeting(meeting)} className="group flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-muted/45">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand"><Mic className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{meeting.title}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {[meeting.client, meeting.project].filter(Boolean).join(' · ') || t('meeting.details')}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Mic />}
                title={t('home.noRecent')}
                description={t('home.noRecentDescription')}
                action={<Button variant="outline" onClick={onStartRecording}>{t('recording.start')}</Button>}
              />
            )}
          </Surface>

          {desktopCapabilities.wikiEnabled && <HomeWikiStats />}
        </section>
      </div>
    </main>
  );
}
