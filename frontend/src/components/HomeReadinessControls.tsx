'use client';

import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Check, Headphones, Mic, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { AudioDevice, SelectedDevices } from '@/components/DeviceSelection';
import type { RecordingPreferences } from '@/components/RecordingSettings';
import type { TranscriptModelProps } from '@/components/TranscriptSettings';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useConfig } from '@/contexts/ConfigContext';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { useTranscriptionModels } from '@/hooks/useTranscriptionModels';

type DeviceKind = 'micDevice' | 'systemDevice';

export function HomeReadinessControls({
  hasMicrophone,
  hasSystemAudio,
}: {
  hasMicrophone: boolean;
  hasSystemAudio: boolean;
}) {
  const { selectedDevices, setSelectedDevices, transcriptModelConfig, setTranscriptModelConfig } = useConfig();
  const { t } = useTranslation();
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [preferences, setPreferences] = useState<RecordingPreferences | null>(null);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const { availableModels, loadingModels, fetchModels } = useTranscriptionModels(transcriptModelConfig);

  useEffect(() => {
    let active = true;

    Promise.all([
      invoke<AudioDevice[]>('get_audio_devices'),
      invoke<RecordingPreferences>('get_recording_preferences'),
    ])
      .then(([availableDevices, savedPreferences]) => {
        if (!active) return;
        setDevices(availableDevices);
        setPreferences(savedPreferences);
      })
      .catch(error => console.error('Failed to load home recording controls:', error))
      .finally(() => {
        if (active) setLoadingDevices(false);
      });

    void fetchModels();
    return () => {
      active = false;
    };
  }, [fetchModels]);

  const inputDevices = useMemo(() => devices.filter(device => device.device_type === 'Input'), [devices]);
  const outputDevices = useMemo(() => devices.filter(device => device.device_type === 'Output'), [devices]);

  const saveDevice = async (kind: DeviceKind, value: string) => {
    const previousDevices = selectedDevices;
    const nextDevices: SelectedDevices = {
      ...selectedDevices,
      [kind]: value === 'default' ? null : value,
    };
    setSelectedDevices(nextDevices);

    try {
      const currentPreferences = preferences ?? await invoke<RecordingPreferences>('get_recording_preferences');
      const nextPreferences: RecordingPreferences = {
        ...currentPreferences,
        preferred_mic_device: nextDevices.micDevice,
        preferred_system_device: nextDevices.systemDevice,
      };
      await invoke('set_recording_preferences', { preferences: nextPreferences });
      setPreferences(nextPreferences);
      toast.success(t('home.settingSaved'));
    } catch (error) {
      setSelectedDevices(previousDevices);
      console.error('Failed to save device from home:', error);
      toast.error(t('home.settingSaveError'));
    }
  };

  const saveModel = async (key: string) => {
    const separator = key.indexOf(':');
    const provider = key.slice(0, separator);
    const model = key.slice(separator + 1);
    const mappedProvider: TranscriptModelProps['provider'] = provider === 'whisper' ? 'localWhisper' : provider as TranscriptModelProps['provider'];
    const previousConfig = transcriptModelConfig;
    const nextConfig: TranscriptModelProps = {
      ...transcriptModelConfig,
      provider: mappedProvider,
      model,
      apiKey: mappedProvider === transcriptModelConfig.provider ? transcriptModelConfig.apiKey : null,
    };
    setTranscriptModelConfig(nextConfig);

    try {
      await invoke('api_save_transcript_config', {
        provider: nextConfig.provider,
        model: nextConfig.model,
        apiKey: nextConfig.apiKey ?? null,
      });
      toast.success(t('home.settingSaved'));
    } catch (error) {
      setTranscriptModelConfig(previousConfig);
      console.error('Failed to save transcription model from home:', error);
      toast.error(t('home.settingSaveError'));
    }
  };

  const currentModelKey = `${transcriptModelConfig.provider === 'localWhisper' ? 'whisper' : transcriptModelConfig.provider}:${transcriptModelConfig.model}`;

  return (
    <div className="mt-5 space-y-2">
      <ReadinessSelect
        label={t('home.microphone')}
        value={selectedDevices.micDevice ?? 'default'}
        disabled={loadingDevices}
        ready={hasMicrophone}
        icon={Mic}
        onValueChange={value => void saveDevice('micDevice', value)}
      >
        <SelectItem value="default">{t('home.defaultDevice')}</SelectItem>
        {inputDevices.map(device => <SelectItem key={device.name} value={device.name}>{device.name}</SelectItem>)}
      </ReadinessSelect>

      <ReadinessSelect
        label={t('home.systemAudio')}
        value={selectedDevices.systemDevice ?? 'default'}
        disabled={loadingDevices}
        ready={hasSystemAudio}
        icon={Headphones}
        onValueChange={value => void saveDevice('systemDevice', value)}
      >
        <SelectItem value="default">{t('home.defaultDevice')}</SelectItem>
        {outputDevices.map(device => <SelectItem key={device.name} value={device.name}>{device.name}</SelectItem>)}
      </ReadinessSelect>

      <ReadinessSelect
        label={t('home.transcription')}
        value={currentModelKey}
        disabled={loadingModels}
        ready={!!transcriptModelConfig.provider}
        icon={Sparkles}
        onValueChange={value => void saveModel(value)}
      >
        {availableModels.map(model => (
          <SelectItem key={`${model.provider}:${model.name}`} value={`${model.provider}:${model.name}`}>
            {model.provider === 'whisper' ? 'Whisper' : model.provider === 'parakeet' ? 'Parakeet' : 'Gemini'} · {model.name}
          </SelectItem>
        ))}
      </ReadinessSelect>
    </div>
  );
}

function ReadinessSelect({
  label,
  value,
  disabled,
  ready,
  icon: Icon,
  onValueChange,
  children,
}: {
  label: string;
  value: string;
  disabled: boolean;
  ready: boolean;
  icon: typeof Mic;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className="h-auto min-h-[60px] w-full rounded-xl border-0 bg-muted/55 px-3.5 py-3 text-left shadow-none transition-colors hover:bg-muted/80 focus:ring-brand">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <SelectValue className="block truncate text-sm font-medium" />
        </div>
        <span className={`mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${ready ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400' : 'bg-warning/12 text-amber-600 dark:text-amber-400'}`}>
          <Check className="h-3.5 w-3.5" />
        </span>
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}
