"use client";

import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Copy, Save, Loader2, BookOpen, RotateCcw } from 'lucide-react';
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

export function SummaryUpdaterButtonGroup({
  isSaving,
  isDirty,
  onSave,
  onCopy,
  hasSummary,
  wikiStatus,
  onRetryWiki,
  onOpenWiki
}: SummaryUpdaterButtonGroupProps) {
  const { t } = useTranslation();
  const wikiPublished = ['published', 'curating', 'curated', 'conflict', 'diverged'].includes(wikiStatus);
  return (
    <ButtonGroup>
      {/* Save button */}
      <Button
        variant="outline"
        size="sm"
        className={isDirty ? 'border-brand/40 bg-brand/10' : ''}
        title={isSaving ? "Saving" : "Save Changes"}
        onClick={() => {
          Analytics.trackButtonClick('save_changes', 'meeting_details');
          onSave();
        }}
        disabled={isSaving}
      >
        {isSaving ? (
          <>
            <Loader2 className="animate-spin" />
            <span className="hidden lg:inline">Saving...</span>
          </>
        ) : (
          <>
            <Save />
            <span className="hidden lg:inline">Save</span>
          </>
        )}
      </Button>

      {wikiStatus === 'error' && (
        <Button variant="outline" size="sm" title={t('meeting.wikiRetry')} onClick={onRetryWiki} disabled={!hasSummary} className="cursor-pointer">
          <RotateCcw />
          <span className="hidden lg:inline">{t('meeting.wikiRetry')}</span>
        </Button>
      )}
      {wikiPublished && (
        <Button variant="outline" size="sm" title={t('meeting.wikiOpen')} onClick={onOpenWiki} className="cursor-pointer">
          <BookOpen />
          <span className="hidden lg:inline">{t('meeting.wikiOpen')}</span>
        </Button>
      )}
      {wikiStatus === 'publishing' && (
        <Button variant="outline" size="sm" disabled className="cursor-pointer">
          <Loader2 className="animate-spin" />
          <span className="hidden lg:inline">{t('meeting.wikiStatus.publishing')}</span>
        </Button>
      )}

      {/* Copy button */}
      <Button
        variant="outline"
        size="sm"
        title="Copy Summary"
        onClick={() => {
          Analytics.trackButtonClick('copy_summary', 'meeting_details');
          onCopy();
        }}
        disabled={!hasSummary}
        className="cursor-pointer"
      >
        <Copy />
        <span className="hidden lg:inline">Copy</span>
      </Button>

      {/* Find button */}
      {/* {onFind && (
        <Button
          variant="outline"
          size="sm"
          title="Find in Summary"
          onClick={() => {
            Analytics.trackButtonClick('find_in_summary', 'meeting_details');
            onFind();
          }}
          disabled={!hasSummary}
          className="cursor-pointer"
        >
          <Search />
          <span className="hidden lg:inline">Find</span>
        </Button>
      )} */}
    </ButtonGroup>
  );
}
