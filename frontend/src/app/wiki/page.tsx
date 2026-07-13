'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen, Building2, ChevronRight, Clipboard, FileText, FolderKanban, Loader2, RefreshCw, Search, Settings, Sparkles, FileCheck2, Users, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getWikiConfig, type WikiConfig } from '@/services/wiki-config';
import { WikiApi, WikiApiError, type WikiActivity, type WikiClient, type WikiDocument, type WikiDocumentContent, type WikiProject, type WikiSummary } from '@/services/wiki-api';

const formatDate = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : 'No updates yet';

export default function WikiPage() {
  const router = useRouter();
  const [config, setConfig] = useState<WikiConfig>({ baseUrl: 'http://localhost:8000', tenantId: '' });
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
  const api = useCallback(() => new WikiApi(config), [config]);

  const refresh = useCallback(async () => {
    const next = getWikiConfig();
    setConfig(next); setError(null);
    if (!next.tenantId) return;
    setLoading(true);
    try {
      const client = new WikiApi(next);
      const [nextSummary, nextClients, nextActivity] = await Promise.all([client.summary(), client.clients(100), client.activity(12)]);
      setSummary(nextSummary); setClients(nextClients.items); setActivity(nextActivity.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load Wiki.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    refresh();
    const listener = () => refresh();
    window.addEventListener('wiki-config-changed', listener);
    return () => window.removeEventListener('wiki-config-changed', listener);
  }, [refresh]);

  useEffect(() => {
    if (!config.tenantId) return;
    const loadProjects = async () => {
      setProjects([]); setProjectId(''); setDocuments([]); setSelected(null);
      if (!clientId) return;
      try { setProjects((await api().projects(clientId, 100)).items); }
      catch (err) { setError(err instanceof Error ? err.message : 'Unable to load projects.'); }
    };
    loadProjects();
  }, [api, clientId, config.tenantId]);

  useEffect(() => {
    if (!config.tenantId) return;
    const loadDocuments = async () => {
      setDocuments([]); setSelected(null); setDocumentLoading(true);
      if (!projectId) { setDocumentLoading(false); return; }
      try {
        const client = api();
        const result = await client.documents(clientId || undefined, projectId || undefined);
        const userFiles = result.items.filter(item => item.document !== 'index');
        setDocuments(userFiles);
        const initial = userFiles[0];
        if (initial) setSelected(await client.document(initial.document, clientId || undefined, projectId || undefined));
      } catch (err) {
        if (!(err instanceof WikiApiError && err.status === 404)) setError(err instanceof Error ? err.message : 'Unable to load documents.');
      } finally { setDocumentLoading(false); }
    };
    loadDocuments();
  }, [api, clientId, config.tenantId, projectId]);

  const selectDocument = async (document: WikiDocument) => {
    setDocumentLoading(true); setError(null);
    try { setSelected(await api().document(document.document, clientId || undefined, projectId || undefined)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to load document.'); }
    finally { setDocumentLoading(false); }
  };
  const visibleDocuments = useMemo(() => documents.filter(item => item.title.toLowerCase().includes(query.toLowerCase())), [documents, query]);
  useEffect(() => { if (selected?.document === 'context') setContextDraft(selected.content_markdown); }, [selected]);
  const activeClient = clients.find(item => item.client_id === clientId);
  const activeProject = projects.find(item => item.project_id === projectId);
  const selectClient = (nextClientId: string) => { setProjectId(''); setClientId(nextClientId); };
  const saveContext = async () => {
    setSavingContext(true); setError(null);
    try { setSelected(await api().updateProjectContext(clientId, projectId, contextDraft)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to save project context.'); }
    finally { setSavingContext(false); }
  };

  if (!config.tenantId) return <main className="min-h-screen bg-slate-50 p-8"><div className="mx-auto max-w-xl rounded-xl border bg-white p-8 text-center"><Settings className="mx-auto h-8 w-8 text-slate-500" /><h1 className="mt-3 text-2xl font-bold">Configure Wiki first</h1><p className="mt-2 text-slate-600">Set a Wiki API URL and tenant ID before exploring knowledge documents.</p><button onClick={() => router.push('/settings')} className="mt-5 rounded-md bg-slate-900 px-4 py-2 text-white">Open Settings</button></div></main>;

  const kpi = (label: string, value: number | string, Icon: typeof Users, hint: string) => <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm font-medium text-slate-600">{label}</p><Icon className="h-4 w-4 text-blue-600" /></div><p className="mt-3 text-2xl font-bold text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-400">{hint}</p></div>;
  const overview = !clientId ? <div className="mx-auto max-w-5xl space-y-6 p-7"><div><p className="text-sm font-medium text-blue-600">Tenant overview</p><h2 className="mt-1 text-2xl font-bold text-slate-900">Knowledge at a glance</h2><p className="mt-2 text-sm text-slate-500">Explore client workspaces and their project knowledge. Agent configuration and metadata stay out of this view.</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{kpi('Clients', summary?.client_count ?? 0, Users, 'workspaces with knowledge')}{kpi('Projects', summary?.project_count ?? 0, FolderKanban, 'project knowledge areas')}{kpi('Published notes', summary?.source_count ?? 0, FileCheck2, 'meeting notes saved to Wiki')}{kpi('Knowledge pages', summary?.wiki_page_count ?? 0, BookOpen, 'generated project material')}</div><div><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-slate-900">Client workspaces</h3><span className="text-sm text-slate-400">Select a client to explore</span></div><div className="grid gap-3 md:grid-cols-2">{clients.map(client => <button key={client.client_id} onClick={() => selectClient(client.client_id)} className="group rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md"><div className="flex items-start justify-between"><div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-blue-600" /><span className="font-semibold text-slate-900">{client.client_id}</span></div><ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5" /></div><div className="mt-5 flex gap-5 text-sm"><span><strong className="text-slate-900">{client.project_count}</strong> <span className="text-slate-500">projects</span></span><span><strong className="text-slate-900">{client.source_count}</strong> <span className="text-slate-500">notes</span></span></div><p className="mt-3 text-xs text-slate-400">Last update {formatDate(client.last_activity_at)}</p></button>)}</div></div></div> : <div className="mx-auto max-w-5xl space-y-6 p-7"><div><button onClick={() => selectClient('')} className="text-sm font-medium text-blue-600 hover:underline">All client workspaces</button><p className="mt-3 text-sm font-medium text-blue-600">Client workspace</p><h2 className="mt-1 text-2xl font-bold text-slate-900">{clientId}</h2><p className="mt-2 text-sm text-slate-500">Choose a project to access its user-facing knowledge files.</p></div><div className="grid gap-3 sm:grid-cols-3">{kpi('Projects', activeClient?.project_count ?? projects.length, FolderKanban, 'active knowledge areas')}{kpi('Published notes', activeClient?.source_count ?? 0, FileCheck2, 'meeting notes saved')}{kpi('Last update', activeClient?.last_activity_at ? new Date(activeClient.last_activity_at).toLocaleDateString() : '—', BookOpen, 'latest activity')}</div><div><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-slate-900">Projects</h3><span className="text-sm text-slate-400">Open a project to see files</span></div><div className="grid gap-3 md:grid-cols-2">{projects.map(project => <button key={project.project_id} onClick={() => setProjectId(project.project_id)} className="group rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><FolderKanban className="h-5 w-5 text-blue-600" /><span className="font-semibold text-slate-900">{project.project_id}</span></div><ChevronRight className="h-4 w-4 text-slate-400" /></div><div className="mt-5 flex gap-5 text-sm"><span><strong className="text-slate-900">{project.source_count}</strong> <span className="text-slate-500">notes</span></span><span><strong className="text-slate-900">{project.wiki_page_count}</strong> <span className="text-slate-500">knowledge files</span></span></div><p className="mt-3 text-xs text-slate-400">Last update {formatDate(project.last_activity_at)}</p></button>)}</div></div></div>;
  const contextEditor = selected?.document === 'context' ? <><header className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white/95 px-7 py-5 backdrop-blur"><div><p className="mb-1 text-xs font-medium uppercase tracking-wide text-blue-600">{clientId} / {projectId}</p><h2 className="text-2xl font-bold text-slate-900">Project context</h2><p className="mt-1 text-sm text-slate-400">Add durable context that complements meeting analyses.</p></div><button onClick={saveContext} disabled={savingContext} className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{savingContext ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save context</button></header><div className="p-7"><textarea value={contextDraft} onChange={event => setContextDraft(event.target.value)} placeholder="# Project context\n\nAdd decisions, background, links, or any information that should outlive a meeting." className="min-h-[420px] w-full resize-y rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-sm leading-6 outline-none focus:border-blue-400 focus:bg-white" /></div></> : null;
  return <main className="h-screen overflow-hidden bg-slate-50 p-5"><div className="mx-auto flex h-full max-w-[1600px] flex-col gap-4">
    <header className="flex shrink-0 items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
      <div className="min-w-0"><div className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-blue-600" /><h1 className="text-lg font-bold text-slate-900">Knowledge Wiki</h1>{projectId && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{documents.length} files</span>}</div><p className="mt-0.5 truncate text-xs text-slate-500">{projectId ? `${clientId} / ${projectId}` : clientId || 'Tenant home'} · Last sync {formatDate(summary?.last_activity_at)}</p></div>
      <div className="flex shrink-0 gap-2"><button onClick={() => router.push('/settings')} className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">Settings</button><button onClick={refresh} disabled={loading} className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Refresh</button></div>
    </header>
    {error && <div className="shrink-0 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

    <section className={`grid min-h-0 flex-1 gap-4 ${projectId ? 'lg:grid-cols-[260px_280px_minmax(0,1fr)]' : 'lg:grid-cols-[260px_minmax(0,1fr)]'}`}>
      <aside className="min-h-0 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between px-2"><h2 className="text-sm font-semibold text-slate-900">Workspace</h2><span className="text-xs text-slate-400">{clients.length} clients</span></div>
        <button onClick={() => selectClient('')} className={`mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${!clientId ? 'bg-blue-50 font-medium text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}><Sparkles className="h-4 w-4" />Tenant home</button>
        <div className="mt-3 border-t pt-3"><p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Clients</p>{clients.map(client => <div key={client.client_id}><button onClick={() => selectClient(client.client_id)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${clientId === client.client_id ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}><Building2 className="h-4 w-4 text-slate-400" /><span className="min-w-0 flex-1 truncate">{client.client_id}</span><span className="text-xs text-slate-400">{client.project_count}</span><ChevronRight className={`h-3.5 w-3.5 ${clientId === client.client_id ? 'rotate-90' : ''}`} /></button>{clientId === client.client_id && <div className="ml-5 border-l border-slate-200 py-1">{projects.map(project => <button key={project.project_id} onClick={() => setProjectId(project.project_id)} className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm ${projectId === project.project_id ? 'font-medium text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}><FolderKanban className="h-3.5 w-3.5" />{project.project_id}</button>)}{projects.length === 0 && <p className="px-3 py-1 text-xs text-slate-400">Loading projects…</p>}</div>}</div>)}</div>
        <div className="mt-5 border-t px-2 pt-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Recent updates</p><div className="mt-2 space-y-3">{activity.slice(0, 4).map((entry, index) => <div key={index} className="text-xs text-slate-500"><p className="font-medium text-slate-700">{String(entry.client_id || 'Workspace')}{entry.project_id ? ` / ${String(entry.project_id)}` : ''}</p><p>{formatDate(entry.timestamp)}</p></div>)}</div></div>
      </aside>

      {projectId && <aside className="min-h-0 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm"><div className="mb-3 px-2"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-slate-900">Project files</h2><span className="text-xs text-slate-400">{documents.length}</span></div><div className="relative mt-3"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Filter files" className="w-full rounded-md border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400" /></div></div>{visibleDocuments.length ? <ul className="space-y-1">{visibleDocuments.map(document => <li key={document.key}><button onClick={() => selectDocument(document)} className={`w-full rounded-lg px-3 py-2.5 text-left ${selected?.document === document.document ? 'bg-blue-50 text-blue-800' : 'hover:bg-slate-50'}`}><div className="flex items-center gap-2"><FileText className="h-4 w-4 shrink-0" /><span className="truncate text-sm font-medium">{document.title}</span></div><p className="mt-1 pl-6 text-xs text-slate-400">{document.updated_at ? new Date(document.updated_at).toLocaleDateString() : 'No date'}</p></button></li>)}</ul> : <div className="px-3 py-8 text-center text-sm text-slate-400">No user-facing files yet.</div>}</aside>}

      <article className="min-h-0 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm">{!projectId ? overview : documentLoading ? <div className="flex h-full min-h-[400px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div> : contextEditor || selected ? <>{contextEditor || <><header className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white/95 px-7 py-5 backdrop-blur"><div><p className="mb-1 text-xs font-medium uppercase tracking-wide text-blue-600">{clientId} / {projectId}</p><h2 className="text-2xl font-bold text-slate-900">{selected?.title}</h2><p className="mt-1 text-xs text-slate-400">Updated {formatDate(selected?.updated_at)}</p></div><button onClick={() => selected && navigator.clipboard.writeText(selected.content_markdown)} className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50"><Clipboard className="h-4 w-4" />Copy</button></header><div className="prose prose-slate max-w-3xl px-7 py-6"><ReactMarkdown remarkPlugins={[remarkGfm]}>{selected?.content_markdown || ''}</ReactMarkdown></div></>}</> : <div className="flex h-full min-h-[400px] flex-col items-center justify-center text-center"><FileText className="h-8 w-8 text-slate-300" /><p className="mt-3 font-medium text-slate-600">No user-facing files yet</p><p className="mt-1 text-sm text-slate-400">Published analyses will appear here.</p></div>}</article>
    </section>
  </div></main>;
}
