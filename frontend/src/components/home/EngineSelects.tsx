'use client';

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCloudModels } from '@/hooks/useCloudModels';
import { useConfig } from '@/contexts/ConfigContext';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { useTranscriptionModels } from '@/hooks/useTranscriptionModels';
import {
  normalizeTranscriptionLanguageMode,
  TRANSCRIPTION_LANGUAGE_MODES,
} from '@/constants/transcriptionLanguages';
import type { TranscriptModelProps } from '@/components/TranscriptSettings';

function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs leading-snug text-muted-foreground">{hint}</span>}
    </div>
  );
}

// Los modelos en la nube salen en vivo del proveedor, filtrados por las reglas de src/config/models.json.

const PROVIDER_LABEL: Record<string, string> = { whisper: 'Whisper', parakeet: 'Parakeet', gemini: 'Gemini' };
const PROVIDER_NAME: Record<string, string> = { ollama: 'Ollama', 'builtin-ai': 'MeetPulse' };
const isCloudProvider = (provider: string) => provider !== 'ollama' && provider !== 'builtin-ai';
const groupLabel = 'text-xs text-muted-foreground';

export function TranscriptionEngineSelect() {
  const { t } = useTranslation();
  const { transcriptModelConfig, setTranscriptModelConfig, providerApiKeys } = useConfig();
  const { availableModels, loadingModels, fetchModels } = useTranscriptionModels(transcriptModelConfig);
  const cloudModels = useCloudModels('transcription');

  useEffect(() => { void fetchModels(); }, [fetchModels]);

  const current = `${transcriptModelConfig.provider === 'localWhisper' ? 'whisper' : transcriptModelConfig.provider}:${transcriptModelConfig.model}`;
  const local = availableModels.filter((m) => m.provider !== 'gemini');
  const geminiKey = providerApiKeys.gemini ?? (transcriptModelConfig.provider === 'gemini' ? transcriptModelConfig.apiKey : null);

  const save = async (key: string) => {
    const separator = key.indexOf(':');
    const provider = key.slice(0, separator);
    const model = key.slice(separator + 1);
    const mapped = (provider === 'whisper' ? 'localWhisper' : provider) as TranscriptModelProps['provider'];
    const previous = transcriptModelConfig;
    const next: TranscriptModelProps = {
      ...previous,
      provider: mapped,
      model,
      apiKey: mapped === 'gemini' ? geminiKey : mapped === previous.provider ? previous.apiKey : null,
    };
    setTranscriptModelConfig(next);
    try {
      await invoke('api_save_transcript_config', { provider: next.provider, model: next.model, apiKey: next.apiKey ?? null });
    } catch (error) {
      setTranscriptModelConfig(previous);
      console.error('Could not save the transcription engine:', error);
      toast.error(t('home.settingSaveError'));
    }
  };

  const cloud = [...cloudModels];
  if (transcriptModelConfig.provider === 'gemini' && !cloud.some((m) => m.id === transcriptModelConfig.model)) {
    cloud.unshift({ provider: 'gemini', id: transcriptModelConfig.model, label: transcriptModelConfig.model });
  }

  return (
    <Labeled label={t('home.transcribeWith')}>
      <Select value={current} onValueChange={(value) => void save(value)} disabled={loadingModels && local.length === 0}>
        <SelectTrigger aria-label={t('home.transcribeWith')}>
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel className={groupLabel}>{t('home.groupLocal')}</SelectLabel>
            {local.map((model) => (
              <SelectItem key={`${model.provider}:${model.name}`} value={`${model.provider}:${model.name}`}>
                {PROVIDER_LABEL[model.provider]} · {model.name}
              </SelectItem>
            ))}
            {!local.some((m) => `${m.provider}:${m.name}` === current) && transcriptModelConfig.provider !== 'gemini' && transcriptModelConfig.model && (
              <SelectItem value={current}>{transcriptModelConfig.model}</SelectItem>
            )}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel className={groupLabel}>{t('home.groupCloud')}</SelectLabel>
            {cloud.map((model) => (
              <SelectItem key={`${model.provider}:${model.id}`} value={`${model.provider}:${model.id}`} disabled={!geminiKey}>
                {model.label}{!geminiKey ? ` · ${t('home.needsKey')}` : ''}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Labeled>
  );
}

export function LanguageSelect() {
  const { t } = useTranslation();
  const { selectedLanguage, setSelectedLanguage, transcriptModelConfig } = useConfig();
  const locked = transcriptModelConfig.provider === 'parakeet';
  const value = locked ? 'auto' : normalizeTranscriptionLanguageMode(selectedLanguage);

  return (
    <Labeled label={t('home.language')} hint={locked ? t('home.languageLocked') : undefined}>
      <Select value={value} onValueChange={(mode) => setSelectedLanguage(normalizeTranscriptionLanguageMode(mode))} disabled={locked}>
        <SelectTrigger aria-label={t('home.language')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TRANSCRIPTION_LANGUAGE_MODES.map((mode) => (
            <SelectItem key={mode} value={mode}>{t(`recording.language.${mode}`)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Labeled>
  );
}

type LocalModel = { provider: string; id: string; name: string; available?: boolean; legacy?: boolean };
type BuiltInInfo = { name: string; display_name: string; status: { type: string }; lifecycle?: string };

export function SummaryModelSelect() {
  const { t } = useTranslation();
  const { modelConfig, setModelConfig, providerApiKeys } = useConfig();
  const [local, setLocal] = useState<LocalModel[]>([]);
  const cloudModels = useCloudModels('analysis');

  // Locales: los de la IA integrada. Los de nube salen del catálogo editable.
  useEffect(() => {
    let active = true;
    // IA integrada: se listan todos los del catálogo; los no descargados quedan inactivos.
    const loadBuiltIn = (): Promise<LocalModel[]> =>
      invoke<BuiltInInfo[]>('builtin_ai_list_models')
        .then((items) => items
          .map((m) => ({ provider: 'builtin-ai', id: m.name, name: m.display_name || m.name, available: m.status.type === 'available', legacy: !!m.lifecycle && m.lifecycle !== 'current' }))
          .sort((x, y) => Number(x.legacy) - Number(y.legacy)))
        .catch(() => []);
    void loadBuiltIn().then((items) => { if (active) setLocal(items); });
    return () => { active = false; };
  }, []);

  const keyFor = (provider: string): string | null => {
    if (!isCloudProvider(provider)) return null;
    return (providerApiKeys as Record<string, string | null>)[provider] ?? (modelConfig.provider === provider ? modelConfig.apiKey ?? null : null);
  };

  const save = async (value: string) => {
    const separator = value.indexOf(':');
    const provider = value.slice(0, separator);
    const model = value.slice(separator + 1);
    const previous = modelConfig;
    const next = { ...previous, provider: provider as typeof previous.provider, model, apiKey: keyFor(provider) };
    setModelConfig(next);
    try {
      await invoke('api_save_model_config', {
        provider: next.provider,
        model: next.model,
        whisperModel: next.whisperModel,
        apiKey: next.apiKey ?? null,
        ollamaEndpoint: next.ollamaEndpoint ?? null,
      });
    } catch (error) {
      setModelConfig(previous);
      console.error('Could not save the summary model:', error);
      toast.error(t('home.settingSaveError'));
    }
  };

  const current = `${modelConfig.provider}:${modelConfig.model}`;
  const cloud = [...cloudModels];
  const localList = [...local];
  if (isCloudProvider(modelConfig.provider) && !cloud.some((m) => m.provider === modelConfig.provider && m.id === modelConfig.model)) {
    cloud.unshift({ provider: modelConfig.provider, id: modelConfig.model, label: modelConfig.model });
  } else if (!isCloudProvider(modelConfig.provider) && !localList.some((m) => m.provider === modelConfig.provider && m.id === modelConfig.model)) {
    localList.unshift({ provider: modelConfig.provider, id: modelConfig.model, name: modelConfig.model });
  }

  return (
    <Labeled label={t('home.summarizeWith')}>
      <Select value={current} onValueChange={(value) => void save(value)}>
        <SelectTrigger aria-label={t('home.summarizeWith')}>
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {localList.length > 0 && (
            <SelectGroup>
              <SelectLabel className={groupLabel}>{t('home.groupLocal')}</SelectLabel>
              {localList.map((m) => (
                <SelectItem
                  key={`${m.provider}:${m.id}`}
                  value={`${m.provider}:${m.id}`}
                  disabled={m.available === false && `${m.provider}:${m.id}` !== current}
                >
                  {PROVIDER_NAME[m.provider]} · {m.name}
                  {m.legacy ? ` · ${t('builtin.legacy').toLowerCase()}` : ''}
                  {m.available === false ? ` · ${t('home.notDownloaded')}` : ''}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          <SelectGroup>
            <SelectLabel className={groupLabel}>{t('home.groupCloud')}</SelectLabel>
            {cloud.map((m) => {
              const hasKey = !!keyFor(m.provider);
              const value = `${m.provider}:${m.id}`;
              return (
                <SelectItem key={value} value={value} disabled={!hasKey && value !== current}>
                  {m.label}{!hasKey ? ` · ${t('home.needsKey')}` : ''}
                </SelectItem>
              );
            })}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Labeled>
  );
}
