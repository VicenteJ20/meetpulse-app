'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { cn } from '@/lib/utils';
import { fadeUp, swapVariants } from './motion';
import type { EngineState } from './useLocalEngines';

interface EngineRowProps {
  icon: React.ReactNode;
  title: string;
  body?: string;
  state: EngineState;
  onRetry?: () => void;
}

// Una fila con el estado de un modelo local: el icono y la etiqueta cambian al avanzar la descarga.
export function EngineRow({ icon, title, body, state, onRetry }: EngineRowProps) {
  const { t } = useTranslation();
  const { status, percent } = state;
  const label =
    status === 'ready' ? t('ob2.engine.state.ready')
    : status === 'error' ? t('ob2.engine.state.error')
    : status === 'downloading' ? t('ob2.engine.state.downloading').replace('{percent}', String(percent))
    : status === 'waiting' ? t('ob2.engine.state.waiting')
    : t('ob2.engine.state.checking');

  return (
    <motion.div variants={fadeUp} className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3.5">
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg transition-colors duration-300', status === 'ready' ? 'bg-success/15 text-success' : 'bg-brand/10 text-brand')}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-5">{title}</p>
          {body && <p className="text-xs leading-5 text-muted-foreground">{body}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs font-medium" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={status} variants={swapVariants} initial="hidden" animate="show" exit="exit" className="inline-flex">
              {status === 'ready' ? <Check className="size-4 text-success" /> : status === 'error' ? <AlertTriangle className="size-4 text-destructive" /> : <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            </motion.span>
          </AnimatePresence>
          <span className={cn(status === 'ready' ? 'text-success' : status === 'error' ? 'text-destructive' : 'text-muted-foreground')}>{label}</span>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {(status === 'downloading' || status === 'waiting') && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <motion.div className="h-full rounded-full bg-brand" initial={false} animate={{ width: `${Math.max(percent, status === 'downloading' ? 3 : 0)}%` }} transition={{ ease: 'easeOut', duration: 0.5 }} />
            </div>
          </motion.div>
        )}
        {status === 'error' && onRetry && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-2 flex justify-end">
            <button type="button" onClick={onRetry} className="text-xs font-medium text-brand hover:underline">
              {t('ob2.engine.retry')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
