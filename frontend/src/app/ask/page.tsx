'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { invoke } from '@tauri-apps/api/core';
import { Loader2, Plus, RefreshCw, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LiveAssistantDockHost, useAssistantTarget } from '@/contexts/AssistantContext';
import { useTranslation } from '@/contexts/UiPreferencesContext';

type RecentSession = { id: string; createdAt: string; title: string };
type IndexStatus = {
  ready: boolean;
  indexing: boolean;
  indexed: number;
  total: number;
  missingMeetings: number;
  error?: string;
};
type Conversation = { id: string; title: string; initialQuestion?: string };

export default function AskPage() {
  const { t, formatDate } = useTranslation();
  const [conversation, setConversation] = useState<Conversation>({ id: 'ask-global', title: t('ask.newConversation') });
  const [recent, setRecent] = useState<RecentSession[]>([]);
  const [index, setIndex] = useState<IndexStatus>();
  const [rebuilding, setRebuilding] = useState(false);

  useAssistantTarget({
    id: conversation.id,
    title: conversation.title,
    allMeetings: true,
    initialQuestion: conversation.initialQuestion,
  });

  const refresh = useCallback(async () => {
    const [sessions, status] = await Promise.all([
      invoke<RecentSession[]>('desktop_assistant_recent_sessions'),
      invoke<IndexStatus>('desktop_search_status'),
    ]);
    setRecent(sessions);
    setIndex(status);
  }, []);

  useEffect(() => {
    let mounted = true;
    const read = async () => {
      try {
        const [sessions, status] = await Promise.all([
          invoke<RecentSession[]>('desktop_assistant_recent_sessions'),
          invoke<IndexStatus>('desktop_search_status'),
        ]);
        if (mounted) {
          setRecent(sessions);
          setIndex(status);
        }
      } catch (error) {
        console.warn('Could not load Ask page data:', error);
      }
    };
    void read();
    const timer = window.setInterval(() => void read(), 5000);
    const params = new URLSearchParams(window.location.search);
    const initialQuestion = params.get('q')?.trim();
    if (initialQuestion) {
      setConversation({ id: `ask-${crypto.randomUUID()}`, title: initialQuestion, initialQuestion });
    }
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const startNew = () => setConversation({
    id: `ask-${crypto.randomUUID()}`,
    title: t('ask.newConversation'),
  });

  const rebuildIndex = async () => {
    setRebuilding(true);
    try {
      await invoke('desktop_search_index', { cancel: false });
      await refresh();
    } catch (error) {
      console.error('Could not rebuild the local search index:', error);
    } finally {
      setRebuilding(false);
    }
  };

  const statusLabel = index?.indexing
    ? t('ask.indexUpdating')
    : index?.ready
      ? t('ask.indexReady')
      : t('ask.indexUnavailable');
  const statusDetail = index
    ? t('ask.indexDetail')
      .replace('{chunks}', String(index.indexed))
      .replace('{total}', String(index.total))
    : t('ask.indexLoading');

  return (
    <main className="ask-page grid h-full min-h-0 grid-cols-[272px_minmax(0,1fr)] overflow-hidden bg-muted/20">
      <aside aria-label={t('ask.conversations')} className="flex min-h-0 flex-col gap-5 overflow-y-auto border-r border-border bg-background p-4">
        <Button className="w-full justify-start" onClick={startNew}>
          <Plus /> {t('ask.newConversation')}
        </Button>

        <section aria-labelledby="ask-recent-title">
          <h2 id="ask-recent-title" className="mb-1 px-2 text-xs font-semibold text-muted-foreground">
            {t('ask.recent')}
          </h2>
          <div className="grid gap-0.5">
            {recent.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setConversation({ id: item.id, title: item.title })}
                aria-current={conversation.id === item.id ? 'page' : undefined}
                className="grid gap-1 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-muted aria-[current=page]:bg-accent"
              >
                <span className="truncate text-sm font-medium">{item.title || t('ask.newConversation')}</span>
                <span className="text-xs text-muted-foreground">
                  {item.createdAt ? formatDate(item.createdAt, { dateStyle: 'medium' }) : ''}
                </span>
              </button>
            ))}
            {recent.length === 0 && <p className="px-2.5 py-2 text-sm text-muted-foreground">{t('ask.noRecent')}</p>}
          </div>
        </section>

        <section className="mt-auto rounded-lg border border-border bg-card p-3" aria-labelledby="ask-index-title">
          <h2 id="ask-index-title" className="mb-2 text-xs font-semibold text-muted-foreground">{t('ask.localIndex')}</h2>
          <div className="flex items-center gap-2 text-sm">
            <span className={`size-2 rounded-full ${index?.ready ? 'bg-success' : 'bg-muted-foreground/50'}`} />
            <strong className="font-medium">{statusLabel}</strong>
          </div>
          <p className="my-2 text-xs leading-relaxed text-muted-foreground">{statusDetail}</p>
          {index?.error && <p className="mb-2 text-xs text-destructive">{index.error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button size="sm" variant="outline" onClick={rebuildIndex} disabled={rebuilding || index?.indexing}>
              {rebuilding || index?.indexing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {rebuilding || index?.indexing ? t('ask.rebuilding') : t('ask.rebuild')}
            </Button>
            <Link href="/settings?tab=privacy" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <Settings2 className="size-3.5" /> {t('ask.indexSettings')}
            </Link>
          </div>
        </section>
      </aside>
      <section aria-label={t('ask.conversation')} className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-card">
        <LiveAssistantDockHost isOpen />
      </section>
    </main>
  );
}
