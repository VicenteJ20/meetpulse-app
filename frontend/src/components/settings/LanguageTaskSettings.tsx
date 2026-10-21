'use client';

import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Check, Cloud, Minus, RefreshCw, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxItem } from '@/components/ui/combobox';
import { SettingsSection } from '@/components/ui/settings';
import { useConfig } from '@/contexts/ConfigContext';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { isChatLanguageModel, useGatewayCatalog, type GatewayModel } from '@/hooks/useCloudModels';
import type { TranslationKey } from '@/i18n/catalogs';
import { complianceMark, formatTokenPrice, recommendedFirst } from '@/lib/model-review';
import { cn } from '@/lib/utils';

type Task = 'analysis' | 'chat';
type Source = 'builtin-ai' | 'vercel-gateway';

type LocalModel = {
  name: string;
  displayName: string;
  available: boolean;
  legacy: boolean;
};

// Vista de transcripción para análisis o para chat y coach: origen local o nube, y un select con búsqueda.
export function LanguageTaskSettings({ task }: { task: Task }) {
  const { t } = useTranslation();
  const { modelConfig, setModelConfig, chatModelConfig, saveChatModel, providerApiKeys } = useConfig();
  const gateway = useGatewayCatalog();
  const saved = task === 'chat' ? chatModelConfig : modelConfig;
  const savedSource: Source = saved.provider === 'vercel-gateway' ? 'vercel-gateway' : 'builtin-ai';
  const [source, setSource] = useState<Source>(savedSource);
  const [localModels, setLocalModels] = useState<LocalModel[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const hasKey = !!providerApiKeys['vercel-gateway']?.trim();

  useEffect(() => {
    setSource(savedSource);
  }, [savedSource]);

  const loadLocal = () => invoke<{ name: string; display_name: string; status: { type: string }; lifecycle?: string }[]>('builtin_ai_list_models')
    .then((items) => {
      setLocalModels(items.map((item) => ({
        name: item.name,
        displayName: item.display_name || item.name,
        available: item.status?.type === 'available',
        legacy: !!item.lifecycle && item.lifecycle !== 'current',
      })));
    })
    .catch((error) => {
      console.error('Could not list built-in models:', error);
      setLocalModels([]);
    });

  useEffect(() => {
    void loadLocal();
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([gateway.reload(true), loadLocal()]);
    } finally {
      setRefreshing(false);
    }
  };

  const save = async (provider: Source, model: string) => {
    if (!model.trim()) return;
    if (task === 'chat') {
      try {
        await saveChatModel(provider, model);
        toast.success(t('sx.saved'));
      } catch (error) {
        console.error('Could not save the chat model:', error);
        toast.error(t('sx.saveFailed'));
      }
      return;
    }

    const previous = modelConfig;
    const next = { ...previous, provider, model, apiKey: null as string | null };
    setModelConfig(next);
    try {
      await invoke('api_save_model_config', {
        provider: next.provider,
        model: next.model,
        whisperModel: next.whisperModel,
        apiKey: null,
        ollamaEndpoint: next.ollamaEndpoint ?? null,
      });
      const { emit } = await import('@tauri-apps/api/event');
      await emit('model-config-updated', next);
      toast.success(t('sx.saved'));
    } catch (error) {
      console.error('Could not save the analysis model:', error);
      setModelConfig(previous);
      toast.error(t('sx.saveFailed'));
    }
  };

  const items = useMemo(() => {
    const current = saved.model ? `${savedSource}:${saved.model}` : '';
    const local: ComboboxItem[] = localModels.map((model) => {
      const value = `builtin-ai:${model.name}`;
      const notes = [
        model.legacy ? t('builtin.legacy') : '',
        model.available ? '' : t('home.notDownloaded'),
      ].filter(Boolean);
      return {
        value,
        label: model.displayName,
        description: notes.length ? `${model.name} · ${notes.join(' · ')}` : model.name,
        group: t('home.groupLocal'),
        disabled: !model.available && value !== current,
      };
    });
    if (savedSource === 'builtin-ai' && saved.model && !local.some((item) => item.value === current)) {
      local.unshift({
        value: current,
        label: saved.model,
        description: t('picker.saved'),
        group: t('home.groupLocal'),
      });
    }

    const language = gateway.models.filter((model) => (
      task === 'chat' ? isChatLanguageModel(model) : model.modelType === 'language'
    ));
    const ranked = recommendedFirst(language, task);
    const cloud: ComboboxItem[] = ranked.map((model) => cloudItem(model, hasKey, current, t));
    if (task !== 'chat' && savedSource === 'vercel-gateway' && saved.model && !cloud.some((item) => item.value === current)) {
      cloud.unshift(cloudItem({
        provider: 'vercel-gateway',
        id: saved.model,
        name: saved.model,
        label: saved.model,
        modelType: 'language',
        tags: [],
        inputModalities: [],
        outputModalities: [],
        zdr: null,
        noTraining: null,
        priceInput: null,
        priceOutput: null,
        transcriptionPerSecond: null,
        inputTokens: null,
      }, hasKey, current, t));
    }

    return source === 'vercel-gateway' ? [...cloud, ...local] : [...local, ...cloud];
  }, [gateway.models, hasKey, localModels, saved.model, savedSource, source, t, task]);

  const engines: { value: Source; label: string; desc: string; cloud: boolean }[] = [
    { value: 'builtin-ai', label: t('pv.builtin'), desc: t('lm.builtinDesc'), cloud: false },
    { value: 'vercel-gateway', label: t('pv.gateway'), desc: t('lm.gatewayDesc'), cloud: true },
  ];

  return (
    <div>
      <SettingsSection
        title={task === 'chat' ? t('st.fnChat') : t('st.fnAnalysis')}
        description={task === 'chat' ? t('st.chatNote') : t('sx.analysisModelDesc')}
      >
        <div role="radiogroup" aria-label={t('lm.source')} className="grid gap-2.5 sm:grid-cols-2">
          {engines.map((engine) => {
            const active = source === engine.value;
            return (
              <button
                key={engine.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSource(engine.value)}
                className={cn(
                  'flex flex-col gap-1.5 rounded-xl border p-3.5 text-left transition-colors',
                  active ? 'border-brand bg-accent/60 ring-1 ring-brand' : 'border-border bg-card hover:border-muted-foreground/40',
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">{engine.label}</span>
                  <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold', engine.cloud ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success')}>
                    {engine.cloud ? <Cloud className="size-3" /> : <ShieldCheck className="size-3" />}
                    {engine.cloud ? t('sx.badgeCloud') : t('sx.badgeLocal')}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">{engine.desc}</span>
              </button>
            );
          })}
        </div>
        {source === 'vercel-gateway' && (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
            <Cloud className="mt-0.5 size-3.5 shrink-0" />
            {t('lm.gatewayWarn')}
          </p>
        )}
        {source !== savedSource && (
          <p className="mt-3 text-xs text-muted-foreground">{t('lm.pending')}</p>
        )}
      </SettingsSection>

      <SettingsSection title={t('sx.model')} description={t('lm.sourceHint')}>
        <div className="flex gap-2">
          <Combobox
            className="min-w-0 flex-1"
            contentClassName="w-[min(42rem,calc(100vw-2rem))]"
            aria-label={t('picker.available')}
            items={items}
            value={saved.model ? `${savedSource}:${saved.model}` : ''}
            onValueChange={(value) => {
              const parsed = parseSelection(value);
              if (!parsed) return;
              setSource(parsed.provider);
              if (parsed.provider === savedSource && parsed.model === saved.model) return;
              void save(parsed.provider, parsed.model);
            }}
            placeholder={t('picker.select')}
            searchPlaceholder={t('picker.search')}
            emptyText={t('picker.none')}
            footer={`${items.length} ${t('picker.models')}`}
          />
          <Button size="icon" variant="outline" aria-label={t('picker.refresh')} title={t('picker.refresh')} disabled={refreshing || gateway.loading} onClick={() => void refresh()}>
            <RefreshCw className={refreshing || gateway.loading ? 'animate-spin' : undefined} />
          </Button>
        </div>
        {gateway.error && <p className="mt-2 text-xs text-muted-foreground">{t('pv.loadFailed')}</p>}
      </SettingsSection>
    </div>
  );
}

function parseSelection(value: string): { provider: Source; model: string } | null {
  const index = value.indexOf(':');
  if (index <= 0) return null;
  const provider = value.slice(0, index);
  const model = value.slice(index + 1);
  if ((provider !== 'builtin-ai' && provider !== 'vercel-gateway') || !model) return null;
  return { provider, model };
}

function tokenPrice(model: GatewayModel): string {
  const input = formatTokenPrice(model.priceInput);
  const output = formatTokenPrice(model.priceOutput);
  if ((!input || input === '$0') && (!output || output === '$0')) return '';
  return `${input || '—'} / ${output || '—'}`;
}

function Compliance({ flag, label }: { flag: string | null; label: string }) {
  const state = complianceMark(flag);
  const Icon = state === 'check' ? Check : state === 'partial' ? Minus : null;
  return (
    <span className={cn('inline-flex items-center gap-0.5 whitespace-nowrap', state === 'check' ? 'text-success' : state === 'partial' ? 'text-warning' : 'text-muted-foreground')}>
      {Icon ? <Icon className="size-3" aria-hidden /> : <span aria-hidden>—</span>}
      {label}
    </span>
  );
}

function cloudItem(
  model: GatewayModel,
  hasKey: boolean,
  current: string,
  t: (key: TranslationKey) => string,
): ComboboxItem {
  const value = `vercel-gateway:${model.id}`;
  const price = tokenPrice(model);
  return {
    value,
    label: model.name || model.id,
    description: hasKey || value === current ? model.id : `${model.id} · ${t('home.needsKey')}`,
    group: t('home.groupCloud'),
    disabled: !hasKey && value !== current,
    trailing: (
      <span className="flex shrink-0 items-center gap-2 text-[0.68rem] font-medium">
        <Compliance flag={model.zdr} label={t('pv.zdr')} />
        <Compliance flag={model.noTraining} label={t('pv.noTraining')} />
        {price ? <span className="font-mono font-normal text-muted-foreground" title={t('pv.perMillion')}>{price}</span> : null}
      </span>
    ),
  };
}
