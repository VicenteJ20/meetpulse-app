import React, { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Check, Loader2, Mic } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { OnboardingContainer } from '../OnboardingContainer';
import { useOnboarding } from '@/contexts/OnboardingContext';

const PARAKEET_MODEL = 'parakeet-tdt-0.6b-v3-int8';

type DownloadStatus = 'waiting' | 'downloading' | 'completed' | 'error';

interface DownloadState {
  status: DownloadStatus;
  progress: number;
  downloadedMb: number;
  totalMb: number;
  speedMbps: number;
  error?: string;
}

export function DownloadProgressStep({ onComplete }: { onComplete: () => void }) {
  const { goNext, parakeetDownloaded, setParakeetDownloaded, startBackgroundDownloads, completeOnboarding } = useOnboarding();
  const [isMac, setIsMac] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const started = useRef(false);
  const [download, setDownload] = useState<DownloadState>({
    status: parakeetDownloaded ? 'completed' : 'waiting', progress: parakeetDownloaded ? 100 : 0,
    downloadedMb: 0, totalMb: 670, speedMbps: 0,
  });

  useEffect(() => {
    import('@tauri-apps/plugin-os').then(({ platform }) => setIsMac(platform() === 'macos'))
      .catch(() => setIsMac(navigator.userAgent.includes('Mac')));
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!parakeetDownloaded) setDownload(prev => ({ ...prev, status: 'downloading' }));
    startBackgroundDownloads({ includeParakeet: true, includeSummary: false }).catch(error => {
      setDownload(prev => ({ ...prev, status: 'error', error: String(error) }));
    });
  }, [parakeetDownloaded, startBackgroundDownloads]);

  useEffect(() => {
    const progress = listen<{ modelName: string; progress: number; downloaded_mb?: number; total_mb?: number; speed_mbps?: number; status?: string }>(
      'parakeet-model-download-progress', event => {
        if (event.payload.modelName !== PARAKEET_MODEL) return;
        const { progress, downloaded_mb, total_mb, speed_mbps, status } = event.payload;
        setDownload(prev => ({ ...prev, status: status === 'completed' ? 'completed' : 'downloading', progress, downloadedMb: downloaded_mb ?? prev.downloadedMb, totalMb: total_mb ?? prev.totalMb, speedMbps: speed_mbps ?? prev.speedMbps }));
        if (status === 'completed' || progress >= 100) setParakeetDownloaded(true);
      });
    const complete = listen<{ modelName: string }>('parakeet-model-download-complete', event => {
      if (event.payload.modelName === PARAKEET_MODEL) {
        setDownload(prev => ({ ...prev, status: 'completed', progress: 100 }));
        setParakeetDownloaded(true);
      }
    });
    const error = listen<{ modelName: string; error: string }>('parakeet-model-download-error', event => {
      if (event.payload.modelName === PARAKEET_MODEL) setDownload(prev => ({ ...prev, status: 'error', error: event.payload.error }));
    });
    return () => { progress.then(fn => fn()); complete.then(fn => fn()); error.then(fn => fn()); };
  }, [setParakeetDownloaded]);

  const retry = async () => {
    setDownload(prev => ({ ...prev, status: 'downloading', error: undefined, progress: 0, downloadedMb: 0 }));
    try { await invoke('parakeet_retry_download', { modelName: PARAKEET_MODEL }); }
    catch (error) { setDownload(prev => ({ ...prev, status: 'error', error: String(error) })); }
  };

  const continueSetup = async () => {
    try {
      const ready = await invoke<boolean>('parakeet_has_available_models');
      if (!ready) {
        toast.error('Transcription engine required', { description: 'Please finish or retry the download before continuing.' });
        return;
      }
      setParakeetDownloaded(true);
      if (isMac) { goNext(); return; }
      setIsCompleting(true);
      await completeOnboarding();
      onComplete();
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
      toast.error('Failed to complete setup', { description: 'Please try again.' });
      setIsCompleting(false);
    }
  };

  return <OnboardingContainer title="Getting things ready" description="Download the transcription engine to start recording." step={3} totalSteps={isMac ? 4 : 3}>
    <div className="flex flex-col items-center space-y-6">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted"><Mic className="h-5 w-5 text-muted-foreground" /></div><div><h3 className="font-medium text-foreground">Transcription Engine</h3><p className="text-sm text-muted-foreground">~670 MB</p></div></div>{download.status === 'downloading' && <Loader2 className="h-5 w-5 animate-spin" />}{download.status === 'completed' && <Check className="h-5 w-5 text-success" />}</div>
        {(download.status === 'downloading' || download.status === 'completed') && <><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-gray-900 transition-all" style={{ width: `${download.progress}%` }} /></div><div className="mt-2 flex justify-between text-sm text-muted-foreground"><span>{download.downloadedMb.toFixed(1)} / {download.totalMb.toFixed(1)} MB</span><span>{Math.round(download.progress)}%</span></div></>}
        {download.status === 'error' && <div className="rounded-md border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"><p>{download.error || 'Download failed.'}</p><Button className="mt-3" size="sm" onClick={retry}>Try again</Button></div>}
      </div>
      <p className="max-w-lg text-center text-sm text-muted-foreground">Local AI summaries are optional and can be configured later in Settings.</p>
      <Button onClick={continueSetup} disabled={!parakeetDownloaded || isCompleting} className="w-full max-w-xs bg-gray-900 hover:bg-gray-800">{isCompleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Continue</Button>
    </div>
  </OnboardingContainer>;
}
