'use client';

import { Switch } from './ui/switch';
import { useConfig } from '@/contexts/ConfigContext';
import { SettingsSection } from '@/components/ui/settings';
import { SummaryLanguageSettings } from '@/components/SummaryLanguageSettings';
import { useTranslation } from '@/contexts/UiPreferencesContext';

export function SummaryModelSettings() {
  const { t } = useTranslation();
  const { isAutoSummary, toggleIsAutoSummary } = useConfig();

  return (
    <div>
      <SettingsSection title={t('sx.autoSummary')} description={t('sx.autoSummaryDesc')} action={<Switch checked={isAutoSummary} onCheckedChange={toggleIsAutoSummary} aria-label={t('sx.autoSummary')} />} />
      <SummaryLanguageSettings />
    </div>
  );
}
