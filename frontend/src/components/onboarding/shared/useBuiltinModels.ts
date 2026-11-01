'use client';

import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface BuiltinModel {
  name: string;
  displayName: string;
  available: boolean;
  sizeMb: number;
  /** 0 a 100 mientras se descarga. */
  percent: number;
  downloading: boolean;
}

interface RawModel {
  name: string;
  display_name?: string;
  size_mb?: number;
  lifecycle?: string;
  status?: { type: string };
}

// Modelos de lenguaje locales (integrados): lista, recomendado y descarga con progreso.
export function useBuiltinModels() {
  const [models, setModels] = useState<BuiltinModel[]>([]);
  const [recommended, setRecommended] = useState('');

  const refresh = useCallback(async () => {
    try {
      const raw = await invoke<RawModel[]>('builtin_ai_list_models');
      setModels((previous) =>
        raw
          .filter((item) => !item.lifecycle || item.lifecycle === 'current')
          .map((item) => {
            const before = previous.find((model) => model.name === item.name);
            const available = item.status?.type === 'available';
            return {
              name: item.name,
              displayName: item.display_name || item.name,
              available,
              sizeMb: item.size_mb ?? 0,
              percent: available ? 100 : before?.percent ?? 0,
              downloading: available ? false : before?.downloading ?? item.status?.type === 'downloading',
            };
          }),
      );
    } catch (error) {
      console.error('[Onboarding] Could not list the built-in models:', error);
    }
  }, []);

  useEffect(() => {
    void refresh();
    invoke<string>('builtin_ai_get_recommended_model').then(setRecommended).catch(() => undefined);
  }, [refresh]);

  useEffect(() => {
    const unlisten = listen<{ model: string; progress: number; status?: string }>('builtin-ai-download-progress', (event) => {
      const { model, progress, status } = event.payload;
      setModels((previous) =>
        previous.map((item) =>
          item.name === model
            ? { ...item, percent: Math.round(progress), downloading: status !== 'completed' && progress < 100, available: status === 'completed' || progress >= 100 }
            : item,
        ),
      );
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  const download = useCallback(async (name: string) => {
    setModels((previous) => previous.map((item) => (item.name === name ? { ...item, downloading: true } : item)));
    try {
      await invoke('builtin_ai_download_model', { modelName: name });
    } catch (error) {
      console.error('[Onboarding] Could not start the model download:', error);
      setModels((previous) => previous.map((item) => (item.name === name ? { ...item, downloading: false } : item)));
    }
  }, []);

  return { models, recommended, download, refresh };
}
