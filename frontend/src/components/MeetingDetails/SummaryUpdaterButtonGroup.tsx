"use client";

import { Button } from '@/components/ui/button';
import { Loader2, Save } from 'lucide-react';
import Analytics from '@/lib/analytics';
import { useTranslation } from '@/contexts/UiPreferencesContext';

interface SummaryUpdaterButtonGroupProps {
  isSaving: boolean;
  isDirty: boolean;
  onSave: () => Promise<void>;
  onCopy: () => Promise<void>;
  onFind?: () => void;
  onOpenFolder: () => Promise<void>;
  hasSummary: boolean;
}

// Guardar aparece resaltado solo cuando hay cambios; copiar vive ahora en el menú Exportar.
export function SummaryUpdaterButtonGroup({
  isSaving,
  isDirty,
  onSave,
}: SummaryUpdaterButtonGroupProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1.5">
      {(isDirty || isSaving) && (
        <Button
          size="sm"
          variant={isDirty ? 'default' : 'ghost'}
          title={isSaving ? t('meeting.saving') : t('common.save')}
          onClick={() => {
            void Analytics.track('summary_saved');
            onSave();
          }}
          disabled={isSaving}
        >
          {isSaving ? <Loader2 className="animate-spin" /> : <Save />}
          {isSaving ? t('meeting.saving') : t('common.save')}
        </Button>
      )}
    </div>
  );
}
