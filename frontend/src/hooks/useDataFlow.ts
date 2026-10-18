'use client';

import { useMemo } from 'react';
import { useConfig } from '@/contexts/ConfigContext';

const PROVIDER_NAMES: Record<string, string> = {
  gemini: 'Google',
  claude: 'Anthropic',
  groq: 'Groq',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  deepgram: 'Deepgram',
  elevenLabs: 'ElevenLabs',
};

const LOCAL_TRANSCRIPTION = new Set(['localWhisper', 'parakeet']);
const LOCAL_ANALYSIS = new Set(['ollama', 'builtin-ai']);

export interface DataFlow {
  /** Proveedor al que sale el audio, o null si se transcribe en este equipo. */
  audioTo: string | null;
  /** Proveedor al que sale el texto de la reunión, o null si se analiza en este equipo. */
  textTo: string | null;
  isLocal: boolean;
  transcriptionName: string;
  analysisName: string;
}

// Deriva a dónde viajan los datos según los motores configurados (ConfigContext).
export function useDataFlow(): DataFlow {
  const { modelConfig, transcriptModelConfig } = useConfig();
  return useMemo(() => {
    const tp = transcriptModelConfig?.provider;
    const ap = modelConfig?.provider;
    const audioTo = tp && !LOCAL_TRANSCRIPTION.has(tp) ? PROVIDER_NAMES[tp] ?? tp : null;
    const textTo = ap && !LOCAL_ANALYSIS.has(ap) ? (ap === 'custom-openai' ? 'custom' : PROVIDER_NAMES[ap] ?? ap) : null;
    return {
      audioTo,
      textTo,
      isLocal: !audioTo && !textTo,
      transcriptionName: transcriptModelConfig?.model ?? '',
      analysisName: modelConfig?.model ?? '',
    };
  }, [modelConfig, transcriptModelConfig]);
}
