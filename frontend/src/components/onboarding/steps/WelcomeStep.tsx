'use client';

import React from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Lock, Mic, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { easeOut, fadeUp, stagger } from '../shared/motion';

// Pantalla 1: bienvenida breve que presenta el producto y genera confianza.
export function WelcomeStep({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation();
  const points = [
    { icon: Mic, title: t('ob2.welcome.p1.title'), body: t('ob2.welcome.p1.body') },
    { icon: Lock, title: t('ob2.welcome.p2.title'), body: t('ob2.welcome.p2.body') },
    { icon: Sparkles, title: t('ob2.welcome.p3.title'), body: t('ob2.welcome.p3.body') },
  ];

  return (
    <div className="absolute inset-0 flex flex-col items-center overflow-y-auto bg-background px-6 py-12">
      <div className="my-auto flex w-full max-w-xl flex-col items-center gap-9 text-center">
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 18 }}>
          <Image src="/icon.png" alt="" width={72} height={72} priority className="rounded-[1.4rem] shadow-sm ring-1 ring-border" />
        </motion.div>

        <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col items-center gap-3">
          <motion.p variants={fadeUp} className="text-sm font-medium text-brand">{t('ob2.welcome.eyebrow')}</motion.p>
          <motion.h1 variants={fadeUp} className="text-4xl font-semibold tracking-[-0.035em] text-foreground sm:text-5xl">{t('ob2.welcome.title')}</motion.h1>
          <motion.p variants={fadeUp} className="max-w-md text-base leading-relaxed text-muted-foreground">{t('ob2.welcome.subtitle')}</motion.p>
        </motion.div>

        <motion.ul variants={stagger} initial="hidden" animate="show" className="grid w-full gap-3 text-left sm:grid-cols-3">
          {points.map(({ icon: Icon, title, body }) => (
            <motion.li key={title} variants={fadeUp} className="rounded-xl border border-border bg-card p-4">
              <span className="mb-3 grid size-9 place-items-center rounded-lg bg-brand/10 text-brand"><Icon className="size-[18px]" /></span>
              <p className="text-sm font-semibold leading-5">{title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{body}</p>
            </motion.li>
          ))}
        </motion.ul>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...easeOut, delay: 0.7 }} className="flex w-full max-w-xs flex-col items-center gap-3">
          <Button size="lg" className="w-full" onClick={onNext}>{t('ob2.welcome.cta')}</Button>
          <p className="text-xs text-muted-foreground">{t('ob2.welcome.trust')}</p>
        </motion.div>
      </div>
    </div>
  );
}
