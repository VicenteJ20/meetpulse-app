'use client';

import React, { useContext, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Check, Loader2, Mic, PartyPopper, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { AnalyticsContext } from '@/components/AnalyticsProvider';
import { OnboardingShell } from '../shared/OnboardingShell';
import { useLocalEngines, type EngineState } from '../shared/useLocalEngines';
import { fadeUp, stagger } from '../shared/motion';
import { cn } from '@/lib/utils';

function SummaryRow({ icon, label, state }: { icon: React.ReactNode; label: string; state: 'ready' | 'pending' | 'off'; }) {
  return (
    <motion.li variants={fadeUp} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', state === 'ready' ? 'bg-success/15 text-success' : state === 'pending' ? 'bg-brand/10 text-brand' : 'bg-muted text-muted-foreground')}>
        {icon}
      </span>
      <span className="flex-1 text-left text-sm font-medium">{label}</span>
      {state === 'ready' ? <Check className="size-4 text-success" /> : state === 'pending' ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
    </motion.li>
  );
}

// Pantalla final: resume lo configurado y muestra el estado real de las descargas pendientes.
export function ReadyStep({ step, total, onFinish, onBack }: { step: number; total: number; onFinish: () => Promise<void>; onBack: () => void }) {
  const { t } = useTranslation();
  const { isAnalyticsOptedIn } = useContext(AnalyticsContext);
  const { isBackgroundDownloading } = useOnboarding();
  const engines = useLocalEngines({ autoStart: false });
  const [finishing, setFinishing] = useState(false);

  const pendingLabel = (engine: EngineState, label: string) =>
    engine.status === 'ready' ? label : `${label} · ${t('ob2.ready.pending').replace('{percent}', String(engine.percent))}`;
  const rowState = (engine: EngineState): 'ready' | 'pending' => (engine.status === 'ready' ? 'ready' : 'pending');
  const waiting = !engines.allReady && (isBackgroundDownloading || engines.parakeet.status === 'downloading' || engines.search.status === 'downloading');

  const finish = async () => {
    setFinishing(true);
    try {
      await onFinish();
    } finally {
      setFinishing(false);
    }
  };

  return (
    <OnboardingShell
      hero={
        <motion.span initial={{ scale: 0.6, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }} className="grid size-20 place-items-center rounded-3xl bg-success/15 text-success">
          <PartyPopper className="size-9" strokeWidth={1.6} />
        </motion.span>
      }
      title={t('ob2.ready.title')}
      description={waiting ? t('ob2.ready.subtitleWaiting') : t('ob2.ready.subtitleReady')}
      step={step}
      total={total}
      onBack={onBack}
    >
      <motion.ul variants={stagger} initial="hidden" animate="show" className="grid w-full gap-2.5">
        <SummaryRow icon={<Mic className="size-[18px]" />} label={pendingLabel(engines.parakeet, t('ob2.ready.transcription'))} state={rowState(engines.parakeet)} />
        <SummaryRow icon={<Search className="size-[18px]" />} label={pendingLabel(engines.search, t('ob2.ready.search'))} state={rowState(engines.search)} />
        <SummaryRow icon={<BarChart3 className="size-[18px]" />} label={isAnalyticsOptedIn ? t('ob2.ready.analyticsOn') : t('ob2.ready.analyticsOff')} state={isAnalyticsOptedIn ? 'ready' : 'off'} />
      </motion.ul>

      <motion.div variants={fadeUp} initial="hidden" animate="show" className="flex w-full max-w-xs flex-col items-center gap-3">
        <Button size="lg" className="w-full" onClick={() => void finish()} disabled={finishing}>
          {finishing && <Loader2 className="animate-spin" />}
          {waiting ? t('ob2.ready.ctaWaiting') : t('ob2.ready.cta')}
        </Button>
        <p className="text-center text-xs text-muted-foreground">{t('ob2.ready.tip')}</p>
      </motion.div>
    </OnboardingShell>
  );
}
