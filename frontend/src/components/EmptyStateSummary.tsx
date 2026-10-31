'use client';

import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/contexts/UiPreferencesContext';

interface EmptyStateSummaryProps {
  onGenerate: () => void;
  hasModel: boolean;
  isGenerating?: boolean;
  /** Hay un resumen antiguo que no tiene el formato de insights: se ofrece generarlos de nuevo. */
  legacy?: boolean;
}

export function EmptyStateSummary({ onGenerate, hasModel, isGenerating = false, legacy = false }: EmptyStateSummaryProps) {
  const { t } = useTranslation();
  return (
    <div className="animate-enter flex h-full flex-col items-center justify-center p-8 text-center">
      <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-accent text-brand">
        <Sparkles className="size-6" />
      </span>
      <h3 className="mb-1.5 text-lg font-semibold tracking-[-0.02em] text-foreground">
        {legacy ? t('insights.legacyTitle') : t('insights.emptyTitle')}
      </h3>
      <p className="mb-5 max-w-sm text-sm leading-6 text-muted-foreground">
        {legacy ? t('insights.legacyText') : t('insights.emptyText')}
      </p>
      <Button onClick={onGenerate} disabled={!hasModel || isGenerating}>
        <Sparkles />
        {isGenerating ? t('meeting.processing') : t('insights.generate')}
      </Button>
      {!hasModel && <p className="mt-3 text-xs text-warning">{t('insights.needModel')}</p>}
    </div>
  );
}
