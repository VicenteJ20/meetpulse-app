'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, FileText, FolderKanban, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { DEFAULT_WIKI_CONFIG, getWikiConfig, type WikiConfig } from '@/services/wiki-config';
import { WikiApi, type WikiSummary } from '@/services/wiki-api';
import { Surface } from '@/components/ui/product';
import { useTranslation } from '@/contexts/UiPreferencesContext';

export function HomeWikiStats() {
  const router = useRouter();
  const { meetings } = useSidebar();
  const { t, formatDate } = useTranslation();
  const [config, setConfig] = useState<WikiConfig>(DEFAULT_WIKI_CONFIG);
  const [summary, setSummary] = useState<WikiSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const local = useMemo(() => {
    const projects = new Set(meetings.map(meeting => `${meeting.client?.trim() || ''}/${meeting.project?.trim() || ''}`).filter(value => !value.endsWith('/')));
    return { meetings: meetings.length, projects: projects.size };
  }, [meetings]);
  const load = useCallback(async (next = getWikiConfig()) => {
    setConfig(next);
    if (!next.tenantId) { setSummary(null); return; }
    setLoading(true);
    try { setSummary(await new WikiApi(next).summary()); }
    catch { setSummary(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    load();
    const onChange = (event: Event) => load((event as CustomEvent<WikiConfig>).detail);
    window.addEventListener('wiki-config-changed', onChange);
    return () => window.removeEventListener('wiki-config-changed', onChange);
  }, [load]);

  return <Surface className="flex min-h-full flex-col p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand"><BookOpen className="h-5 w-5" /></div>
        <div><h2 className="font-semibold">{t('wiki.title')}</h2><p className="mt-0.5 text-xs text-muted-foreground">{t('wiki.subtitle')}</p></div>
      </div>
      <button onClick={() => load()} disabled={loading} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" title={t('wiki.refresh')}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
    </div>
    <div className="mt-6 grid grid-cols-2 gap-3">
      <div className="rounded-xl bg-muted/55 p-3"><FolderKanban className="h-4 w-4 text-brand" /><p className="mt-3 text-2xl font-semibold">{config.tenantId ? summary?.project_count ?? '—' : local.projects}</p><p className="mt-1 text-xs text-muted-foreground">{t('wiki.projects')}</p></div>
      <div className="rounded-xl bg-muted/55 p-3"><FileText className="h-4 w-4 text-brand" /><p className="mt-3 text-2xl font-semibold">{config.tenantId ? summary?.wiki_page_count ?? '—' : local.meetings}</p><p className="mt-1 text-xs text-muted-foreground">{config.tenantId ? t('wiki.knowledgePages') : t('nav.meetings')}</p></div>
    </div>
    <div className="mt-auto pt-5">
      {summary?.last_activity_at && <p className="mb-3 text-xs text-muted-foreground">{t('wiki.lastActivity')}: {formatDate(summary.last_activity_at, { dateStyle: 'medium' })}</p>}
      <button onClick={() => router.push('/wiki')} className="flex w-full items-center justify-between rounded-xl border border-border px-3.5 py-3 text-sm font-semibold transition hover:bg-muted">
        {config.tenantId ? t('wiki.workspaceHome') : t('wiki.chooseWorkspace')} <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  </Surface>;
}
