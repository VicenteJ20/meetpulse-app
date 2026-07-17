export type TranscriptionLanguageMode = 'auto' | 'es' | 'en';

export const TRANSCRIPTION_LANGUAGE_MODES: readonly TranscriptionLanguageMode[] = [
  'auto',
  'es',
  'en',
];

export function normalizeTranscriptionLanguageMode(
  value: string | null | undefined
): TranscriptionLanguageMode {
  return TRANSCRIPTION_LANGUAGE_MODES.includes(value as TranscriptionLanguageMode)
    ? (value as TranscriptionLanguageMode)
    : 'auto';
}
