'use client';

import { useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Check, Minus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { BuiltInModelManager, type ModelAssignment } from '@/components/BuiltInModelManager';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SettingsSection } from '@/components/ui/settings';
import { useConfig } from '@/contexts/ConfigContext';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { isChatLanguageModel, useGatewayCatalog, type GatewayModel } from '@/hooks/useCloudModels';
import { canonicalGatewayTranscriptionModel, isGatewayTranscriptionModel } from '@/lib/gateway-transcription';
import { complianceMark, formatHourlyPrice, formatTokenPrice, reviewFor } from '@/lib/model-review';
import type { ModelConfig } from '@/services/configService';

function markState(flag: string | null): 'check' | 'partial' | 'empty' {
  const mark = complianceMark(flag);
  return mark === 'check' || mark === 'partial' ? mark : 'empty';
}

function Mark({ state, label }: { state: 'check' | 'partial' | 'empty'; label: string }) {
  if (state === 'check') return <Check className="size-4 text-success" aria-label={label} />;
  if (state === 'partial') return <Minus className="size-4 text-warning" aria-label={label} />;
  return <span className="inline-block size-4" aria-hidden="true" />;
}

function priceText(model: GatewayModel, perHour: string, perMillion: string) {
  const parts: string[] = [];
  const hourly = formatHourlyPrice(model.transcriptionPerSecond);
  if (hourly && hourly !== '$0') parts.push(`${hourly} ${perHour}`);
  const input = formatTokenPrice(model.priceInput);
  const output = formatTokenPrice(model.priceOutput);
  if ((input && input !== '$0') || (output && output !== '$0')) {
    parts.push(`${input || '—'} / ${output || '—'} ${perMillion}`);
  }
  return parts.join(' · ') || '—';
}

