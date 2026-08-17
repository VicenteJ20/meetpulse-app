import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { listWikiTenants, type WikiTenant } from '@/services/wiki-api';
import {
  getWikiConfig,
  resolvePreferredTenantId,
  saveWikiConfig,
  type WikiConfig,
} from '@/services/wiki-config';

export type PreferredWikiStatus = 'loading' | 'ready' | 'empty' | 'error';

export function usePreferredWikiTenant() {
  const { t } = useTranslation();
  const [tenants, setTenants] = useState<WikiTenant[]>([]);
  const [config, setConfig] = useState<WikiConfig>(() => getWikiConfig());
  const [status, setStatus] = useState<PreferredWikiStatus>('loading');
  const [error, setError] = useState('');

  const persistTenant = useCallback((tenantId: string) => {
    const next = saveWikiConfig({ ...getWikiConfig(), tenantId });
    setConfig(next);
    return next;
  }, []);

  const loadTenants = useCallback(async (preferredTenantId?: string) => {
    setError('');
    setStatus(current => (current === 'ready' ? current : 'loading'));
    try {
      const nextTenants = await listWikiTenants();
      setTenants(nextTenants);
      if (!nextTenants.length) {
        persistTenant('');
        setStatus('empty');
        return;
      }
      persistTenant(resolvePreferredTenantId(nextTenants, preferredTenantId));
      setStatus('ready');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('wiki.errorGeneric'));
      setStatus('error');
    }
  }, [persistTenant, t]);

  const selectTenant = useCallback((tenantId: string) => {
    if (tenantId === config.tenantId) return;
    persistTenant(tenantId);
    const selected = tenants.find(tenant => tenant.tenant_id === tenantId);
    const name = selected?.display_name || selected?.tenant_id || tenantId;
    if (name) toast.success(t('wiki.preferredChanged').replace('{name}', name));
  }, [config.tenantId, persistTenant, t, tenants]);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  useEffect(() => {
    const onChange = (event: Event) => {
      const next = (event as CustomEvent<WikiConfig>).detail;
      setConfig(current => (
        current.tenantId === next.tenantId && current.baseUrl === next.baseUrl ? current : next
      ));
    };
    window.addEventListener('wiki-config-changed', onChange);
    return () => window.removeEventListener('wiki-config-changed', onChange);
  }, []);

  const activeTenant = useMemo(
    () => tenants.find(tenant => tenant.tenant_id === config.tenantId),
    [config.tenantId, tenants],
  );

  return {
    tenants,
    config,
    tenantId: config.tenantId,
    status,
    error,
    activeTenant,
    loadTenants,
    selectTenant,
  };
}
