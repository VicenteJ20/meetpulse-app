'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, FileText, FolderKanban, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { WikiTenantControls } from '@/components/WikiTenantControls';
import { usePreferredWikiTenant } from '@/hooks/usePreferredWikiTenant';
import { WikiApi, type WikiSummary } from '@/services/wiki-api';
import { Surface } from '@/components/ui/product';
import { useTranslation } from '@/contexts/UiPreferencesContext';

export function HomeWikiStats() {
  const router = useRouter();
  const { meetings } = useSidebar();
  const { t, formatDate } = useTranslation();
  const preferred = usePreferredWikiTenant();
  const [summary, setSummary] = useState<WikiSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const local = useMemo(() => {
    const projects = new Set(meetings.map(meeting => `${meeting.client?.trim() || ''}/${meeting.project?.trim() || ''}`).filter(value => !value.endsWith('/')));
    return { meetings: meetings.length, projects: projects.size };
  }, [meetings]);

  const loadSummary = useCallback(async () => {
    if (!preferred.tenantId) {
      setSummary(null);
      return;
    }
    setLoading(true);
    try { setSummary(await new WikiApi(preferred.config).summary()); }
    catch { setSummary(null); }
    finally { setLoading(false); }
  }, [preferred.config, preferred.tenantId]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const workspaceName = preferred.activeTenant?.display_name || preferred.activeTenant?.tenant_id || '';
  const hasWorkspace = preferred.status === 'ready' && Boolean(preferred.tenantId);

  return <Surface className="flex min-h-full flex-col p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand"><BookOpen className="h-5 w-5" /></div>
        <div><h2 className="font-semibold">{t('wiki.title')}</h2><p className="mt-0.5 text-xs text-muted-foreground">{t('wiki.subtitle')}</p></div>
      </div>
      <button onClick={() => loadSummary()} disabled={loading || !hasWorkspace} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" title={t('wiki.refresh')}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
    </div>

    <div className="mt-4">
      {preferred.status === 'loading' ? (
        <div className="h-9 w-48 animate-pulse rounded-lg bg-muted" />
      ) : preferred.status === 'error' ? (
        <p className="text-sm text-destructive">{preferred.error || t('wiki.workspaceUnavailableDescription')}</p>
      ) : preferred.status === 'empty' ? (
        <WikiTenantControls
          tenants={preferred.tenants}
          currentTenantId=""
          onSelect={preferred.selectTenant}
          onChanged={preferred.loadTenants}
          emptyState
        />
      ) : (
        <>
          <WikiTenantControls
            tenants={preferred.tenants}
            currentTenantId={preferred.tenantId}
            onSelect={preferred.selectTenant}
            onChanged={preferred.loadTenants}
          />
          {workspaceName && (
            <p className="mt-2 text-xs text-muted-foreground">{t('wiki.savesHere').replace('{name}', workspaceName)}</p>
          )}
        </>
      )}
    </div>

    <div className="mt-6 grid grid-cols-2 gap-3">
      <div className="rounded-xl bg-muted/55 p-3"><FolderKanban className="h-4 w-4 text-brand" /><p className="mt-3 text-2xl font-semibold">{hasWorkspace ? summary?.project_count ?? '—' : local.projects}</p><p className="mt-1 text-xs text-muted-foreground">{t('wiki.projects')}</p></div>
      <div className="rounded-xl bg-muted/55 p-3"><FileText className="h-4 w-4 text-brand" /><p className="mt-3 text-2xl font-semibold">{hasWorkspace ? summary?.wiki_page_count ?? '—' : local.meetings}</p><p className="mt-1 text-xs text-muted-foreground">{hasWorkspace ? t('wiki.knowledgePages') : t('nav.meetings')}</p></div>
    </div>
    <div className="mt-auto pt-5">
      {summary?.last_activity_at && <p className="mb-3 text-xs text-muted-foreground">{t('wiki.lastActivity')}: {formatDate(summary.last_activity_at, { dateStyle: 'medium' })}</p>}
      <button onClick={() => router.push('/wiki')} className="flex w-full items-center justify-between rounded-xl border border-border px-3.5 py-3 text-sm font-semibold transition hover:bg-muted">
        {hasWorkspace ? t('wiki.openPreferredWorkspace') : t('wiki.chooseWorkspace')} <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  </Surface>;
}
