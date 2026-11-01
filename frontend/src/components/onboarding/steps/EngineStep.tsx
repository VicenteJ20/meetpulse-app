'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, DownloadCloud, FileText, Lock, Mic, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { OnboardingShell } from '../shared/OnboardingShell';
import { EngineRow } from '../shared/EngineRow';
import { useLocalEngines } from '../shared/useLocalEngines';
import { fadeUp, stagger, swapVariants } from '../shared/motion';
import { cn } from '@/lib/utils';

// Descarga los modelos locales esenciales. La persona puede seguir mientras se descargan.
// Esquema animado de lo que ocurre en el equipo (modo completo): voz -> transcripción -> resúmenes y respuestas.
function LocalDiagram() {
  const { t } = useTranslation();
  const nodes = [
    { icon: Mic, label: t('ob2.local.voice') },
    { icon: FileText, label: t('ob2.local.transcribe') },
    { icon: Sparkles, label: t('ob2.local.answers') },
  ];
  return (
    <motion.div variants={fadeUp} className="w-full rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        {nodes.map(({ icon: Icon, label }, index) => (
          <React.Fragment key={label}>
            <div className="flex w-20 flex-col items-center gap-2 text-center">
              <span className="grid size-12 place-items-center rounded-xl bg-brand/10 text-brand"><Icon className="size-5" /></span>
              <span className="text-xs font-medium leading-4">{label}</span>
            </div>
            {index < nodes.length - 1 && (
              <span className="relative mb-6 h-px flex-1 bg-border">
                <motion.span
                  className="absolute -top-[2px] size-[5px] rounded-full bg-brand"
                  animate={{ left: ['0%', '100%'], opacity: [0, 1, 0] }}
                  transition={{ duration: 1.8, repeat: Infinity, delay: index * 0.6, ease: 'easeInOut' }}
                />
              </span>
            )}
          </React.Fragment>
        ))}
      </div>
      <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><Lock className="size-3.5" />{t('ob2.local.banner')}</p>
    </motion.div>
  );
}

export function EngineStep({ step, total, onNext, onBack, variant = 'express' }: { step: number; total: number; onNext: () => void; onBack: () => void; variant?: 'express' | 'full' }) {
  const { t } = useTranslation();
  const engines = useLocalEngines({ autoStart: true });
  const hasError = engines.parakeet.status === 'error' || engines.search.status === 'error';

  // El icono pasa de "descargando" a "listo" cuando terminan los dos modelos.
  const hero = (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={engines.allReady ? 'ready' : 'working'}
        variants={swapVariants}
        initial="hidden"
        animate="show"
        exit="exit"
        className={cn('grid size-20 place-items-center rounded-3xl', engines.allReady ? 'bg-success/15 text-success' : 'bg-brand/10 text-brand')}
      >
        {engines.allReady ? <Check className="size-9" strokeWidth={1.8} /> : <DownloadCloud className="size-9" strokeWidth={1.6} />}
      </motion.span>
    </AnimatePresence>
  );

  return (
    <OnboardingShell hero={hero} title={variant === 'full' ? t('ob2.local.title') : t('ob2.engine.title')} description={variant === 'full' ? t('ob2.local.subtitle') : t('ob2.engine.subtitle')} step={step} total={total} onBack={onBack}>
      <motion.div variants={stagger} initial="hidden" animate="show" className="grid w-full gap-3">
        {variant === 'full' && <LocalDiagram />}
        <EngineRow
          icon={<Mic className="size-5" />}
          title={t('ob2.engine.parakeet.title')}
          body={t('ob2.engine.parakeet.body')}
          state={engines.parakeet}
          onRetry={engines.retryParakeet}
        />
        <EngineRow
          icon={<Search className="size-5" />}
          title={t('ob2.engine.search.title')}
          body={t('ob2.engine.search.body')}
          state={engines.search}
          onRetry={engines.retrySearch}
        />
      </motion.div>

      <motion.div variants={fadeUp} initial="hidden" animate="show" className="flex w-full max-w-xs flex-col items-center gap-3">
        <Button size="lg" className="w-full" onClick={onNext}>{t('ob2.continue')}</Button>
        <p className="text-center text-xs text-muted-foreground">{hasError ? t('ob2.engine.offline') : t('ob2.engine.hint')}</p>
      </motion.div>
    </OnboardingShell>
  );
}
