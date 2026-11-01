'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useSemanticIndex } from '@/hooks/useSemanticIndex';

export type EngineStatus = 'checking' | 'waiting' | 'downloading' | 'ready' | 'error';

export interface EngineState {
  status: EngineStatus;
  /** 0 a 100. */
  percent: number;
  totalMb: number;
  error?: string;
}

// Estado de los dos modelos locales que necesita MeetPulse (transcripción y búsqueda semántica).
// Con `autoStart` también inicia las descargas que falten, una sola vez.
export function useLocalEngines({ autoStart }: { autoStart: boolean }) {
  const { parakeetDownloaded, parakeetProgressInfo, parakeetError, setParakeetDownloaded, startBackgroundDownloads, retryParakeetDownload } = useOnboarding();
  const semantic = useSemanticIndex();
  const [parakeetChecked, setParakeetChecked] = useState(false);
  const startedParakeet = useRef(false);
  const startedSearch = useRef(false);

  useEffect(() => {
    if (!autoStart || startedParakeet.current) return;
    startedParakeet.current = true;
    (async () => {
      try {
        await invoke('parakeet_init');
        const ready = await invoke<boolean>('parakeet_has_available_models');
        if (ready) {
          setParakeetDownloaded(true);
        } else {
          await startBackgroundDownloads({ includeParakeet: true, includeSummary: false });
        }
      } catch (error) {
        console.error('[Onboarding] Could not prepare the transcription engine:', error);
      } finally {
        setParakeetChecked(true);
      }
    })();
  }, [autoStart, setParakeetDownloaded, startBackgroundDownloads]);

  const searchStatus = semantic.status;
  const startSearch = semantic.download;
  useEffect(() => {
    if (!autoStart || startedSearch.current || !searchStatus) return;
    if (searchStatus.ready || searchStatus.downloading) {
      startedSearch.current = true;
      return;
    }
    startedSearch.current = true;
    startSearch('start');
  }, [autoStart, searchStatus, startSearch]);

  let parakeet: EngineState;
  if (parakeetDownloaded) {
    parakeet = { status: 'ready', percent: 100, totalMb: parakeetProgressInfo.totalMb };
  } else if (parakeetError) {
    parakeet = { status: 'error', percent: parakeetProgressInfo.percent, totalMb: parakeetProgressInfo.totalMb, error: parakeetError };
  } else if (parakeetProgressInfo.percent > 0 || parakeetChecked) {
    parakeet = { status: 'downloading', percent: Math.round(parakeetProgressInfo.percent), totalMb: parakeetProgressInfo.totalMb };
  } else {
    parakeet = { status: 'checking', percent: 0, totalMb: 0 };
  }

  let search: EngineState;
  if (!searchStatus) {
    search = { status: semantic.error ? 'waiting' : 'checking', percent: 0, totalMb: 0 };
  } else if (searchStatus.ready) {
    search = { status: 'ready', percent: 100, totalMb: Math.round(searchStatus.totalBytes / 1_048_576) };
  } else if (semantic.error) {
    search = { status: 'error', percent: 0, totalMb: Math.round(searchStatus.totalBytes / 1_048_576), error: semantic.error };
  } else if (searchStatus.downloading || searchStatus.downloaded > 0) {
    const percent = searchStatus.totalBytes > 0 ? Math.min(99, Math.round((searchStatus.downloaded / searchStatus.totalBytes) * 100)) : 0;
    search = { status: 'downloading', percent, totalMb: Math.round(searchStatus.totalBytes / 1_048_576) };
  } else {
    search = { status: 'waiting', percent: 0, totalMb: Math.round(searchStatus.totalBytes / 1_048_576) };
  }

  const retryParakeet = useCallback(() => {
    void retryParakeetDownload().catch(() => undefined);
  }, [retryParakeetDownload]);
  const retrySearch = useCallback(() => {
    semantic.download('start');
  }, [semantic]);

  const allReady = parakeet.status === 'ready' && search.status === 'ready';
  const progress = Math.round((parakeet.percent + search.percent) / 2);

  return { parakeet, search, allReady, progress, retryParakeet, retrySearch };
}
