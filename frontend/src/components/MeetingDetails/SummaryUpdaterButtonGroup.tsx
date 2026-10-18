"use client";

import { desktopCapabilities } from '@/config/capabilities';
import { Button } from '@/components/ui/button';
import { Loader2, Save, BookOpen, RotateCcw } from 'lucide-react';
import Analytics from '@/lib/analytics';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import type { WikiPublishUiStatus } from '@/hooks/meeting-details/useWikiPublish';

interface SummaryUpdaterButtonGroupProps {
  isSaving: boolean;
  isDirty: boolean;
  onSave: () => Promise<void>;
  onCopy: () => Promise<void>;
  onFind?: () => void;
  onOpenFolder: () => Promise<void>;
  hasSummary: boolean;
  wikiStatus: WikiPublishUiStatus;
  onRetryWiki: () => Promise<void> | void;
  onOpenWiki: () => void;
}

// Guardar aparece resaltado solo cuando hay cambios; copiar vive ahora en el menú Exportar.
export function SummaryUpdaterButtonGroup({
  isSaving,
  isDirty,
  onSave,
  hasSummary,
  wikiStatus,
  onRetryWiki,
  onOpenWiki,
}: SummaryUpdaterButtonGroupProps) {
  const { t } = useTranslation();
  const wikiPublished = ['published', 'curating', 'curated', 'conflict', 'diverged'].includes(wikiStatus);
  return (
    <div className="flex items-center gap-1.5">
      {(isDirty || isSaving) && (
        <Button
          size="sm"
          variant={isDirty ? 'default' : 'ghost'}
          title={isSaving ? t('meeting.saving') : t('common.save')}
          onClick={() => {
            Analytics.trackButtonClick('save_changes', 'meeting_details');
            onSave();
          }}
          disabled={isSaving}
        >
          {isSaving ? <Loader2 className="animate-spin" /> : <Save />}
          {isSaving ? t('meeting.saving') : t('common.save')}
        </Button>
      )}

      {desktopCapabilities.wikiEnabled && wikiStatus === 'error' && (
        <Button variant="ghost" size="sm" title={t('meeting.wikiRetry')} onClick={onRetryWiki} disabled={!hasSummary}>
          <RotateCcw />
          {t('meeting.wikiRetry')}
        </Button>
      )}
      {desktopCapabilities.wikiEnabled && wikiPublished && (
        <Button variant="ghost" size="sm" title={t('meeting.wikiOpen')} onClick={onOpenWiki}>
          <BookOpen />
          {t('meeting.wikiOpen')}
        </Button>
      )}
      {desktopCapabilities.wikiEnabled && wikiStatus === 'publishing' && (
        <Button variant="ghost" size="sm" disabled>
          <Loader2 className="animate-spin" />
          {t('meeting.wikiStatus.publishing')}
        </Button>
      )}
    </div>
  );
}
