'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { getWikiConfig, saveWikiConfig, type WikiConfig } from '@/services/wiki-config';
import { WikiApi } from '@/services/wiki-api';

export function WikiSettings() {
  const [config, setConfig] = useState<WikiConfig>({ baseUrl: 'http://localhost:8000', tenantId: '' });
  const [checking, setChecking] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  useEffect(() => setConfig(getWikiConfig()), []);

  const save = () => { const saved = saveWikiConfig(config); setConfig(saved); setConnected(null); toast.success('Wiki settings saved'); };
  const check = async () => {
    const saved = saveWikiConfig(config); setConfig(saved);
    if (!saved.tenantId) { toast.error('Tenant ID is required to test the Wiki connection'); return; }
    setChecking(true);
    try { await new WikiApi(saved).summary(); setConnected(true); toast.success('Wiki API connected'); }
    catch (error) { setConnected(false); toast.error(error instanceof Error ? error.message : 'Wiki API connection failed'); }
    finally { setChecking(false); }
  };
  return <div className="max-w-2xl space-y-5 py-6">
    <div><h2 className="text-xl font-semibold">Wiki</h2><p className="mt-1 text-sm text-slate-600">Connect MeetPulse to your knowledge Wiki API.</p></div>
    <label className="block text-sm font-medium">Wiki API URL<input value={config.baseUrl} onChange={e => setConfig({ ...config, baseUrl: e.target.value })} placeholder="http://localhost:8000" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
    <label className="block text-sm font-medium">Tenant ID<input value={config.tenantId} onChange={e => setConfig({ ...config, tenantId: e.target.value })} placeholder="your-tenant" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
    <div className="flex items-center gap-3"><button onClick={save} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">Save</button><button onClick={check} disabled={checking} className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-60">{checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Test connection</button>{connected === true && <span className="inline-flex items-center gap-1 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />Connected</span>}{connected === false && <span className="text-sm text-red-600">Connection failed</span>}</div>
  </div>;
}
