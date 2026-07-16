'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Building2,
  ChevronRight,
  Clipboard,
  Clock3,
  FileText,
  FolderKanban,
  LayoutGrid,
  Library,
  Loader2,
  Menu,
  RefreshCw,
  Save,
  Search,
  Sparkles,
} from 'lucide-react';
import { BlockNoteSummaryView, type BlockNoteSummaryViewRef } from '@/components/AISummary/BlockNoteSummaryView';
import { WikiTenantControls } from '@/components/WikiTenantControls';
import { Button } from '@/components/ui/button';
import { EmptyState, Surface } from '@/components/ui/product';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { getWikiConfig, saveWikiConfig, type WikiConfig } from '@/services/wiki-config';
import {
  listWikiTenants,
  WikiApi,
  WikiApiError,
  type WikiActivity,
  type WikiClient,
  type WikiDocument,
  type WikiDocumentContent,
  type WikiProject,
  type WikiSummary,
  type WikiTenant,
} from '@/services/wiki-api';

type BootstrapState = 'loading' | 'ready' | 'empty' | 'error';
type NavigationContent = 'workspace' | 'client' | 'project' | 'document';

function WikiShellSkeleton({ label }: { label: string }) {
  return (
    <main className="h-screen overflow-hidden bg-background p-3 sm:p-5">
      <p className="sr-only" role="status">{label}</p>
      <div className="mx-auto flex h-full max-w-[1700px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5">
          <div className="flex items-center gap-3"><div className="h-9 w-9 animate-pulse rounded-xl bg-muted" /><div><div className="h-3 w-24 animate-pulse rounded bg-muted" /><div className="mt-2 h-2.5 w-40 animate-pulse rounded bg-muted" /></div></div>
          <div className="h-9 w-40 animate-pulse rounded-lg bg-muted" />
        </header>
        <div className="grid min-h-0 flex-1 md:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="hidden border-r border-border p-4 md:block">
            <div className="h-9 animate-pulse rounded-xl bg-muted" />
            <div className="mt-6 space-y-3">{[0, 1, 2, 3].map(item => <div key={item} className="h-10 animate-pulse rounded-xl bg-muted/70" />)}</div>
          </aside>
          <section className="p-6 lg:p-10">
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="mt-4 h-9 w-80 max-w-full animate-pulse rounded bg-muted" />
            <div className="mt-3 h-3 w-96 max-w-full animate-pulse rounded bg-muted" />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map(item => <div key={item} className="h-40 animate-pulse rounded-2xl bg-muted/70" />)}</div>
          </section>
        </div>
      </div>
    </main>
  );
}

