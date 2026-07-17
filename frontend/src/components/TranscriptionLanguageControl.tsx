'use client';

import { Globe2 } from 'lucide-react';
import { toast } from 'sonner';
import { useConfig } from '@/contexts/ConfigContext';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import {
  normalizeTranscriptionLanguageMode,
  TRANSCRIPTION_LANGUAGE_MODES,
  type TranscriptionLanguageMode,
} from '@/constants/transcriptionLanguages';
import { cn } from '@/lib/utils';

export function TranscriptionLanguageControl({
  isRecording = false,
  compact = false,
  className,
}: {
  isRecording?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const { selectedLanguage, setSelectedLanguage, transcriptModelConfig } = useConfig();
  const { t } = useTranslation();
  const selectedMode = normalizeTranscriptionLanguageMode(selectedLanguage);
  const isParakeet = transcriptModelConfig.provider === 'parakeet';

  const selectMode = (mode: TranscriptionLanguageMode) => {
    if (isParakeet || mode === selectedMode) return;
    setSelectedLanguage(mode);
    if (isRecording) {
      toast.success(t('recording.languageUpdated'), {
        description: t(`recording.language.${mode}`),
      });
    }
  };

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {!compact && (
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Globe2 className="h-3.5 w-3.5" />
          <span>{t('recording.transcriptionLanguage')}</span>
        </div>
      )}
      <div
        className="inline-flex items-center rounded-xl border border-border bg-muted/70 p-1"
        role="group"
        aria-label={t('recording.transcriptionLanguage')}
      >
        {TRANSCRIPTION_LANGUAGE_MODES.map(mode => {
          const active = isParakeet ? mode === 'auto' : mode === selectedMode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => selectMode(mode)}
              disabled={isParakeet}
              aria-pressed={active}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                active
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
                isParakeet && mode !== 'auto' && 'opacity-45'
              )}
            >
              {t(`recording.language.${mode}`)}
            </button>
          );
        })}
      </div>
      {!compact && isParakeet && (
        <p className="text-xs text-muted-foreground">{t('recording.language.parakeetAuto')}</p>
      )}
      {!compact && !isParakeet && (
        <p className="text-xs text-muted-foreground">{t('recording.language.hint')}</p>
      )}
    </div>
  );
}
