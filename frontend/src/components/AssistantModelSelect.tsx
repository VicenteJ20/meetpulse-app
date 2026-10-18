'use client';

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Cloud, ShieldCheck } from 'lucide-react';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import catalog from '@/config/models.json';
import { useConfig } from '@/contexts/ConfigContext';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { cn } from '@/lib/utils';

type Entry = { provider: string; id: string; label: string };
const CLOUD = catalog.analysis as Entry[];
const isCloud = (provider: string) => provider !== 'ollama' && provider !== 'builtin-ai';

// Selector compacto del modelo con el que conversa el chat. Usa el mismo catálogo que el análisis.
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
  const { providerApiKeys, modelConfig } = useConfig();
  const [local, setLocal] = useState<Entry[]>([]);

  useEffect(() => {
    let active = true;
    invoke<{ models: { id: string; name: string }[] }>('desktop_list_models', {
      provider: 'ollama',
      purpose: 'analysis',
      apiKey: null,
      endpoint: modelConfig.ollamaEndpoint ?? null,
      refresh: false,
    })
      .then((list) => { if (active) setLocal((list.models ?? []).map((m) => ({ provider: 'ollama', id: m.id, label: m.name || m.id }))); })
      .catch(() => { if (active) setLocal([]); });
    return () => { active = false; };
  }, [modelConfig.ollamaEndpoint]);

  const hasKey = (p: string) => !isCloud(p) || !!(providerApiKeys as Record<string, string | null>)[p];
  const current = `${provider}:${model}`;
  const cloud = [...CLOUD];
  const localList = [...local];
  if (isCloud(provider) && !cloud.some((m) => m.provider === provider && m.id === model)) cloud.unshift({ provider, id: model, label: model });
  if (!isCloud(provider) && !localList.some((m) => m.provider === provider && m.id === model)) localList.unshift({ provider, id: model, label: model });

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
      <SelectContent align="start">
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
              <SelectItem key={value} value={value} disabled={!hasKey(m.provider) && value !== current}>
                {m.label}{!hasKey(m.provider) ? ` · ${t('home.needsKey')}` : ''}
              </SelectItem>
            );
          })}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