export function ProvidersSettings() {
  const { t } = useTranslation();
  const { modelConfig, setModelConfig, transcriptModelConfig, setTranscriptModelConfig, chatModelConfig, saveChatModel, providerApiKeys, updateProviderApiKey } = useConfig();
  const { models, error, loading, reload } = useGatewayCatalog();
  const [draftKey, setDraftKey] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('language');
  const hasKey = !!providerApiKeys['vercel-gateway']?.trim();

  const types = useMemo(() => {
    const values = new Set(['language', ...models.map((model) => model.modelType).filter(Boolean)]);
    return [...values].sort();
  }, [models]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return models.filter((model) => {
      if (type !== 'all' && model.modelType !== type) return false;
      if (!needle) return true;
      const haystack = `${model.id} ${model.name} ${model.tags.join(' ')} ${model.inputModalities.join(' ')}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [models, query, type]);

  const saveAnalysis = async (provider: ModelConfig['provider'], model: string) => {
    const next = { ...modelConfig, provider, model };
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
    } catch (err) {
      console.error('Could not save the analysis model:', err);
      toast.error(t('sx.saveFailed'));
    }
  };

  const saveChat = async (provider: ModelConfig['provider'], model: string) => {
    try {
      await saveChatModel(provider, model);
      toast.success(t('sx.saved'));
    } catch (err) {
      console.error('Could not save the chat model:', err);
      toast.error(t('sx.saveFailed'));
    }
  };

  const saveTranscription = async (model: string) => {
    const canonical = canonicalGatewayTranscriptionModel(model);
    if (!canonical) return;
    const next = { ...transcriptModelConfig, provider: 'vercel-gateway' as const, model: canonical, apiKey: null };
    setTranscriptModelConfig(next);
    try {
      await invoke('api_save_transcript_config', { provider: next.provider, model: next.model, apiKey: null });
      toast.success(t('sx.saved'));
    } catch (err) {
      console.error('Could not save the transcription model:', err);
      toast.error(t('sx.saveFailed'));
    }
  };

  const saveKey = async () => {
    const key = draftKey.trim();
    if (!key) return;
    setSavingKey(true);
    try {
      await invoke('api_save_api_key', { provider: 'vercel-gateway', apiKey: key });
      updateProviderApiKey('vercel-gateway', key);
      setDraftKey('');
      toast.success(t('pv.keySaved'));
    } catch (err) {
      console.error('Could not save the gateway API key:', err);
      toast.error(t('sx.saveFailed'));
    } finally {
      setSavingKey(false);
    }
  };

  const clearKey = async () => {
    setSavingKey(true);
    try {
      await invoke('api_delete_api_key', { provider: 'vercel-gateway' });
      updateProviderApiKey('vercel-gateway', null);
      setDraftKey('');
      toast.success(t('pv.keyMissing'));
    } catch (err) {
      console.error('Could not clear the gateway API key:', err);
      toast.error(t('sx.saveFailed'));
    } finally {
      setSavingKey(false);
    }
  };

  return (
    <div>
      <SettingsSection title={t('pv.builtin')} description={t('pv.builtinDesc')}>
        <p className="mb-3 text-xs text-muted-foreground">{t('pv.localNote')}</p>
        <BuiltInModelManager
          selectedModel={modelConfig.provider === 'builtin-ai' ? modelConfig.model : ''}
          autoSelect={false}
          onModelSelect={(model) => void saveAnalysis('builtin-ai', model)}
          assignments={[
            {
              id: 'analysis',
              label: t('pv.useAnalysis'),
              activeLabel: t('st.fnAnalysis'),
              model: modelConfig.provider === 'builtin-ai' ? modelConfig.model : '',
              onSelect: (model) => void saveAnalysis('builtin-ai', model),
            },
            {
              id: 'chat',
              label: t('pv.useChat'),
              activeLabel: t('st.fnChat'),
              model: chatModelConfig.provider === 'builtin-ai' ? chatModelConfig.model : '',
              onSelect: (model) => void saveChat('builtin-ai', model),
            },
          ] satisfies ModelAssignment[]}
        />
      </SettingsSection>

      <SettingsSection
        title={t('pv.gateway')}
        description={t('pv.gatewayDesc')}
        action={(
          <Button size="sm" variant="outline" onClick={() => void reload(true)} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
            {t('picker.refresh')}
          </Button>
        )}
      >
        <div className="mb-4 max-w-xl space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="gateway-api-key" className="text-sm font-medium">{t('pv.apiKey')}</label>
            <span className={hasKey ? 'text-xs font-medium text-success' : 'text-xs text-muted-foreground'}>
              {hasKey ? t('pv.keySaved') : t('pv.keyMissing')}
            </span>
          </div>
          <div className="flex gap-2">
            <Input
              id="gateway-api-key"
              type="password"
              autoComplete="off"
              value={draftKey}
              placeholder={hasKey ? '••••••••' : t('sx.apiKeyPlaceholder')}
              onChange={(event) => setDraftKey(event.target.value)}
            />
            <Button type="button" onClick={() => void saveKey()} disabled={savingKey || !draftKey.trim()}>{t('pv.saveKey')}</Button>
            <Button type="button" variant="outline" onClick={() => void clearKey()} disabled={savingKey || !hasKey}>{t('pv.clearKey')}</Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('pv.apiKeyHint')}</p>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('pv.search')}
            aria-label={t('pv.search')}
            className="max-w-xs"
          />
          <Select value={type} onValueChange={setType}>
            <SelectTrigger aria-label={t('pv.type')} className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('pv.typeAll')}</SelectItem>
              {types.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {error && <p className="mb-3 text-sm text-muted-foreground">{t('pv.loadFailed')}</p>}

        <div className="max-h-[32rem] overflow-auto rounded-xl border border-border">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-3 py-2 font-medium">{t('pv.model')}</th>
                <th className="px-3 py-2 font-medium">{t('pv.capabilities')}</th>
                <th className="px-3 py-2 font-medium">{t('pv.price')}</th>
                <th className="px-3 py-2 font-medium">{t('pv.zdr')}</th>
                <th className="px-3 py-2 font-medium">{t('pv.noTraining')}</th>
                <th className="px-3 py-2 font-medium">{t('pv.review')}</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {visible.map((model) => {
                const review = reviewFor(model.id);
                const recommended = (['transcription', 'analysis', 'chat'] as const).filter((task) => review[task]);
                const analysisInUse = modelConfig.provider === 'vercel-gateway' && modelConfig.model === model.id;
                const chatInUse = chatModelConfig.provider === 'vercel-gateway' && chatModelConfig.model === model.id;
                const transcriptionInUse = transcriptModelConfig.provider === 'vercel-gateway' && canonicalGatewayTranscriptionModel(transcriptModelConfig.model) === canonicalGatewayTranscriptionModel(model.id);
                const canTranscribe = isGatewayTranscriptionModel(model.id);
                const canAnalyze = model.modelType === 'language';
                const canChat = isChatLanguageModel(model);
                const capabilities = [...model.inputModalities, ...model.outputModalities, ...model.tags].filter(Boolean);
                return (
                  <tr key={model.id} className="border-b border-border align-top last:border-b-0">
                    <td className="px-3 py-2">
                      <div className="font-medium">{model.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{model.id}</div>
                      {model.inputTokens ? <div className="text-xs text-muted-foreground">{t('pv.context')}: {model.inputTokens.toLocaleString()}</div> : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{capabilities.join(' · ') || '—'}</td>
                    <td className="px-3 py-2 text-xs">{priceText(model, t('pv.perHour'), t('pv.perMillion'))}</td>
                    <td className="px-3 py-2"><Mark state={markState(model.zdr)} label={t('pv.zdr')} /></td>
                    <td className="px-3 py-2"><Mark state={markState(model.noTraining)} label={t('pv.noTraining')} /></td>
                    <td className="px-3 py-2 text-xs">
                      {review.tested ? (
                        <span>
                          {t('pv.tested')}
                          {recommended.length > 0 && <span className="text-muted-foreground"> · {t('pv.recommended')}: {recommended.join(', ')}</span>}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{t('pv.notTested')}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col items-start gap-1">
                        {canAnalyze && (
                          <Button size="sm" variant={analysisInUse ? 'secondary' : 'outline'} disabled={!hasKey && !analysisInUse} onClick={() => void saveAnalysis('vercel-gateway', model.id)}>
                            {analysisInUse ? t('st.fnAnalysis') : t('pv.useAnalysis')}{!hasKey && !analysisInUse ? ` · ${t('home.needsKey')}` : ''}
                          </Button>
                        )}
                        {canChat && (
                          <Button size="sm" variant={chatInUse ? 'secondary' : 'outline'} disabled={!hasKey && !chatInUse} onClick={() => void saveChat('vercel-gateway', model.id)}>
                            {chatInUse ? t('st.fnChat') : t('pv.useChat')}{!hasKey && !chatInUse ? ` · ${t('home.needsKey')}` : ''}
                          </Button>
                        )}
                        {canTranscribe && (
                          <Button size="sm" variant={transcriptionInUse ? 'secondary' : 'outline'} disabled={!hasKey && !transcriptionInUse} onClick={() => void saveTranscription(model.id)}>
                            {transcriptionInUse ? t('pv.inUse') : t('pv.useTranscription')}{!hasKey && !transcriptionInUse ? ` · ${t('home.needsKey')}` : ''}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SettingsSection>
    </div>
  );
}
