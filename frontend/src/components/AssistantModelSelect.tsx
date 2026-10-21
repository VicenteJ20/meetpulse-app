'use client';

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Cloud, ShieldCheck } from 'lucide-react';
import { ModelComplianceMarks } from '@/components/ModelComplianceMarks';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCloudModels } from '@/hooks/useCloudModels';
import { useConfig } from '@/contexts/ConfigContext';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { cn } from '@/lib/utils';

type Entry = { provider: string; id: string; label: string; zdr?: string | null; noTraining?: string | null };
const isCloud = (provider: string) => provider === 'vercel-gateway';

// Selector compacto del chat. Solo modelos de lenguaje o texto, con ZDR y No Training.
export function AssistantModelSelect({
  provider,
  model,
  onChange,
  className,
}: {
  provider: string;
  model: string;
  onChange: (provider: string, model: string) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const { providerApiKeys } = useConfig();
  const [local, setLocal] = useState<Entry[]>([]);
  const cloudModels = useCloudModels('chat');
  const hasGatewayKey = !!providerApiKeys['vercel-gateway'];

  useEffect(() => {
    let active = true;
    invoke<{ name: string; display_name: string; status: { type: string } }[]>('builtin_ai_list_models')
      .then((items) => items.filter((m) => m.status.type === 'available').map((m) => ({ provider: 'builtin-ai', id: m.name, label: m.display_name || m.name })))
      .catch(() => [] as Entry[])
      .then((items) => { if (active) setLocal(items); });
    return () => { active = false; };
  }, []);

  const hasKey = (p: string) => !isCloud(p) || hasGatewayKey;
  const current = `${provider}:${model}`;
  const cloud = [...cloudModels];
  const localList = [...local];
  if (model && isCloud(provider) && cloud.length === 0) cloud.unshift({ provider, id: model, label: model });
  if (model && !isCloud(provider) && !localList.some((m) => m.provider === provider && m.id === model)) localList.unshift({ provider, id: model, label: model });

  return (
    <Select
      value={current}
      onValueChange={(value) => {
        const separator = value.indexOf(':');
        onChange(value.slice(0, separator), value.slice(separator + 1));
      }}
    >
      <SelectTrigger
        aria-label={t('assistant.modelLabel')}
        title={isCloud(provider) ? t('home.groupCloud') : t('home.groupLocal')}
        className={cn('h-8 w-auto max-w-[14rem] gap-1.5 rounded-full px-2.5 text-xs', className)}
      >
        {isCloud(provider) ? <Cloud className="size-3.5 shrink-0 text-warning" /> : <ShieldCheck className="size-3.5 shrink-0 text-success" />}
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" className="min-w-[22rem]">
        {localList.length > 0 && (
          <SelectGroup>
            <SelectLabel className="text-xs text-muted-foreground">{t('home.groupLocal')}</SelectLabel>
            {localList.map((m) => <SelectItem key={`${m.provider}:${m.id}`} value={`${m.provider}:${m.id}`}>{m.label}</SelectItem>)}
          </SelectGroup>
        )}
        <SelectGroup>
          <SelectLabel className="text-xs text-muted-foreground">{t('home.groupCloud')}</SelectLabel>
          {cloud.map((m) => {
            const value = `${m.provider}:${m.id}`;
            return (
              <SelectItem
                key={value}
                value={value}
                disabled={!hasKey(m.provider) && value !== current}
                trailing={<ModelComplianceMarks zdr={m.zdr} noTraining={m.noTraining} zdrLabel={t('pv.zdrTitle')} noTrainingLabel={t('pv.noTrainingTitle')} />}
              >
                {m.label}{!hasKey(m.provider) ? ` · ${t('home.needsKey')}` : ''}
              </SelectItem>
            );
          })}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
