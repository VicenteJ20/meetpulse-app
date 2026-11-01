'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Compass, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { OnboardingShell } from '../shared/OnboardingShell';
import { fadeUp, stagger } from '../shared/motion';

export type SetupMode = 'full' | 'express';

// Pantalla 2: dos formas de configurar. La completa va primero y es la acción principal.
export function ModeStep({ onSelect, onBack }: { onSelect: (mode: SetupMode) => void; onBack: () => void }) {
  const { t } = useTranslation();

  return (
    <OnboardingShell title={t('ob2.mode.title')} description={t('ob2.mode.subtitle')} onBack={onBack}>
      <motion.div variants={stagger} initial="hidden" animate="show" className="grid w-full gap-4">
        <motion.div
          variants={fadeUp}
          whileHover={{ y: -2 }}
          className="rounded-2xl border-2 border-brand/60 bg-card p-5 shadow-[0_12px_32px_-16px_hsl(var(--brand)/0.5)]"
        >
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><Compass className="size-5" /></span>
            <div className="min-w-0 flex-1 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">{t('ob2.mode.full.title')}</h2>
                <Badge variant="accent">{t('ob2.mode.full.badge')}</Badge>
              </div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('ob2.mode.full.body')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('ob2.mode.full.meta')}</p>
            </div>
          </div>
          <Button size="lg" className="mt-4 w-full" onClick={() => onSelect('full')}>{t('ob2.mode.full.cta')}</Button>
        </motion.div>

        <motion.div variants={fadeUp} whileHover={{ y: -2 }} className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><Zap className="size-5" /></span>
            <div className="min-w-0 flex-1 text-left">
              <h2 className="text-base font-semibold">{t('ob2.mode.express.title')}</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('ob2.mode.express.body')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('ob2.mode.express.meta')}</p>
            </div>
          </div>
          <Button size="lg" variant="outline" className="mt-4 w-full" onClick={() => onSelect('express')}>{t('ob2.mode.express.cta')}</Button>
        </motion.div>
      </motion.div>
    </OnboardingShell>
  );
}
