import { ProviderModelPicker } from '@/components/ProviderModelPicker';
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { SettingsSection } from '@/components/ui/settings';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { cn } from '@/lib/utils';
import { Cloud, Eye, EyeOff, Lock, ShieldCheck, Unlock } from 'lucide-react';
import { ModelManager } from './WhisperModelManager';
import { ParakeetModelManager } from './ParakeetModelManager';


export interface TranscriptModelProps {
    provider: 'localWhisper' | 'parakeet' | 'deepgram' | 'elevenLabs' | 'groq' | 'openai' | 'gemini' | 'vercel-gateway';
    model: string;
    apiKey?: string | null;
}

export interface TranscriptSettingsProps {
    transcriptModelConfig: TranscriptModelProps;
    setTranscriptModelConfig: (config: TranscriptModelProps) => void;
    onModelSelect?: () => void;
}

export function TranscriptSettings({ transcriptModelConfig, setTranscriptModelConfig, onModelSelect }: TranscriptSettingsProps) {
    const { t } = useTranslation();
    const [apiKey, setApiKey] = useState<string | null>(transcriptModelConfig.apiKey || null);
    const [showApiKey, setShowApiKey] = useState<boolean>(false);
    const [isApiKeyLocked, setIsApiKeyLocked] = useState<boolean>(true);
    const [isLockButtonVibrating, setIsLockButtonVibrating] = useState<boolean>(false);
    const [uiProvider, setUiProvider] = useState<TranscriptModelProps['provider']>(transcriptModelConfig.provider);

    const persistTranscriptConfig = async (config: TranscriptModelProps) => {
        try {
            await invoke('api_save_transcript_config', {
                provider: config.provider,
                model: config.model,
                apiKey: config.apiKey ?? null,
            });
        } catch (error) {
            console.error('Failed to save transcript configuration:', error);
        }
    };

    // Sync uiProvider when backend config changes (e.g., after model selection or initial load)
    useEffect(() => {
        setUiProvider(transcriptModelConfig.provider);
    }, [transcriptModelConfig.provider]);

    useEffect(() => {
        if (transcriptModelConfig.provider === 'localWhisper' || transcriptModelConfig.provider === 'parakeet') {
            setApiKey(null);
        }
    }, [transcriptModelConfig.provider]);

    const fetchApiKey = async (provider: string) => {
        try {

            const data = await invoke('api_get_transcript_api_key', { provider }) as string;

            setApiKey(data || '');
        } catch (err) {
            console.error('Error fetching API key:', err);
            setApiKey(null);
        }
    };
    const modelOptions = {
        localWhisper: [], // Model selection handled by ModelManager component
        parakeet: [], // Model selection handled by ParakeetModelManager component
        deepgram: ['nova-2-phonecall'],
        elevenLabs: ['eleven_multilingual_v2'],
        groq: [],
        openai: [],
        gemini: [],
        'vercel-gateway': [],
    };
    const requiresApiKey = uiProvider === 'deepgram' || uiProvider === 'elevenLabs' || uiProvider === 'openai' || uiProvider === 'groq' || uiProvider === 'gemini';

    const handleInputClick = () => {
        if (isApiKeyLocked) {
            setIsLockButtonVibrating(true);
            setTimeout(() => setIsLockButtonVibrating(false), 500);
        }
    };

    const handleWhisperModelSelect = (modelName: string) => {
        // Always update config when model is selected, regardless of current provider
        // This ensures the model is set when user switches back
        setTranscriptModelConfig({
            ...transcriptModelConfig,
            provider: 'localWhisper', // Ensure provider is set correctly
            model: modelName
        });
        // Close modal after selection
        if (onModelSelect) {
            onModelSelect();
        }
    };

    const handleParakeetModelSelect = (modelName: string) => {
        // Always update config when model is selected, regardless of current provider
        // This ensures the model is set when user switches back
        setTranscriptModelConfig({
            ...transcriptModelConfig,
            provider: 'parakeet', // Ensure provider is set correctly
            model: modelName
        });
        // Close modal after selection
        if (onModelSelect) {
            onModelSelect();
        }
    };

    const engines: { value: 'parakeet' | 'localWhisper' | 'vercel-gateway'; label: string; desc: string; cloud: boolean }[] = [
        { value: 'parakeet', label: t('sx.parakeet'), desc: t('sx.parakeetDesc'), cloud: false },
        { value: 'localWhisper', label: t('sx.whisper'), desc: t('sx.whisperDesc'), cloud: false },
        { value: 'vercel-gateway', label: t('sx.gateway'), desc: t('sx.gatewayDesc'), cloud: true },
    ];

    const chooseEngine = (provider: TranscriptModelProps['provider']) => {
        setUiProvider(provider);
        if (provider !== 'localWhisper' && provider !== 'parakeet' && provider !== 'vercel-gateway') {
            fetchApiKey(provider);
            const nextConfig: TranscriptModelProps = {
                ...transcriptModelConfig,
                provider,
                model: provider === transcriptModelConfig.provider ? transcriptModelConfig.model : modelOptions[provider][0] || '',
                apiKey: null,
            };
            setTranscriptModelConfig(nextConfig);
            void persistTranscriptConfig(nextConfig);
        }
    };

    return (
        <div>
            <SettingsSection title={t('sx.engine')} description={t('sx.engineHint')}>
                <div role="radiogroup" aria-label={t('sx.engine')} className="grid gap-2.5 sm:grid-cols-3">
                    {engines.map((engine) => {
                        const active = uiProvider === engine.value;
                        return (
                            <button
                                key={engine.value}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                onClick={() => chooseEngine(engine.value)}
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

                {uiProvider === 'vercel-gateway' && (
                    <p className="mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                        <Cloud className="mt-0.5 size-3.5 shrink-0" />
                        {t('sx.gatewayWarn')}
                    </p>
                )}
            </SettingsSection>

            {['vercel-gateway', 'openai', 'groq'].includes(uiProvider) && (
                <SettingsSection title={t('sx.model')}>
                    <ProviderModelPicker
                        provider={uiProvider}
                        purpose="transcription"
                        value={transcriptModelConfig.model}
                        apiKey={apiKey}
                        onChange={(model) => {
                            const config = { ...transcriptModelConfig, provider: uiProvider, model };
                            setTranscriptModelConfig(config);
                            void persistTranscriptConfig(config);
                        }}
                    />
                </SettingsSection>
            )}

            {uiProvider === 'localWhisper' && (
                <SettingsSection title={t('sx.model')}>
                    <ModelManager
                        selectedModel={transcriptModelConfig.provider === 'localWhisper' ? transcriptModelConfig.model : undefined}
                        onModelSelect={handleWhisperModelSelect}
                        autoSave={true}
                    />
                </SettingsSection>
            )}

            {uiProvider === 'parakeet' && (
                <SettingsSection title={t('sx.model')}>
                    <ParakeetModelManager
                        selectedModel={transcriptModelConfig.provider === 'parakeet' ? transcriptModelConfig.model : undefined}
                        onModelSelect={handleParakeetModelSelect}
                        autoSave={true}
                    />
                </SettingsSection>
            )}

            {requiresApiKey && (
                <SettingsSection title={t('sx.apiKey')}>
                    <div className="relative max-w-xl">
                        <Input
                            type={showApiKey ? 'text' : 'password'}
                            className="pr-20"
                            value={apiKey || ''}
                            onChange={(e) => {
                                setApiKey(e.target.value);
                                setTranscriptModelConfig({
                                    ...transcriptModelConfig,
                                    provider: uiProvider,
                                    apiKey: e.target.value,
                                });
                            }}
                            onBlur={() => {
                                void persistTranscriptConfig({
                                    ...transcriptModelConfig,
                                    provider: uiProvider,
                                    model: transcriptModelConfig.model,
                                    apiKey: apiKey || null,
                                });
                            }}
                            disabled={isApiKeyLocked}
                            onClick={handleInputClick}
                            placeholder={t('sx.apiKeyPlaceholder')}
                        />
                        <div className="absolute inset-y-0 right-0 flex items-center pr-1">
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => setIsApiKeyLocked(!isApiKeyLocked)}
                                className={isLockButtonVibrating ? 'animate-vibrate text-destructive' : ''}
                                title={isApiKeyLocked ? t('sx.unlock') : t('sx.lock')}
                                aria-label={isApiKeyLocked ? t('sx.unlock') : t('sx.lock')}
                            >
                                {isApiKeyLocked ? <Lock /> : <Unlock />}
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => setShowApiKey(!showApiKey)}
                                title={showApiKey ? t('sx.hide') : t('sx.show')}
                                aria-label={showApiKey ? t('sx.hide') : t('sx.show')}
                            >
                                {showApiKey ? <EyeOff /> : <Eye />}
                            </Button>
                        </div>
                    </div>
                </SettingsSection>
            )}
        </div>
    );
}
