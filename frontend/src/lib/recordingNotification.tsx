import { useState } from 'react';
import { Radio, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import Analytics from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/contexts/UiPreferencesContext';

export async function showRecordingNotification(): Promise<void> {
  try {
    const { Store } = await import('@tauri-apps/plugin-store');
    const store = await Store.load('preferences.json');
    const showNotification = await store.get<boolean>('show_recording_notification') ?? true;

    if (showNotification) {
      toast.custom(toastId => <RecordingConsentToast toastId={toastId} />, {
        duration: 10000,
        position: 'bottom-center',
      });
    }
  } catch (notificationError) {
    console.error('Failed to show recording notification:', notificationError);
  }
}

function RecordingConsentToast({ toastId }: { toastId: string | number }) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const { t } = useTranslation();

  const acknowledge = async () => {
    if (dontShowAgain) {
      const { Store } = await import('@tauri-apps/plugin-store');
      const store = await Store.load('preferences.json');
      await store.set('show_recording_notification', false);
      await store.save();
    }
    Analytics.trackButtonClick('recording_notification_acknowledged', 'toast');
    toast.dismiss(toastId);
  };

  return (
    <div className="w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-border bg-popover p-4 text-popover-foreground shadow-xl">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-recording/12 text-recording">
          <Radio className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{t('recording.notice.title')}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('recording.notice.description')}</p>
            </div>
            <button
              type="button"
              onClick={() => toast.dismiss(toastId)}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={t('common.close')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={event => setDontShowAgain(event.target.checked)}
              className="h-4 w-4 rounded border-input accent-[hsl(var(--brand))]"
            />
            <span className="select-none">{t('recording.notice.dontShowAgain')}</span>
          </label>
          <Button size="sm" onClick={() => void acknowledge()} className="mt-3 w-full">
            <ShieldCheck className="h-4 w-4" />
            {t('recording.notice.acknowledge')}
          </Button>
        </div>
      </div>
    </div>
  );
}
