'use client';

import { Button } from '@/components/ui/button';
import { SettingsSection } from '@/components/ui/settings';
import AnalyticsConsentSwitch from '@/components/AnalyticsConsentSwitch';
import { BetaSettings } from '@/components/BetaSettings';
import { useSemanticIndex } from '@/hooks/useSemanticIndex';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { Download, Pause, RefreshCw, Square } from 'lucide-react';

export function PrivacySettings() {
  const { t } = useTranslation();
  const { status, error, download, index } = useSemanticIndex();
  const pct = status && status.totalBytes > 0 ? Math.round((status.downloaded / status.totalBytes) * 100) : 0;

  const label = !status
    ? t('common.loading')
    : status.ready
      ? t('st.searchStatusReady').replace('{indexed}', String(status.indexed)).replace('{total}', String(status.total))
      : status.downloading
        ? t('st.searchDownloading').replace('{pct}', String(pct))
        : t('st.searchStatusMissing');

  return (
    <div>
      <SettingsSection title={t('st.searchTitle')} description={t('st.searchDesc')}>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <span className={`size-2 rounded-full ${status?.ready ? 'bg-success' : 'bg-muted-foreground/50'}`} />
            {label}
          </p>
          {status && !status.ready && status.totalBytes > 0 && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${pct}%` }} />
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {!status?.ready && !status?.downloading && (
              <Button size="sm" onClick={() => download('start')}>
                <Download />
                {status && status.downloaded > 0 ? t('st.resume') : t('st.download')}
              </Button>
            )}
            {status?.downloading && (
              <>
                <Button size="sm" variant="outline" onClick={() => download('pause')}><Pause />{t('assistant.pause')}</Button>
                <Button size="sm" variant="ghost" onClick={() => download('cancel')}>{t('assistant.cancel')}</Button>
              </>
            )}
            {status?.ready && (
              <>
                <Button size="sm" variant="outline" disabled={status.indexing} onClick={() => index(false)}>
                  <RefreshCw className={status.indexing ? 'animate-spin' : ''} />
                  {t('st.updateIndex')}
                </Button>
                {status.indexing && (
                  <Button size="sm" variant="ghost" onClick={() => index(true)}><Square />{t('st.stopIndex')}</Button>
                )}
              </>
            )}
          </div>
          {error && <p role="alert" className="mt-3 break-words text-xs text-destructive">{error}</p>}
        </div>
      </SettingsSection>

      <section className="border-t border-border py-6">
        <AnalyticsConsentSwitch />
      </section>

      <SettingsSection title={t('st.betaSection')}>
        <BetaSettings />
      </SettingsSection>
    </div>
  );
}
