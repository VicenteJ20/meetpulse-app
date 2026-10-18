'use client';

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

const PROVIDER_LABEL: Record<string, string> = { whisper: 'Whisper', parakeet: 'Parakeet', gemini: 'Gemini' };

export function TranscriptionEngineSelect() {
  const { t } = useTranslation();
  const { transcriptModelConfig, setTranscriptModelConfig } = useConfig();
  const { availableModels, loadingModels, fetchModels } = useTranscriptionModels(transcriptModelConfig);

  useEffect(() => { void fetchModels(); }, [fetchModels]);

  const current = `${transcriptModelConfig.provider === 'localWhisper' ? 'whisper' : transcriptModelConfig.provider}:${transcriptModelConfig.model}`;

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
      apiKey: mapped === previous.provider ? previous.apiKey : null,
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

  return (
    <Labeled label={t('home.transcribeWith')}>
      <Select value={current} onValueChange={(value) => void save(value)} disabled={loadingModels && availableModels.length === 0}>
        <SelectTrigger aria-label={t('home.transcribeWith')}>
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {availableModels.map((model) => (
            <SelectItem key={`${model.provider}:${model.name}`} value={`${model.provider}:${model.name}`}>
              {PROVIDER_LABEL[model.provider]} · {model.name}
            </SelectItem>
          ))}
          {/* El motor configurado puede no estar descargado todavía: se muestra igual para no dejar el campo vacío */}
          {!availableModels.some((m) => `${m.provider}:${m.name}` === current) && transcriptModelConfig.model && (
            <SelectItem value={current}>{transcriptModelConfig.model}</SelectItem>
          )}
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

type Catalog = { models: { id: string; name: string }[] };

export function SummaryModelSelect() {
  const { t } = useTranslation();
  const { modelConfig, setModelConfig } = useConfig();
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    let active = true;
    invoke<Catalog>('desktop_list_models', {
      provider: modelConfig.provider,
      purpose: 'analysis',
      apiKey: modelConfig.apiKey ?? null,
      endpoint: modelConfig.ollamaEndpoint ?? null,
      refresh: false,
    })
      .then((catalog) => { if (active) setModels(catalog.models ?? []); })
      .catch(() => { if (active) setModels([]); });
    return () => { active = false; };
  }, [modelConfig.provider, modelConfig.apiKey, modelConfig.ollamaEndpoint]);

  const save = async (model: string) => {
    const previous = modelConfig;
    const next = { ...previous, model };
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

  const options = models.some((m) => m.id === modelConfig.model) ? models : [{ id: modelConfig.model, name: modelConfig.model }, ...models];

  return (
    <Labeled label={t('home.summarizeWith')}>
      <Select value={modelConfig.model} onValueChange={(value) => void save(value)}>
        <SelectTrigger aria-label={t('home.summarizeWith')}>
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {options.filter((m) => m.id).map((m) => (
            <SelectItem key={m.id} value={m.id}>{m.name || m.id}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Labeled>
  );
}
