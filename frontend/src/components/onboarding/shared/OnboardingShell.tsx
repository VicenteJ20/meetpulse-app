'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { cn } from '@/lib/utils';
import { fadeUp } from './motion';

interface OnboardingShellProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Pantalla actual dentro de los pasos numerados (1 a total). Sin valor no se muestran puntos. */
  step?: number;
  total?: number;
  onBack?: () => void;
  /** Contenido sobre el título, por ejemplo un icono grande. */
  hero?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

// Marco común del onboarding: barra superior con "Volver" y puntos de progreso, título y contenido.
export function OnboardingShell({ title, description, step, total, onBack, hero, children, className }: OnboardingShellProps) {
  const { t } = useTranslation();

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden bg-background">
      <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-5">
        <div>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="size-4" /> {t('ob2.back')}
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step} hidden={!step || !total}>
          {step && total
            ? Array.from({ length: total }, (_, index) => (
                <motion.span
                  key={index}
                  layout
                  className={cn('h-1.5 rounded-full', index + 1 === step ? 'w-6 bg-brand' : index + 1 < step ? 'w-1.5 bg-brand/50' : 'w-1.5 bg-border')}
                />
              ))
            : null}
        </div>
        <div />
      </header>

      <main className="custom-scrollbar flex flex-1 justify-center overflow-y-auto px-6 pb-10">
        <div className={cn('flex w-full max-w-xl flex-col items-center gap-8 pt-6 sm:pt-10', className)}>
          <motion.div variants={fadeUp} initial="hidden" animate="show" className="flex flex-col items-center gap-3 text-center">
            {hero}
            <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">{title}</h1>
            {description && <p className="max-w-md text-base leading-relaxed text-muted-foreground">{description}</p>}
          </motion.div>
          {children}
        </div>
      </main>
    </div>
  );
}