export default function WikiPage() {
  const { t, formatDate } = useTranslation();
  const [bootstrap, setBootstrap] = useState<BootstrapState>('loading');
  const [bootstrapError, setBootstrapError] = useState('');
  const [tenants, setTenants] = useState<WikiTenant[]>([]);
  const [config, setConfig] = useState<WikiConfig>(() => getWikiConfig());
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
  const [navigationLoading, setNavigationLoading] = useState(false);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [contextDraft, setContextDraft] = useState('');
  const [savingContext, setSavingContext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const contextEditorRef = useRef<BlockNoteSummaryViewRef>(null);

  const resetNavigation = useCallback(() => {
    setClientId('');
    setProjectId('');
    setProjects([]);
    setDocuments([]);
    setSelected(null);
    setQuery('');
  }, []);

  const clearWorkspaceData = useCallback(() => {
    resetNavigation();
    setSummary(null);
    setClients([]);
    setActivity([]);
    setError(null);
  }, [resetNavigation]);

  const loadTenants = useCallback(async (preferredTenantId?: string) => {
    setBootstrapError('');
    try {
      const nextTenants = await listWikiTenants();
      setTenants(nextTenants);
      if (!nextTenants.length) {
        const nextConfig = saveWikiConfig({ ...getWikiConfig(), tenantId: '' });
        setConfig(nextConfig);
        clearWorkspaceData();
        setBootstrap('empty');
        return;
      }
      const saved = preferredTenantId || getWikiConfig().tenantId;
      const selectedTenantId = nextTenants.some(item => item.tenant_id === saved) ? saved : nextTenants[0].tenant_id;
      const nextConfig = saveWikiConfig({ ...getWikiConfig(), tenantId: selectedTenantId });
      setConfig(nextConfig);
      clearWorkspaceData();
      setBootstrap('ready');
    } catch (reason) {
      setBootstrapError(reason instanceof Error ? reason.message : t('wiki.errorGeneric'));
      setBootstrap('error');
    }
  }, [clearWorkspaceData, t]);

  useEffect(() => { loadTenants(); }, [loadTenants]);

  const selectTenant = useCallback((tenantId: string) => {
    if (tenantId === config.tenantId) return;
    const next = saveWikiConfig({ ...getWikiConfig(), tenantId });
    setConfig(next);
    clearWorkspaceData();
    setMobileNavigationOpen(false);
  }, [clearWorkspaceData, config.tenantId]);

  const refreshWorkspace = useCallback(async () => {
    if (!config.tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const api = new WikiApi(config);
      const [nextSummary, nextClients, nextActivity] = await Promise.all([api.summary(), api.clients(100), api.activity(20)]);
      setSummary(nextSummary);
      setClients(nextClients.items);
      setActivity(nextActivity.entries);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('wiki.errorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [config, t]);

  useEffect(() => { if (bootstrap === 'ready') refreshWorkspace(); }, [bootstrap, refreshWorkspace]);

  useEffect(() => {
    let active = true;
    setProjects([]);
    setProjectId('');
    setDocuments([]);
    setSelected(null);
    if (!clientId || !config.tenantId) return () => { active = false; };
    setNavigationLoading(true);
    new WikiApi(config).projects(clientId, 100)
      .then(result => { if (active) setProjects(result.items); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : t('wiki.errorGeneric')); })
      .finally(() => { if (active) setNavigationLoading(false); });
    return () => { active = false; };
  }, [clientId, config, t]);

  useEffect(() => {
    let active = true;
    setDocuments([]);
    setSelected(null);
    if (!projectId || !config.tenantId) return () => { active = false; };
    setNavigationLoading(true);
    new WikiApi(config).documents(clientId, projectId)
      .then(result => { if (active) setDocuments(result.items.filter(item => item.document !== 'index')); })
      .catch(reason => {
        if (active && !(reason instanceof WikiApiError && reason.status === 404)) setError(reason instanceof Error ? reason.message : t('wiki.errorGeneric'));
      })
      .finally(() => { if (active) setNavigationLoading(false); });
    return () => { active = false; };
  }, [clientId, config, projectId, t]);

  useEffect(() => {
    if (selected?.document === 'context') setContextDraft(selected.content_markdown);
  }, [selected]);

  const selectClient = (nextClientId: string) => {
    setClientId(nextClientId);
    setProjectId('');
    setSelected(null);
    setQuery('');
    setMobileNavigationOpen(false);
  };

  const selectProject = (nextProjectId: string) => {
    setProjectId(nextProjectId);
    setSelected(null);
    setQuery('');
    setMobileNavigationOpen(false);
  };

  const selectDocument = async (document: WikiDocument) => {
    setDocumentLoading(true);
    setError(null);
    try {
      setSelected(await new WikiApi(config).document(document.document, clientId, projectId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('wiki.errorGeneric'));
    } finally {
      setDocumentLoading(false);
    }
  };

  const saveContext = async () => {
    setSavingContext(true);
    setError(null);
    try {
      const markdown = await contextEditorRef.current?.getMarkdown() || contextDraft;
      setContextDraft(markdown);
      setSelected(await new WikiApi(config).updateProjectContext(clientId, projectId, markdown));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('wiki.errorGeneric'));
    } finally {
      setSavingContext(false);
    }
  };

  const goWorkspaceHome = () => {
    resetNavigation();
    setMobileNavigationOpen(false);
  };

  const filteredClients = useMemo(() => clients.filter(client => client.client_id.toLowerCase().includes(query.toLowerCase())), [clients, query]);
  const filteredProjects = useMemo(() => projects.filter(project => project.project_id.toLowerCase().includes(query.toLowerCase())), [projects, query]);
  const filteredDocuments = useMemo(() => documents.filter(document => document.title.toLowerCase().includes(query.toLowerCase())), [documents, query]);
  const contextDocument = documents.find(document => document.document === 'context');
  const knowledgeDocuments = filteredDocuments.filter(document => document.document !== 'context');
  const activeTenant = tenants.find(tenant => tenant.tenant_id === config.tenantId);
  const activeClient = clients.find(client => client.client_id === clientId);
  const activeProject = projects.find(project => project.project_id === projectId);
  const content: NavigationContent = selected ? 'document' : projectId ? 'project' : clientId ? 'client' : 'workspace';

  if (bootstrap === 'loading') return <WikiShellSkeleton label={t('wiki.loadingWorkspace')} />;

  if (bootstrap === 'error') {
    const authenticationError = /sign in|google/i.test(bootstrapError);
    return (
      <main className="flex h-screen items-center justify-center bg-background p-6">
        <Surface className="w-full max-w-lg">
          <EmptyState
            icon={<AlertCircle />}
            title={authenticationError ? t('wiki.authenticationRequired') : t('wiki.workspaceUnavailableTitle')}
            description={authenticationError ? t('wiki.authenticationRequiredDescription') : t('wiki.workspaceUnavailableDescription')}
            action={<Button onClick={() => { setBootstrap('loading'); loadTenants(); }}><RefreshCw />{t('common.tryAgain')}</Button>}
          />
          <details className="mx-6 mb-6 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium">{t('wiki.technicalDetails')}</summary>
            <p className="mt-2 break-words">{bootstrapError}</p>
          </details>
        </Surface>
      </main>
    );
  }

  if (bootstrap === 'empty') {
    return (
      <main className="flex h-screen items-center justify-center bg-background p-6">
        <Surface className="w-full max-w-xl overflow-hidden">
          <div className="border-b border-border bg-gradient-to-br from-brand/10 via-transparent to-transparent px-8 py-7">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-white shadow-lg shadow-brand/20"><Library /></div>
            <h1 className="mt-6 text-2xl font-semibold tracking-[-0.035em]">{t('wiki.buildWorkspace')}</h1>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{t('wiki.buildWorkspaceDescription')}</p>
          </div>
          <div className="px-8 py-7">
            <WikiTenantControls tenants={tenants} currentTenantId="" onSelect={selectTenant} onChanged={loadTenants} emptyState />
          </div>
        </Surface>
      </main>
    );
  }

  const navigation = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-3 pb-3">
        <button onClick={goWorkspaceHome} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${content === 'workspace' ? 'bg-brand/10 font-medium text-brand' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
          <LayoutGrid className="h-4 w-4" /><span className="flex-1">{t('wiki.workspaceHome')}</span>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <div className="mb-2 flex items-center justify-between px-3"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t('wiki.clients')}</p><span className="text-xs text-muted-foreground">{clients.length}</span></div>
        <div className="space-y-1">
          {clients.map(client => (
            <div key={client.client_id}>
              <button onClick={() => selectClient(client.client_id)} className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition ${clientId === client.client_id ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'}`}>
                <Building2 className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{client.client_id}</span><span className="text-xs">{client.project_count}</span><ChevronRight className={`h-3.5 w-3.5 transition ${clientId === client.client_id ? 'rotate-90' : ''}`} />
              </button>
              {clientId === client.client_id && (
                <div className="ml-5 border-l border-border py-1 pl-2">
                  {navigationLoading && !projects.length ? <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('common.loading')}</div> : projects.map(project => (
                    <button key={project.project_id} onClick={() => selectProject(project.project_id)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${projectId === project.project_id ? 'bg-brand/10 font-medium text-brand' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
                      <FolderKanban className="h-3.5 w-3.5" /><span className="truncate">{project.project_id}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      {activity.length > 0 && (
        <div className="border-t border-border p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Activity className="h-3.5 w-3.5" />{t('wiki.latestActivity')}</div>
          <button onClick={() => { const entry = activity[0]; if (entry.client_id) selectClient(String(entry.client_id)); }} className="mt-2 w-full rounded-xl bg-muted/50 p-3 text-left hover:bg-muted">
            <p className="truncate text-xs font-medium text-foreground">{String(activity[0].client_id || activeTenant?.display_name || t('wiki.workspace'))}{activity[0].project_id ? ` / ${String(activity[0].project_id)}` : ''}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{formatDate(activity[0].timestamp, { dateStyle: 'medium' })}</p>
          </button>
        </div>
      )}
    </div>
  );

  const searchPlaceholder = content === 'workspace' ? t('wiki.searchClients') : content === 'client' ? t('wiki.searchProjects') : t('wiki.searchDocuments');

  return (
    <main className="h-screen overflow-hidden bg-background p-2 sm:p-4">
      <div className="mx-auto flex h-full max-w-[1700px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <header className="flex h-auto min-h-16 shrink-0 flex-wrap items-center gap-3 border-b border-border px-3 py-3 sm:px-5">
          <Sheet open={mobileNavigationOpen} onOpenChange={setMobileNavigationOpen}>
            <SheetTrigger asChild><Button size="icon" variant="ghost" className="xl:hidden" aria-label={t('wiki.openNavigation')}><Menu /></Button></SheetTrigger>
            <SheetContent side="left" className="w-[19rem] p-0">
              <SheetHeader className="border-b border-border p-4 text-left"><SheetTitle>{t('wiki.title')}</SheetTitle><SheetDescription>{activeTenant?.display_name || activeTenant?.tenant_id}</SheetDescription></SheetHeader>
              <div className="h-[calc(100%-5rem)] pt-3">{navigation}</div>
            </SheetContent>
          </Sheet>

          <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
            <button onClick={goWorkspaceHome} className="hidden font-medium text-muted-foreground hover:text-foreground sm:inline">{activeTenant?.display_name || activeTenant?.tenant_id}</button>
            {clientId && <><ChevronRight className="hidden h-4 w-4 text-muted-foreground sm:block" /><button onClick={() => selectClient(clientId)} className="hidden max-w-40 truncate font-medium text-muted-foreground hover:text-foreground sm:inline">{clientId}</button></>}
            {projectId && <><ChevronRight className="hidden h-4 w-4 text-muted-foreground sm:block" /><button onClick={() => selectProject(projectId)} className="max-w-40 truncate font-medium text-foreground">{projectId}</button></>}
            {selected && <><ChevronRight className="hidden h-4 w-4 text-muted-foreground md:block" /><span className="hidden max-w-48 truncate text-muted-foreground md:inline">{selected.title}</span></>}
          </div>

          <div className="relative order-3 w-full sm:order-none sm:w-64 lg:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder={searchPlaceholder} className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none transition focus:border-brand/50 focus:ring-2 focus:ring-brand/10" />
          </div>
          <Button size="icon" variant="ghost" onClick={refreshWorkspace} disabled={loading} aria-label={t('wiki.refresh')}>{loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}</Button>
          <WikiTenantControls tenants={tenants} currentTenantId={config.tenantId} onSelect={selectTenant} onChanged={loadTenants} />
        </header>

        {error && (
          <div className="flex shrink-0 items-center gap-3 border-b border-destructive/20 bg-destructive/8 px-5 py-2.5 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /><span className="min-w-0 flex-1 truncate">{error}</span><Button size="sm" variant="ghost" onClick={refreshWorkspace}>{t('common.tryAgain')}</Button>
          </div>
        )}

        <div className="grid min-h-0 flex-1 xl:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="hidden min-h-0 border-r border-border bg-muted/15 pt-3 xl:block">{navigation}</aside>
          <section className="custom-scrollbar min-h-0 overflow-y-auto">
            {content === 'workspace' && (
              <div className="mx-auto max-w-6xl p-5 sm:p-8 lg:p-10">
                <div className="rounded-3xl bg-gradient-to-br from-brand/12 via-brand/4 to-transparent p-6 sm:p-8">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-white shadow-lg shadow-brand/20"><Sparkles /></div>
                  <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-brand">{t('wiki.projectWorkspace')}</p>
                  <h1 className="mt-2 max-w-2xl text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">{t('wiki.workspaceWelcome').replace('{name}', activeTenant?.display_name || activeTenant?.tenant_id || t('wiki.workspace'))}</h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{t('wiki.workspaceWelcomeDescription')}</p>
                  <div className="mt-6 flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <span><strong className="text-foreground">{summary?.client_count ?? clients.length}</strong> {t('wiki.clients').toLowerCase()}</span>
                    <span><strong className="text-foreground">{summary?.project_count ?? 0}</strong> {t('wiki.projects').toLowerCase()}</span>
                    <span><strong className="text-foreground">{summary?.source_count ?? 0}</strong> {t('wiki.publishedNotes').toLowerCase()}</span>
                  </div>
                </div>

                <div className="mt-10 flex items-end justify-between gap-4">
                  <div><h2 className="text-xl font-semibold tracking-[-0.025em]">{t('wiki.chooseClient')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('wiki.chooseClientDescription')}</p></div>
                </div>
                {loading && !clients.length ? <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map(item => <div key={item} className="h-40 animate-pulse rounded-2xl bg-muted" />)}</div> : filteredClients.length ? (
                  <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredClients.map(client => (
                      <button key={client.client_id} onClick={() => selectClient(client.client_id)} className="group flex min-h-40 flex-col rounded-2xl border border-border bg-background p-5 text-left transition hover:-translate-y-0.5 hover:border-brand/35 hover:shadow-lg hover:shadow-brand/5">
                        <div className="flex items-start justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand"><Building2 /></span><ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1" /></div>
                        <h3 className="mt-5 truncate text-lg font-semibold">{client.client_id}</h3>
                        <div className="mt-auto flex items-center gap-3 pt-3 text-xs text-muted-foreground"><span>{client.project_count} {t('wiki.projects').toLowerCase()}</span><span>{client.source_count} {t('wiki.publishedNotes').toLowerCase()}</span></div>
                      </button>
                    ))}
                  </div>
                ) : <EmptyState className="mt-5 rounded-2xl border border-dashed border-border" icon={<Building2 />} title={query ? t('wiki.noSearchResults') : t('wiki.noClients')} description={query ? t('wiki.noSearchResultsDescription') : t('wiki.noClientsDescription')} />}
              </div>
            )}

            {content === 'client' && (
              <div className="mx-auto max-w-6xl p-5 sm:p-8 lg:p-10">
                <Button variant="ghost" size="sm" onClick={goWorkspaceHome} className="-ml-3 mb-5 text-muted-foreground"><ArrowLeft />{t('wiki.allClients')}</Button>
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">{t('wiki.clientWorkspace')}</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{clientId}</h1><p className="mt-2 text-sm text-muted-foreground">{t('wiki.clientDescription')}</p></div>
                  <div className="flex gap-2 rounded-xl bg-muted/60 px-4 py-3 text-sm"><FolderKanban className="h-4 w-4 text-brand" /><strong>{activeClient?.project_count ?? projects.length}</strong><span className="text-muted-foreground">{t('wiki.projects').toLowerCase()}</span></div>
                </div>
                <div className="mt-10"><h2 className="text-xl font-semibold tracking-[-0.025em]">{t('wiki.activeProjects')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('wiki.activeProjectsDescription')}</p></div>
                {navigationLoading ? <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map(item => <div key={item} className="h-44 animate-pulse rounded-2xl bg-muted" />)}</div> : filteredProjects.length ? (
                  <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredProjects.map(project => (
                      <button key={project.project_id} onClick={() => selectProject(project.project_id)} className="group flex min-h-44 flex-col rounded-2xl border border-border bg-background p-5 text-left transition hover:-translate-y-0.5 hover:border-brand/35 hover:shadow-lg hover:shadow-brand/5">
                        <div className="flex items-start justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600"><FolderKanban /></span><ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1" /></div>
                        <h3 className="mt-5 truncate text-lg font-semibold">{project.project_id}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">{project.source_count} {t('wiki.publishedNotes').toLowerCase()} · {project.wiki_page_count} {t('wiki.knowledgePages').toLowerCase()}</p>
                        {project.last_activity_at && <p className="mt-auto flex items-center gap-1.5 pt-4 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />{formatDate(project.last_activity_at, { dateStyle: 'medium' })}</p>}
                      </button>
                    ))}
                  </div>
                ) : <EmptyState className="mt-5 rounded-2xl border border-dashed border-border" icon={<FolderKanban />} title={query ? t('wiki.noSearchResults') : t('wiki.noProjects')} description={query ? t('wiki.noSearchResultsDescription') : t('wiki.noProjectsDescription')} />}
              </div>
            )}

            {content === 'project' && (
              <div className="mx-auto max-w-6xl p-5 sm:p-8 lg:p-10">
                <Button variant="ghost" size="sm" onClick={() => selectClient(clientId)} className="-ml-3 mb-5 text-muted-foreground"><ArrowLeft />{clientId}</Button>
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">{clientId} · {t('wiki.project')}</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{projectId}</h1><p className="mt-2 text-sm text-muted-foreground">{t('wiki.projectDescription')}</p></div>
                  <div className="flex gap-4 rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground"><span><strong className="text-foreground">{activeProject?.source_count ?? 0}</strong> {t('wiki.sources')}</span><span><strong className="text-foreground">{activeProject?.wiki_page_count ?? knowledgeDocuments.length}</strong> {t('wiki.pages')}</span></div>
                </div>

                {navigationLoading ? <div className="mt-10 h-48 animate-pulse rounded-2xl bg-muted" /> : (
                  <>
                    <section className="mt-10">
                      <div className="flex items-end justify-between gap-4"><div><h2 className="text-lg font-semibold">{t('wiki.projectContext')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('wiki.projectContextDescription')}</p></div></div>
                      {contextDocument ? (
                        <button onClick={() => selectDocument(contextDocument)} className="group mt-4 flex w-full items-center gap-4 rounded-2xl border border-brand/20 bg-brand/5 p-5 text-left transition hover:border-brand/40 hover:bg-brand/8">
                          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-white"><Sparkles /></span>
                          <span className="min-w-0 flex-1"><span className="block font-semibold">{t('wiki.projectContext')}</span><span className="mt-1 block text-sm text-muted-foreground">{t('wiki.projectContextCardDescription')}</span></span>
                          <ChevronRight className="h-4 w-4 text-brand transition group-hover:translate-x-1" />
                        </button>
                      ) : <EmptyState className="mt-4 rounded-2xl border border-dashed border-border" icon={<Sparkles />} title={t('wiki.noProjectContext')} description={t('wiki.noProjectContextDescription')} />}
                    </section>

                    <section className="mt-10">
                      <div><h2 className="text-lg font-semibold">{t('wiki.projectKnowledge')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('wiki.projectKnowledgeDescription')}</p></div>
                      {knowledgeDocuments.length ? (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {knowledgeDocuments.map(document => (
                            <button key={document.key} onClick={() => selectDocument(document)} className="group flex min-h-36 flex-col rounded-2xl border border-border bg-background p-5 text-left transition hover:border-brand/35 hover:shadow-md">
                              <div className="flex items-start justify-between"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground"><FileText /></span><ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1" /></div>
                              <h3 className="mt-4 line-clamp-2 font-semibold">{document.title}</h3>
                              {document.updated_at && <p className="mt-auto pt-3 text-xs text-muted-foreground">{formatDate(document.updated_at, { dateStyle: 'medium' })}</p>}
                            </button>
                          ))}
                        </div>
                      ) : <EmptyState className="mt-4 rounded-2xl border border-dashed border-border" icon={<BookOpen />} title={query ? t('wiki.noSearchResults') : t('wiki.noDocuments')} description={query ? t('wiki.noSearchResultsDescription') : t('wiki.noDocumentsDescription')} />}
                    </section>
                  </>
                )}
              </div>
            )}

            {content === 'document' && (
              <div className="min-h-full">
                <header className="sticky top-0 z-10 flex flex-wrap items-start justify-between gap-4 border-b border-border bg-card/90 px-5 py-4 backdrop-blur-xl sm:px-8">
                  <div className="flex min-w-0 items-start gap-3">
                    <Button size="icon" variant="ghost" onClick={() => setSelected(null)} aria-label={t('common.back')}><ArrowLeft /></Button>
                    <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">{clientId} / {projectId}</p><h1 className="mt-1 truncate text-xl font-semibold tracking-[-0.025em] sm:text-2xl">{selected?.document === 'context' ? t('wiki.projectContext') : selected?.title}</h1>{selected?.updated_at && <p className="mt-1 text-xs text-muted-foreground">{t('common.updated')} {formatDate(selected.updated_at, { dateStyle: 'medium', timeStyle: 'short' })}</p>}</div>
                  </div>
                  {selected?.document === 'context' ? <Button onClick={saveContext} disabled={savingContext}>{savingContext ? <Loader2 className="animate-spin" /> : <Save />}{t('wiki.saveContext')}</Button> : <Button variant="outline" onClick={() => selected && navigator.clipboard.writeText(selected.content_markdown)}><Clipboard />{t('common.copy')}</Button>}
                </header>
                {documentLoading ? <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand" /></div> : selected && (
                  <article className="mx-auto max-w-4xl px-5 py-8 sm:px-10 sm:py-12">
                    {selected.document === 'context' && <div className="mb-8 rounded-2xl border border-brand/20 bg-brand/5 p-4 text-sm leading-6 text-muted-foreground"><strong className="text-foreground">{t('wiki.editableContext')}</strong> {t('wiki.editableContextDescription')}</div>}
                    <BlockNoteSummaryView key={selected.key} ref={selected.document === 'context' ? contextEditorRef : undefined} summaryData={{ markdown: selected.document === 'context' ? contextDraft || `# ${t('wiki.projectContext')}\n\n${t('wiki.contextPlaceholder')}` : selected.content_markdown }} editable={selected.document === 'context'} />
                  </article>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
