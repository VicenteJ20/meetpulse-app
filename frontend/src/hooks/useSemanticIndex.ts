'use client';

import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Analytics from '@/lib/analytics';

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
      void Analytics.track('semantic_search_action', {
        step: command === 'desktop_search_download' ? 'download' : 'index',
        action: String(args.action ?? (args.cancel ? 'cancel' : 'start')),
        success: 'true',
      });
    } catch (e) {
      setError(String(e));
      void Analytics.track('semantic_search_action', {
        step: command === 'desktop_search_download' ? 'download' : 'index',
        action: String(args.action ?? (args.cancel ? 'cancel' : 'start')),
        success: 'false',
      });
    }
  }, [poll]);

  return {
    status,
    error: error || status?.error || '',
    download: (action: 'start' | 'pause' | 'cancel') => run('desktop_search_download', { action }),
    index: (cancel: boolean) => run('desktop_search_index', { cancel }),
  };
}
