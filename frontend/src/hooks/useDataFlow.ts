'use client';

import { useMemo } from 'react';
import { useConfig } from '@/contexts/ConfigContext';

const PROVIDER_NAMES: Record<string, string> = {
  'vercel-gateway': 'Vercel AI Gateway',
};

const LOCAL_TRANSCRIPTION = new Set(['localWhisper', 'parakeet']);
const LOCAL_ANALYSIS = new Set(['builtin-ai']);

export interface DataFlow {
  /** Proveedor al que sale el audio, o null si se transcribe en este equipo. */
  audioTo: string | null;
  /** Proveedor al que sale el texto de la reunión, o null si se analiza en este equipo. */
  textTo: string | null;
  /** Proveedor al que sale el chat y el coach, o null si se quedan en este equipo. */
  chatTo: string | null;
  isLocal: boolean;
  transcriptionName: string;
  analysisName: string;
}

// Deriva a dónde viajan los datos según los motores configurados (ConfigContext).
export function useDataFlow(): DataFlow {
  const { modelConfig, transcriptModelConfig, chatModelConfig } = useConfig();
  return useMemo(() => {
    const tp = transcriptModelConfig?.provider;
    const ap = modelConfig?.provider;
    const cp = chatModelConfig?.provider;
    const audioTo = tp && !LOCAL_TRANSCRIPTION.has(tp) ? PROVIDER_NAMES[tp] ?? tp : null;
    const textTo = ap && !LOCAL_ANALYSIS.has(ap) ? (PROVIDER_NAMES[ap] ?? ap) : null;
    const chatTo = cp && !LOCAL_ANALYSIS.has(cp) ? (PROVIDER_NAMES[cp] ?? cp) : null;
    return {
      audioTo,
      textTo,
      chatTo,
      isLocal: !audioTo && !textTo && !chatTo,
      transcriptionName: transcriptModelConfig?.model ?? '',
      analysisName: modelConfig?.model ?? '',
    };
  }, [modelConfig, transcriptModelConfig, chatModelConfig]);
}
