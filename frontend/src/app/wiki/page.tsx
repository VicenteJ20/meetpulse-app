'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Building2, ChevronRight, Clipboard, FileCheck2, FileText, FolderKanban, Loader2, RefreshCw, Save, Search, Sparkles, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { DEFAULT_WIKI_CONFIG, getWikiConfig, type WikiConfig } from '@/services/wiki-config';
import { WikiApi, WikiApiError, type WikiActivity, type WikiClient, type WikiDocument, type WikiDocumentContent, type WikiProject, type WikiSummary } from '@/services/wiki-api';
import { BlockNoteSummaryView, type BlockNoteSummaryViewRef } from '@/components/AISummary/BlockNoteSummaryView';
import { WikiTenantControls } from '@/components/WikiTenantControls';
import { Button } from '@/components/ui/button';
import { EmptyState, PageHeader, Surface } from '@/components/ui/product';
import { useTranslation } from '@/contexts/UiPreferencesContext';

export default function WikiPage() {
  const router = useRouter();
  const { t, formatDate } = useTranslation();
  const [config, setConfig] = useState<WikiConfig>(DEFAULT_WIKI_CONFIG);
  const [summary, setSummary] = useState<WikiSummary | null>(null);
  const [clients, setClients] = useState<WikiClient[]>([]);
  const [projects, setProjects] = useState<WikiProject[]>([]);
  const [documents, setDocuments] = useState<WikiDocument[]>([]);
  const [activity, setActivity] = useState<WikiActivity[]>([]);
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [selected, setSelected] = useState<WikiDocumentContent | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [contextDraft, setContextDraft] = useState('');
  const [savingContext, setSavingContext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tenantResolved, setTenantResolved] = useState(false);
  const contextEditorRef = useRef<BlockNoteSummaryViewRef>(null);
  const api = useCallback(() => new WikiApi(config), [config]);

  const refresh = useCallback(async () => {
    if (!tenantResolved) return;
    const next = getWikiConfig();
    setConfig(next);
    setError(null);
    if (!next.tenantId) return;
    setLoading(true);
    try {
      const client = new WikiApi(next);
      const [nextSummary, nextClients, nextActivity] = await Promise.all([client.summary(), client.clients(100), client.activity(12)]);
      setSummary(nextSummary);
      setClients(nextClients.items);
      setActivity(nextActivity.entries);
    } catch (reason) {
      if (getWikiConfig().tenantId === next.tenantId) setError(reason instanceof Error ? reason.message : 'Unable to load Wiki.');
    } finally { setLoading(false); }
  }, [tenantResolved]);

  useEffect(() => {
    refresh();
    window.addEventListener('wiki-config-changed', refresh);
    return () => window.removeEventListener('wiki-config-changed', refresh);
  }, [refresh]);

  useEffect(() => {
    if (!config.tenantId) return;
    setProjects([]);
    setProjectId('');
    setDocuments([]);
    setSelected(null);
    if (!clientId) return;
    api().projects(clientId, 100).then(result => setProjects(result.items)).catch(reason => setError(reason instanceof Error ? reason.message : 'Unable to load projects.'));
  }, [api, clientId, config.tenantId]);

  useEffect(() => {
    if (!config.tenantId) return;
    setDocuments([]);
    setSelected(null);
    if (!projectId) return;
    setDocumentLoading(true);
    const client = api();
    client.documents(clientId || undefined, projectId || undefined).then(async result => {
      const userFiles = result.items.filter(item => item.document !== 'index');
      setDocuments(userFiles);
      if (userFiles[0]) setSelected(await client.document(userFiles[0].document, clientId || undefined, projectId || undefined));
    }).catch(reason => {
      if (!(reason instanceof WikiApiError && reason.status === 404)) setError(reason instanceof Error ? reason.message : 'Unable to load documents.');
    }).finally(() => setDocumentLoading(false));
  }, [api, clientId, config.tenantId, projectId]);

  useEffect(() => {
    if (selected?.document === 'context') setContextDraft(selected.content_markdown);
  }, [selected]);

  const selectDocument = async (document: WikiDocument) => {
    setDocumentLoading(true);
    setError(null);
    try { setSelected(await api().document(document.document, clientId || undefined, projectId || undefined)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load document.'); }
    finally { setDocumentLoading(false); }
  };

  const saveContext = async () => {
    setSavingContext(true);
    setError(null);
    try {
      const markdown = await contextEditorRef.current?.getMarkdown() || contextDraft;
      setContextDraft(markdown);
      setSelected(await api().updateProjectContext(clientId, projectId, markdown));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save project context.'); }
    finally { setSavingContext(false); }
  };

  const visibleDocuments = useMemo(() => documents.filter(document => document.title.toLowerCase().includes(query.toLowerCase())), [documents, query]);
  const activeClient = clients.find(client => client.client_id === clientId);
  const activeProject = projects.find(project => project.project_id === projectId);

  if (!tenantResolved || !config.tenantId) {
    return <main className="flex h-screen items-center justify-center bg-background p-8">
      <Surface className="w-full max-w-xl p-8">
        <EmptyState
          icon={<Building2 />}
          title={t('wiki.chooseWorkspace')}
          description={t('wiki.chooseWorkspaceDescription')}
          action={<WikiTenantControls emptyState onResolved={() => setTenantResolved(true)} />}
        />
      </Surface>
    </main>;
  }

  const metric = (label: string, value: number | string, Icon: typeof Users) => (
    <Surface className="p-4">
      <div className="flex items-center justify-between text-muted-foreground"><p className="text-xs font-medium">{label}</p><Icon className="h-4 w-4 text-brand" /></div>
      <p className="mt-4 text-2xl font-semibold">{value}</p>
    </Surface>
  );

  return (
    <main className="h-screen overflow-hidden bg-background p-5">
      <div className="mx-auto flex h-full max-w-[1600px] flex-col gap-4">
        <Surface className="shrink-0 px-5 py-4">
          <PageHeader
            eyebrow={projectId ? `${clientId} / ${projectId}` : t('wiki.workspace')}
            title={t('wiki.title')}
            description={projectId ? `${documents.length} ${t('wiki.documents').toLowerCase()}` : t('wiki.subtitle')}
            actions={<>
              <WikiTenantControls />
              <Button variant="ghost" onClick={() => router.push('/settings')}>{t('nav.settings')}</Button>
              <Button onClick={refresh} disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}{t('wiki.refresh')}</Button>
            </>}
          />
        </Surface>

        {error && <div className="shrink-0 rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive">{error}</div>}

        <section className={`grid min-h-0 flex-1 gap-4 ${projectId ? 'lg:grid-cols-[17rem_18rem_minmax(0,1fr)]' : 'lg:grid-cols-[17rem_minmax(0,1fr)]'}`}>
          <Surface className="custom-scrollbar min-h-0 overflow-y-auto p-3">
            <div className="mb-3 flex items-center justify-between px-2"><h2 className="text-sm font-semibold">{t('wiki.workspace')}</h2><span className="text-xs text-muted-foreground">{clients.length}</span></div>
            <button onClick={() => { setClientId(''); setProjectId(''); }} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm ${!clientId ? 'bg-brand/10 font-medium text-brand' : 'text-muted-foreground hover:bg-muted'}`}><Sparkles className="h-4 w-4" />{t('wiki.workspaceHome')}</button>
            <div className="mt-3 border-t border-border pt-3">
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t('wiki.clients')}</p>
              {clients.map(client => <div key={client.client_id}>
                <button onClick={() => { setClientId(client.client_id); setProjectId(''); }} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm ${clientId === client.client_id ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/70'}`}>
                  <Building2 className="h-4 w-4" /><span className="min-w-0 flex-1 truncate">{client.client_id}</span><span className="text-xs">{client.project_count}</span><ChevronRight className={`h-3.5 w-3.5 transition ${clientId === client.client_id ? 'rotate-90' : ''}`} />
                </button>
                {clientId === client.client_id && <div className="ml-5 border-l border-border py-1 pl-2">{projects.map(project => <button key={project.project_id} onClick={() => setProjectId(project.project_id)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${projectId === project.project_id ? 'bg-brand/8 font-medium text-brand' : 'text-muted-foreground hover:bg-muted'}`}><FolderKanban className="h-3.5 w-3.5" /><span className="truncate">{project.project_id}</span></button>)}</div>}
              </div>)}
            </div>
            {activity.length > 0 && <div className="mt-5 border-t border-border px-2 pt-4"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t('wiki.recentUpdates')}</p><div className="mt-3 space-y-3">{activity.slice(0, 4).map((entry, index) => <div key={index} className="text-xs text-muted-foreground"><p className="truncate font-medium text-foreground">{String(entry.client_id || t('wiki.workspace'))}{entry.project_id ? ` / ${String(entry.project_id)}` : ''}</p><p className="mt-0.5">{formatDate(entry.timestamp, { dateStyle: 'medium' })}</p></div>)}</div></div>}
          </Surface>

          {projectId && <Surface className="custom-scrollbar min-h-0 overflow-y-auto p-3">
            <div className="mb-3 px-2"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">{t('wiki.documents')}</h2><span className="text-xs text-muted-foreground">{documents.length}</span></div><div className="relative mt-3"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('wiki.searchDocuments')} className="w-full rounded-xl border border-input bg-background py-2 pl-9 pr-3 text-sm" /></div></div>
            {visibleDocuments.length ? <ul className="space-y-1">{visibleDocuments.map(document => <li key={document.key}><button onClick={() => selectDocument(document)} className={`w-full rounded-xl px-3 py-2.5 text-left ${selected?.document === document.document ? 'bg-brand/10 text-brand' : 'hover:bg-muted'}`}><div className="flex items-center gap-2"><FileText className="h-4 w-4 shrink-0" /><span className="truncate text-sm font-medium">{document.title}</span></div>{document.updated_at && <p className="mt-1 pl-6 text-xs text-muted-foreground">{formatDate(document.updated_at, { dateStyle: 'medium' })}</p>}</button></li>)}</ul> : <EmptyState icon={<FileText />} title={t('wiki.noDocuments')} description={t('wiki.noDocumentsDescription')} />}
          </Surface>}

          <Surface className="custom-scrollbar min-h-0 overflow-y-auto">
            {!projectId ? (
              <div className="p-6 lg:p-8">
                <PageHeader title={clientId || t('wiki.overview')} description={clientId ? 'Choose a project to explore its durable knowledge.' : t('wiki.overviewDescription')} />
                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {!clientId && metric(t('wiki.clients'), summary?.client_count ?? clients.length, Users)}
                  {metric(t('wiki.projects'), activeClient?.project_count ?? summary?.project_count ?? projects.length, FolderKanban)}
                  {metric(t('wiki.publishedNotes'), activeClient?.source_count ?? summary?.source_count ?? 0, FileCheck2)}
                  {metric(t('wiki.knowledgePages'), summary?.wiki_page_count ?? 0, BookOpen)}
                </div>
                <div className="mt-8 grid gap-3 md:grid-cols-2">
                  {(clientId ? projects : clients).map(item => {
                    const id = 'client_id' in item ? item.client_id : item.project_id;
                    return <button key={id} onClick={() => 'client_id' in item ? setClientId(item.client_id) : setProjectId(item.project_id)} className="group rounded-2xl border border-border bg-card p-5 text-left transition hover:border-brand/35 hover:bg-muted/25"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">{'client_id' in item ? <Building2 className="h-5 w-5" /> : <FolderKanban className="h-5 w-5" />}</span><span className="font-semibold">{id}</span></div><ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1" /></div></button>;
                  })}
                </div>
              </div>
            ) : documentLoading ? (
              <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand" /></div>
            ) : selected ? (
              <>
                <header className="sticky top-0 z-10 flex items-start justify-between gap-5 border-b border-border bg-card/92 px-7 py-5 backdrop-blur-xl">
                  <div><p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand">{clientId} / {projectId}</p><h2 className="text-2xl font-semibold tracking-[-0.03em]">{selected.document === 'context' ? 'Project context' : selected.title}</h2>{selected.updated_at && <p className="mt-1 text-xs text-muted-foreground">{t('common.updated')} {formatDate(selected.updated_at, { dateStyle: 'medium', timeStyle: 'short' })}</p>}</div>
                  {selected.document === 'context' ? <Button onClick={saveContext} disabled={savingContext}>{savingContext ? <Loader2 className="animate-spin" /> : <Save />}{t('wiki.saveContext')}</Button> : <Button variant="outline" onClick={() => navigator.clipboard.writeText(selected.content_markdown)}><Clipboard />{t('common.copy')}</Button>}
                </header>
                <div className="px-7 py-6"><BlockNoteSummaryView key={selected.key} ref={selected.document === 'context' ? contextEditorRef : undefined} summaryData={{ markdown: selected.document === 'context' ? contextDraft || '# Project context\n\nAdd decisions, background, links, or durable project information.' : selected.content_markdown }} editable={selected.document === 'context'} /></div>
              </>
            ) : <EmptyState className="min-h-[420px]" icon={<FileText />} title={t('wiki.noDocuments')} description={t('wiki.noDocumentsDescription')} />}
          </Surface>
        </section>
      </div>
    </main>
  );
}
