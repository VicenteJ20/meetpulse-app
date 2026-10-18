'use client';

import { useState } from 'react';
import { Pin, Plus, X } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { LanguagePickerPopover } from '@/components/LanguagePickerPopover';
import { SettingsSection } from '@/components/ui/settings';
import { useRecentLanguages } from '@/hooks/useRecentLanguages';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { labelForCode } from '@/lib/summary-languages';
import { cn } from '@/lib/utils';

export function SummaryLanguageSettings() {
  const { t } = useTranslation();
  const { recents, pinned, addRecent, removeRecent, setPinned } = useRecentLanguages();
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <SettingsSection title={t('sx.summaryLang')} description={t('sx.summaryLangDesc')}>
      <div className="flex flex-wrap items-center gap-2">
        {recents.map((code) => {
          const isPinned = pinned === code;
          const lang = labelForCode(code);
          return (
            <span
              key={code}
              className={cn(
                'inline-flex h-8 items-center overflow-hidden rounded-full border text-sm',
                isPinned ? 'border-brand/40 bg-accent text-accent-foreground' : 'border-border bg-card text-foreground',
              )}
            >
              <button
                type="button"
                aria-label={(isPinned ? t('sx.unpin') : t('sx.pin')).replace('{lang}', lang)}
                aria-pressed={isPinned}
                onClick={() => setPinned(isPinned ? null : code)}
                className="flex h-full items-center gap-1.5 pl-3 pr-2 transition-colors hover:bg-muted/60"
              >
                <Pin className={cn('size-3.5', isPinned ? 'text-brand' : 'text-muted-foreground')} fill={isPinned ? 'currentColor' : 'none'} />
                {lang}
              </button>
              <button
                type="button"
                aria-label={t('sx.remove').replace('{lang}', lang)}
                onClick={() => removeRecent(code)}
                className="flex h-full items-center pl-0.5 pr-2.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </span>
          );
        })}

        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={recents.length >= 5}
              className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-border px-3 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="size-3.5" />
              {t('sx.addLanguage')}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto border-0 bg-transparent p-0 shadow-none">
            <LanguagePickerPopover
              mode="settings"
              value={null}
              onChange={(code) => {
                if (code) addRecent(code);
                setPickerOpen(false);
              }}
              onClose={() => setPickerOpen(false)}
            />
          </PopoverContent>
        </Popover>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {pinned ? t('sx.langHintPinned').replace('{lang}', labelForCode(pinned)) : t('sx.langHint')}
      </p>
    </SettingsSection>
  );
}
