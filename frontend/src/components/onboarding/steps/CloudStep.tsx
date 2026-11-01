'use client';

import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Cloud, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ModelComplianceMarks } from '@/components/ModelComplianceMarks';
import { useConfig } from '@/contexts/ConfigContext';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { useCloudModels, type CloudModel } from '@/hooks/useCloudModels';
import { OnboardingShell } from '../shared/OnboardingShell';
import { fadeUp, stagger } from '../shared/motion';

type Role = 'chat' | 'transcription' | 'insights';

// Nube opcional: la clave de Vercel AI Gateway se guarda solo en este dispositivo.
export function CloudStep({ step, total, onNext, onBack }: { step: number; total: number; onNext: () => void; onBack: () => void }) {
  const { t } = useTranslation();
  const { providerApiKeys, updateProviderApiKey, saveChatModel, modelConfig, setModelConfig, transcriptModelConfig, setTranscriptModelConfig } = useConfig();
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [applying, setApplying] = useState(false);
  const [use, setUse] = useState<Record<Role, boolean>>({ chat: false, transcription: false, insights: false });
  const saved = !!providerApiKeys['vercel-gateway']?.trim();

  const chat = useCloudModels('chat')[0];
  const transcription = useCloudModels('transcription')[0];
  const insights = useCloudModels('analysis')[0];
  const picks: Record<Role, CloudModel | undefined> = { chat, transcription, insights };
  const labels: Record<Role, string> = { chat: t('ob2.meety.chat.title'), transcription: t('ob2.meety.transcription.title'), insights: t('ob2.meety.insights.title') };

  const saveKey = async () => {
    const key = draft.trim();
    if (!key) return;
    setSaving(true);
    setError(false);
    try {
      await invoke('api_save_api_key', { provider: 'vercel-gateway', apiKey: key });
      updateProviderApiKey('vercel-gateway', key);
      setDraft('');
    } catch (err) {
      console.error('[Onboarding] Could not save the gateway key:', err);
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  const continueWithChoices = async () => {
    setApplying(true);
    try {
      if (use.chat && chat) await saveChatModel(chat.provider, chat.id);
      if (use.insights && insights) {
        const next = { ...modelConfig, provider: insights.provider as typeof modelConfig.provider, model: insights.id, apiKey: null as string | null };
        setModelConfig(next);
        await invoke('api_save_model_config', { provider: insights.provider, model: insights.id, whisperModel: next.whisperModel, apiKey: null, ollamaEndpoint: next.ollamaEndpoint ?? null });
        const { emit } = await import('@tauri-apps/api/event');
        await emit('model-config-updated', next);
      }
      if (use.transcription && transcription) {
        setTranscriptModelConfig({ ...transcriptModelConfig, provider: transcription.provider as typeof transcriptModelConfig.provider, model: transcription.id, apiKey: null });
        await invoke('api_save_transcript_config', { provider: transcription.provider, model: transcription.id, apiKey: null });
      }
    } catch (err) {
      console.error('[Onboarding] Could not apply the cloud choices:', err);
    } finally {
      setApplying(false);
    }
    onNext();
  };

  return (
    <OnboardingShell
      hero={
        <motion.span initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }} className="grid size-20 place-items-center rounded-3xl bg-brand/10 text-brand">
          <Cloud className="size-9" strokeWidth={1.6} />
        </motion.span>
      }
      title={t('ob2.cloud.title')}
      description={t('ob2.cloud.subtitle')}
      step={step}
      total={total}
      onBack={onBack}
    >
      <motion.div variants={stagger} initial="hidden" animate="show" className="grid w-full gap-3">
        <motion.div variants={fadeUp} className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 p-4 text-left">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" />
          <p className="text-xs leading-5 text-foreground">{t('ob2.cloud.assurance')}</p>
        </motion.div>

        <motion.div variants={fadeUp} className="rounded-xl border border-border bg-card p-4 text-left">
          <AnimatePresence mode="wait" initial={false}>
            {saved ? (
              <motion.p key="saved" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-sm font-medium text-success">
                <Check className="size-4" /> {t('ob2.cloud.saved')}
              </motion.p>
            ) : (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid gap-2">
                <label htmlFor="ob-gateway-key" className="flex items-center gap-2 text-sm font-medium"><KeyRound className="size-4 text-muted-foreground" />{t('ob2.cloud.keyLabel')}</label>
                <div className="flex gap-2">
                  <Input id="ob-gateway-key" type="password" autoComplete="off" spellCheck={false} value={draft} onChange={(event) => setDraft(event.target.value)} className="font-mono text-xs" />
                  <Button onClick={() => void saveKey()} disabled={!draft.trim() || saving}>
                    {saving && <Loader2 className="animate-spin" />}
                    {t('ob2.cloud.save')}
                  </Button>
                </div>
                {error && <p role="alert" className="text-xs text-destructive">{t('ob2.cloud.failed')}</p>}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <AnimatePresence initial={false}>
          {saved && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="rounded-xl border border-border bg-card p-4 text-left">
                <p className="mb-3 text-sm font-semibold">{t('ob2.cloud.use')}</p>
                <ul className="grid gap-3">
                  {(['chat', 'transcription', 'insights'] as Role[]).map((role) => (
                    <li key={role} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{labels[role]}</p>
                        {picks[role] && (
                          <p className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="truncate">{picks[role]?.label}</span>
                            <ModelComplianceMarks zdr={picks[role]?.zdr} noTraining={picks[role]?.noTraining} zdrLabel={t('pv.zdrTitle')} noTrainingLabel={t('pv.noTrainingTitle')} />
                          </p>
                        )}
                      </div>
                      <Switch checked={use[role]} disabled={!picks[role]} onCheckedChange={(checked) => setUse((current) => ({ ...current, [role]: checked }))} aria-label={labels[role]} />
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <motion.div variants={fadeUp} initial="hidden" animate="show" className="flex w-full max-w-xs flex-col items-center gap-3">
        <Button size="lg" className="w-full" onClick={() => void continueWithChoices()} disabled={applying}>
          {applying && <Loader2 className="animate-spin" />}
          {saved ? t('ob2.continue') : t('ob2.cloud.skip')}
        </Button>
      </motion.div>
    </OnboardingShell>
  );
}
