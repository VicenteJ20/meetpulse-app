'use client';

import React, { useContext, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AnimatePresence, motion } from 'framer-motion';
import { HandHeart, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { AnalyticsContext } from '@/components/AnalyticsProvider';
import AnalyticsDataModal from '@/components/AnalyticsDataModal';
import { persistAnalyticsConsent } from '@/lib/analytics-consent';
import { cn } from '@/lib/utils';
import { OnboardingShell } from '../shared/OnboardingShell';
import { fadeUp, swapVariants } from '../shared/motion';

// Analítica: llega activada, se explica con claridad y se puede apagar. Hasta pulsar "Continuar" no se envía nada.
export function PrivacyStep({ step, total, onNext, onBack }: { step: number; total: number; onNext: () => void; onBack: () => void }) {
  const { t } = useTranslation();
  const { isAnalyticsOptedIn, setIsAnalyticsOptedIn } = useContext(AnalyticsContext);
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    invoke<boolean>('analytics_configured').then(setConfigured).catch(() => setConfigured(false));
  }, []);

  // Si se vuelve a esta pantalla, se respeta lo ya decidido.
  useEffect(() => {
    if (isAnalyticsOptedIn) setEnabled(true);
  }, [isAnalyticsOptedIn]);

  const next = async () => {
    setSaving(true);
    try {
      await persistAnalyticsConsent(enabled);
      setIsAnalyticsOptedIn(enabled);
    } catch (error) {
      console.error('[Onboarding] Could not save the analytics choice:', error);
    } finally {
      setSaving(false);
    }
    onNext();
  };

  const hero = (
    <div className="relative grid size-24 place-items-center">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={enabled ? 'on' : 'off'}
          variants={swapVariants}
          initial="hidden"
          animate="show"
          exit="exit"
          className={cn('grid size-24 place-items-center rounded-[1.75rem]', enabled ? 'bg-brand/10 text-brand' : 'bg-success/15 text-success')}
        >
          {enabled ? <HandHeart className="size-11" strokeWidth={1.6} /> : <ShieldCheck className="size-11" strokeWidth={1.6} />}
        </motion.span>
      </AnimatePresence>
    </div>
  );

  return (
    <OnboardingShell hero={hero} title={t('ob2.privacy.title')} description={t('ob2.privacy.subtitle')} step={step} total={total} onBack={onBack}>
      <motion.div variants={fadeUp} initial="hidden" animate="show" className="w-full rounded-2xl border border-border bg-card p-5">
        <div className="min-h-[7.5rem]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={enabled ? 'on' : 'off'}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="text-left"
              aria-live="polite"
            >
              <h2 className={cn('text-base font-semibold', enabled ? 'text-brand' : 'text-success')}>
                {enabled ? t('ob2.privacy.onTitle') : t('ob2.privacy.offTitle')}
              </h2>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{enabled ? t('ob2.privacy.onBody') : t('ob2.privacy.offBody')}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-4 flex items-center justify-between gap-4 border-t border-border pt-4">
          <label htmlFor="ob-analytics" className="text-sm font-medium">{t('ob2.privacy.toggle')}</label>
          <Switch id="ob-analytics" checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <button type="button" onClick={() => setShowDetails(true)} className="mt-3 text-xs font-medium text-brand hover:underline">
          {t('ob2.privacy.details')}
        </button>
        {!configured && <p className="mt-2 text-xs text-muted-foreground">{t('ob2.privacy.unavailable')}</p>}
      </motion.div>

      <motion.div variants={fadeUp} initial="hidden" animate="show" className="flex w-full max-w-xs flex-col items-center gap-3">
        <Button size="lg" className="w-full" onClick={() => void next()} disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          {t('ob2.continue')}
        </Button>
        <p className="text-center text-xs text-muted-foreground">{t('ob2.privacy.later')}</p>
      </motion.div>

      <AnalyticsDataModal isOpen={showDetails} onClose={() => setShowDetails(false)} />
    </OnboardingShell>
  );
}
