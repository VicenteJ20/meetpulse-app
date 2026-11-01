'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Mic, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { OnboardingShell } from '../shared/OnboardingShell';
import { EngineRow } from '../shared/EngineRow';
import { useLocalEngines } from '../shared/useLocalEngines';
import { fadeUp, stagger } from '../shared/motion';

// Descarga los modelos locales esenciales. La persona puede seguir mientras se descargan.
export function EngineStep({ step, total, onNext, onBack }: { step: number; total: number; onNext: () => void; onBack: () => void }) {
  const { t } = useTranslation();
  const engines = useLocalEngines({ autoStart: true });
  const hasError = engines.parakeet.status === 'error' || engines.search.status === 'error';

  return (
    <OnboardingShell title={t('ob2.engine.title')} description={t('ob2.engine.subtitle')} step={step} total={total} onBack={onBack}>
      <motion.div variants={stagger} initial="hidden" animate="show" className="grid w-full gap-3">
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
