'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { getWikiConfig, type WikiConfig } from '@/services/wiki-config';
import { WikiApi, type WikiSummary } from '@/services/wiki-api';

export function HomeWikiStats() {
  const router = useRouter();
  const { meetings } = useSidebar();
  const [config, setConfig] = useState<WikiConfig>({ baseUrl: 'http://localhost:8000', tenantId: '' });
  const [summary, setSummary] = useState<WikiSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const local = useMemo(() => {
    const clients = new Set(meetings.map(m => m.client?.trim()).filter(Boolean));
    const projects = new Set(meetings.map(m => `${m.client?.trim() || ''}/${m.project?.trim() || ''}`).filter(value => !value.endsWith('/')));
    return { meetings: meetings.length, clients: clients.size, projects: projects.size };
  }, [meetings]);
  const load = useCallback(async (next = getWikiConfig()) => {
    setConfig(next); if (!next.tenantId) { setSummary(null); return; }
    setLoading(true); try { setSummary(await new WikiApi(next).summary()); } catch { setSummary(null); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); const onChange = (event: Event) => load((event as CustomEvent<WikiConfig>).detail); window.addEventListener('wiki-config-changed', onChange); return () => window.removeEventListener('wiki-config-changed', onChange); }, [load]);
  const card = (label: string, value: number | string) => <div className="rounded-lg border border-slate-200 bg-white px-3 py-2"><p className="text-xs text-slate-500">{label}</p><p className="text-lg font-semibold text-slate-800">{value}</p></div>;
  return <section className="mx-auto mt-4 w-2/3 max-w-[750px] rounded-xl border border-slate-200 bg-slate-50 p-4">
    <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-blue-600" /><h2 className="font-semibold text-slate-800">MeetPulse overview</h2></div><div className="flex gap-2"><button onClick={() => load()} disabled={loading} className="rounded-md p-1.5 hover:bg-slate-200" title="Refresh Wiki stats"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button><button onClick={() => router.push('/wiki')} className="rounded-md bg-white px-2.5 py-1.5 text-sm font-medium shadow-sm ring-1 ring-slate-200 hover:bg-slate-100">Open Wiki</button></div></div>
    <div className="grid grid-cols-3 gap-2">{card('Local meetings', local.meetings)}{card('Local clients', local.clients)}{card('Local projects', local.projects)}</div>
    {config.tenantId ? <div className="mt-2 grid grid-cols-3 gap-2">{card('Wiki sources', summary?.source_count ?? '—')}{card('Wiki pages', summary?.wiki_page_count ?? '—')}{card('Last Wiki activity', summary?.last_activity_at ? new Date(summary.last_activity_at).toLocaleDateString() : '—')}</div> : <p className="mt-3 text-sm text-slate-600">Configure a Wiki tenant in Settings to display remote statistics.</p>}
  </section>;
}
