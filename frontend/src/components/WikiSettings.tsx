'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { WikiTenantControls } from '@/components/WikiTenantControls';
import { usePreferredWikiTenant } from '@/hooks/usePreferredWikiTenant';
import { DEFAULT_WIKI_CONFIG, getWikiConfig, saveWikiConfig, type WikiConfig } from '@/services/wiki-config';
import { WikiApi } from '@/services/wiki-api';
import { useTranslation } from '@/contexts/UiPreferencesContext';

export function WikiSettings() {
  const { t } = useTranslation();
  const preferred = usePreferredWikiTenant();
  const [config, setConfig] = useState<WikiConfig>(DEFAULT_WIKI_CONFIG);
  const [checking, setChecking] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => setConfig(getWikiConfig()), []);
  useEffect(() => {
    const onChange = (event: Event) => setConfig((event as CustomEvent<WikiConfig>).detail);
    window.addEventListener('wiki-config-changed', onChange);
    return () => window.removeEventListener('wiki-config-changed', onChange);
  }, []);

  const save = () => {
    const saved = saveWikiConfig({ ...config, tenantId: preferred.tenantId || config.tenantId });
    setConfig(saved);
    setConnected(null);
    toast.success(t('settings.wikiSaved'));
  };
  const check = async () => {
    const saved = saveWikiConfig({ ...config, tenantId: preferred.tenantId || config.tenantId });
    setConfig(saved);
    setChecking(true);
    try {
      await new WikiApi(saved).summary();
      setConnected(true);
      toast.success(t('settings.wikiConnected'));
    } catch (error) {
      setConnected(false);
      toast.error(error instanceof Error ? error.message : t('settings.wikiConnectionFailed'));
    } finally {
      setChecking(false);
    }
  };

  const workspaceName = preferred.activeTenant?.display_name || preferred.activeTenant?.tenant_id || '';

  return <div className="max-w-2xl space-y-8 py-6">
    <div>
      <h2 className="text-xl font-semibold">{t('settings.wiki')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('settings.wikiDescription')}</p>
    </div>

    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{t('wiki.preferredWorkspace')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('wiki.preferredWorkspaceDescription')}</p>
      </div>
      {preferred.status === 'loading' ? (
        <div className="h-9 w-56 animate-pulse rounded-lg bg-muted" />
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
        <WikiTenantControls
          tenants={preferred.tenants}
          currentTenantId={preferred.tenantId}
          onSelect={preferred.selectTenant}
          onChanged={preferred.loadTenants}
        />
      )}
      {workspaceName && preferred.status === 'ready' && (
        <p className="text-xs text-muted-foreground">{t('wiki.savesHere').replace('{name}', workspaceName)}</p>
      )}
    </section>

    <section className="space-y-3">
      <label className="block text-sm font-medium">
        {t('settings.wikiUrl')}
        <Input
          className="mt-1"
          value={config.baseUrl}
          onChange={event => setConfig({ ...config, baseUrl: event.target.value })}
          placeholder={DEFAULT_WIKI_CONFIG.baseUrl}
        />
      </label>
      <div className="flex items-center gap-3">
        <Button onClick={save}>{t('common.save')}</Button>
        <Button variant="outline" onClick={check} disabled={checking}>
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t('settings.wikiTest')}
        </Button>
        {connected === true && <span className="inline-flex items-center gap-1 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />{t('settings.wikiConnected')}</span>}
        {connected === false && <span className="text-sm text-destructive">{t('settings.wikiConnectionFailed')}</span>}
      </div>
    </section>
  </div>;
}
