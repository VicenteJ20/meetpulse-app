/** Gateway models allowed for transcription. MAI-Transcribe-2 is always first and the default. */
export const GATEWAY_TRANSCRIPTION_MODELS = [
  { id: 'microsoft/mai-transcribe-2', label: 'MAI-Transcribe-2' },
  { id: 'google/gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' },
  { id: 'google/gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
] as const;

export const DEFAULT_GATEWAY_TRANSCRIPTION_MODEL = GATEWAY_TRANSCRIPTION_MODELS[0].id;

function bareId(id: string): string {
  return id.trim().replace(/^models\//i, '');
}

/** Exact allowlist match. Preview, image, TTS, and streaming ids return null. */
export function canonicalGatewayTranscriptionModel(id: string | null | undefined): string | null {
  if (!id) return null;
  const bare = bareId(id).toLowerCase();
  const match = GATEWAY_TRANSCRIPTION_MODELS.find((model) => model.id === bare);
  return match ? match.id : null;
}

export function isGatewayTranscriptionModel(id: string | null | undefined): boolean {
  return canonicalGatewayTranscriptionModel(id) !== null;
}

/** Returns the saved id when it is allowlisted. Anything else becomes MAI-Transcribe-2. */
export function gatewayTranscriptionModel(id: string | null | undefined): string {
  return canonicalGatewayTranscriptionModel(id) ?? DEFAULT_GATEWAY_TRANSCRIPTION_MODEL;
}

export function gatewayTranscriptionChoices(
  catalog: { id: string; name?: string | null; label?: string | null }[] = [],
): { id: string; label: string }[] {
  return GATEWAY_TRANSCRIPTION_MODELS.map((model) => {
    const live = catalog.find((item) => canonicalGatewayTranscriptionModel(item.id) === model.id);
    const liveLabel = live?.name?.trim() || live?.label?.trim();
    return { id: model.id, label: liveLabel || model.label };
  });
}
