'use client';

import { Cloud, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SettingsSection } from '@/components/ui/settings';
import { SummaryModelSettings } from '@/components/SummaryModelSettings';
import { ProvidersSettings } from '@/components/settings/ProvidersSettings';
import { useDataFlow } from '@/hooks/useDataFlow';
import { useConfig } from '@/contexts/ConfigContext';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { cn } from '@/lib/utils';

function FlowBadge({ to, what }: { to: string | null; what: string }) {
  const { t } = useTranslation();
  const Icon = to ? Cloud : ShieldCheck;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', to ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success')}>
      <Icon className="size-3.5" />
      {to ? `${what} → ${to}` : t('st.staysLocal')}
    </span>
  );
}

// Resumen de qué modelo atiende cada función y a dónde viajan los datos, más la configuración del análisis.
export function ModelsSettings({ onGoTo }: { onGoTo: (tab: string) => void }) {
  const { t } = useTranslation();
  const flow = useDataFlow();
  const { transcriptModelConfig, modelConfig, chatModelConfig } = useConfig();

  const rows = [
    {
      label: t('st.fnTranscription'),
      value: `${transcriptModelConfig?.provider ?? ''} · ${transcriptModelConfig?.model ?? ''}`,
      badge: <FlowBadge to={flow.audioTo} what={t('flow.audio')} />,
      action: () => onGoTo('transcription'),
    },
    {
      label: t('st.fnAnalysis'),
      value: `${modelConfig?.provider ?? ''} · ${modelConfig?.model ?? ''}`,
      badge: <FlowBadge to={flow.textTo} what={t('flow.text')} />,
      action: () => onGoTo('analysis'),
    },
    {
      label: t('st.fnChat'),
      value: `${chatModelConfig?.provider ?? ''} · ${chatModelConfig?.model ?? ''}`,
      badge: <FlowBadge to={flow.chatTo} what={t('flow.chat')} />,
      action: () => onGoTo('coach'),
    },
  ];

  return (
    <div>
      <SettingsSection title={t('st.modelsPerFunction')} description={t('st.modelsPerFunctionDesc')}>
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {rows.map((row) => (
            <li key={row.label} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{row.label}</div>
                <div className="truncate font-mono text-xs text-muted-foreground">{row.value}</div>
              </div>
              {row.badge}
              {row.action && <Button size="sm" variant="outline" onClick={row.action}>{t('st.change')}</Button>}
            </li>
          ))}
        </ul>
      </SettingsSection>
      <SummaryModelSettings />
      <ProvidersSettings />
    </div>
  );
}
