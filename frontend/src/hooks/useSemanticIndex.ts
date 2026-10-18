'use client';

import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export type SearchStatus = {
  ready: boolean;
  downloading: boolean;
  paused: boolean;
  downloaded: number;
  totalBytes: number;
  indexing: boolean;
  indexed: number;
  total: number;
  missingMeetings: number;
  error?: string;
};

// Estado y acciones del índice semántico local (descarga del modelo e indexado de reuniones).
export function useSemanticIndex() {
  const [status, setStatus] = useState<SearchStatus>();
  const [error, setError] = useState('');

  const poll = useCallback(async () => {
    try {
      setStatus(await invoke<SearchStatus>('desktop_search_status'));
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void poll();
    const timer = setInterval(() => void poll(), 4000);
    return () => clearInterval(timer);
  }, [poll]);

  const run = useCallback(async (command: 'desktop_search_download' | 'desktop_search_index', args: Record<string, unknown>) => {
    try {
      setError('');
      await invoke(command, args);
      await poll();
    } catch (e) {
      setError(String(e));
    }
  }, [poll]);

  return {
    status,
    error: error || status?.error || '',
    download: (action: 'start' | 'pause' | 'cancel') => run('desktop_search_download', { action }),
    index: (cancel: boolean) => run('desktop_search_index', { cancel }),
  };
}
