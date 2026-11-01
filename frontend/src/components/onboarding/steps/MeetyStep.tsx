'use client';

import React, { useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion } from 'framer-motion';
import { Lightbulb, Loader2, MessageSquare, Mic, Sparkles } from 'lucide-react';
import { BetaBadge } from '@/components/BetaBadge';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { useConfig } from '@/contexts/ConfigContext';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { useCloudModels } from '@/hooks/useCloudModels';
import { OnboardingShell } from '../shared/OnboardingShell';
import { useBuiltinModels } from '../shared/useBuiltinModels';
import { fadeUp, stagger } from '../shared/motion';

const LATER = 'later';
const PARAKEET = 'parakeet';

function RoleCard({ icon, title, body, children, note }: { icon: React.ReactNode; title: string; body: string; children: React.ReactNode; note?: string }) {
  return (
    <motion.div variants={fadeUp} className="rounded-xl border border-border bg-card p-4 text-left">
      <div className="flex items-start gap-3.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-5">{title}</p>
          <p className="text-xs leading-5 text-muted-foreground">{body}</p>
          <div className="mt-3">{children}</div>
          {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
        </div>
      </div>
    </motion.div>
  );
}

// Presenta a Meety y deja elegir un modelo para conversar, otro para transcribir y otro para los insights.
export function MeetyStep({ step, total, onNext, onBack }: { step: number; total: number; onNext: () => void; onBack: () => void }) {
  const { t } = useTranslation();
  const { modelConfig, setModelConfig, chatModelConfig, saveChatModel, providerApiKeys, setTranscriptModelConfig, transcriptModelConfig } = useConfig();
  const builtin = useBuiltinModels();
  const hasKey = !!providerApiKeys['vercel-gateway']?.trim();
  const cloudChat = useCloudModels('chat');
  const cloudAnalysis = useCloudModels('analysis');
  const cloudTranscription = useCloudModels('transcription');

  const [chat, setChat] = useState<string>('');
  const [insights, setInsights] = useState<string>('');
  const [transcription, setTranscription] = useState<string>(PARAKEET);
  const [saving, setSaving] = useState(false);

  // Valores iniciales: lo ya configurado o, si no es una opción disponible, el modelo local recomendado.
  const fallback = builtin.recommended ? `builtin-ai:${builtin.recommended}` : LATER;

  const stateLabel = (name: string) => {
    const model = builtin.models.find((item) => item.name === name);
    if (!model) return '';
    if (model.available) return t('ob2.meety.downloaded');
    if (model.downloading) return t('ob2.meety.downloading').replace('{percent}', String(model.percent));
    return t('ob2.meety.willDownload').replace('{size}', model.sizeMb >= 1024 ? `${(model.sizeMb / 1024).toFixed(1)} GB` : `${model.sizeMb} MB`);
  };

  const localOptions = useMemo(
    () => builtin.models.map((model) => ({ value: `builtin-ai:${model.name}`, label: `${model.displayName} · ${t('ob2.meety.local')} · ${stateLabel(model.name)}` })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [builtin.models, t],
  );
  const cloudOptions = (models: { provider: string; id: string; label: string }[]) =>
    hasKey ? models.map((model) => ({ value: `${model.provider}:${model.id}`, label: `${model.label} · ${t('ob2.meety.cloud')}` })) : [];
  const later = { value: LATER, label: t('ob2.meety.later') };
  const chatOptions = [...localOptions, ...cloudOptions(cloudChat), later];
  const insightsOptions = [...localOptions, ...cloudOptions(cloudAnalysis), later];
  const pick = (current: string, saved: { provider?: string; model?: string }, options: { value: string }[]) => {
    const candidates = [current, saved.provider && saved.model ? `${saved.provider}:${saved.model}` : '', fallback];
    return candidates.find((value) => value && options.some((option) => option.value === value)) ?? LATER;
  };
  const chatValue = pick(chat, chatModelConfig, chatOptions);
  const insightsValue = pick(insights, modelConfig, insightsOptions);

  const split = (value: string) => {
    const index = value.indexOf(':');
    return { provider: value.slice(0, index), model: value.slice(index + 1) };
  };

  const apply = async () => {
    setSaving(true);
    try {
      if (chatValue !== LATER) {
        const { provider, model } = split(chatValue);
        await saveChatModel(provider, model);
        if (provider === 'builtin-ai') void startIfNeeded(model);
      }
      if (insightsValue !== LATER) {
        const { provider, model } = split(insightsValue);
        const next = { ...modelConfig, provider: provider as typeof modelConfig.provider, model, apiKey: null as string | null };
        setModelConfig(next);
        await invoke('api_save_model_config', { provider, model, whisperModel: next.whisperModel, apiKey: null, ollamaEndpoint: next.ollamaEndpoint ?? null });
        const { emit } = await import('@tauri-apps/api/event');
        await emit('model-config-updated', next);
        if (provider === 'builtin-ai') void startIfNeeded(model);
      }
      if (transcription !== PARAKEET) {
        const { provider, model } = split(transcription);
        const next = { ...transcriptModelConfig, provider: provider as typeof transcriptModelConfig.provider, model, apiKey: null };
        setTranscriptModelConfig(next);
        await invoke('api_save_transcript_config', { provider, model, apiKey: null });
      }
    } catch (error) {
      console.error('[Onboarding] Could not save the model choices:', error);
    } finally {
      setSaving(false);
    }
    onNext();
  };

  const startIfNeeded = async (name: string) => {
    const model = builtin.models.find((item) => item.name === name);
    if (model && !model.available && !model.downloading) await builtin.download(name);
  };

  return (
    <OnboardingShell
      hero={
        <motion.span initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }} className="grid size-20 place-items-center rounded-3xl bg-brand/10 text-brand">
          <Sparkles className="size-9" strokeWidth={1.6} />
        </motion.span>
      }
      title={
        <span className="inline-flex flex-wrap items-center justify-center gap-2">
          {t('ob2.meety.title')} <BetaBadge />
        </span>
      }
      description={t('ob2.meety.subtitle')}
      step={step}
      total={total}
      onBack={onBack}
    >
      <motion.div variants={stagger} initial="hidden" animate="show" className="grid w-full gap-3">
        <RoleCard icon={<MessageSquare className="size-5" />} title={t('ob2.meety.chat.title')} body={t('ob2.meety.chat.body')}>
          <SelectField value={chatValue} onValueChange={setChat} options={chatOptions} aria-label={t('ob2.meety.chat.title')} className="w-full" />
        </RoleCard>
        <RoleCard
          icon={<Mic className="size-5" />}
          title={t('ob2.meety.transcription.title')}
          body={t('ob2.meety.transcription.body')}
          note={hasKey ? undefined : t('ob2.meety.hintCloud')}
        >
          <SelectField
            value={transcription}
            onValueChange={setTranscription}
            options={[{ value: PARAKEET, label: t('ob2.meety.parakeet') }, ...cloudOptions(cloudTranscription)]}
            aria-label={t('ob2.meety.transcription.title')}
            className="w-full"
          />
        </RoleCard>
        <RoleCard icon={<Lightbulb className="size-5" />} title={t('ob2.meety.insights.title')} body={t('ob2.meety.insights.body')}>
          <SelectField value={insightsValue} onValueChange={setInsights} options={insightsOptions} aria-label={t('ob2.meety.insights.title')} className="w-full" />
        </RoleCard>
      </motion.div>

      <motion.div variants={fadeUp} initial="hidden" animate="show" className="flex w-full max-w-xs flex-col items-center gap-3">
        <Button size="lg" className="w-full" onClick={() => void apply()} disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          {t('ob2.continue')}
        </Button>
      </motion.div>
    </OnboardingShell>
  );
}
