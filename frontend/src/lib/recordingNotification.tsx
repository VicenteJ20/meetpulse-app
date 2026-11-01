import { useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { Checkbox } from '@/components/ui/checkbox';

export async function showRecordingNotification(): Promise<void> {
  try {
    const { Store } = await import('@tauri-apps/plugin-store');
    const store = await Store.load('preferences.json');
    const showNotification = await store.get<boolean>('show_recording_notification') ?? true;

    if (showNotification) {
      // Es un aviso de consentimiento: se queda hasta que la persona lo confirme o lo cierre.
      toast.custom(toastId => <RecordingConsentToast toastId={toastId} />, {
        duration: Infinity,
        position: 'bottom-center',
        // La tarjeta ya trae su propio estilo: se anula el del contenedor de sonner.
        classNames: { toast: '!w-auto !border-0 !bg-transparent !p-0 !shadow-none' },
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
    toast.dismiss(toastId);
  };

  return (
    <div
      role="status"
      className="w-[min(25rem,calc(100vw-2rem))] rounded-[10px] border border-border bg-popover p-3 text-popover-foreground shadow-[0_16px_40px_-12px_rgb(20_30_60_/_0.24)]"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-recording/10" aria-hidden>
          <span className="size-2.5 animate-rec-pulse rounded-full bg-recording" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-5">{t('recording.notice.title')}</p>
          <p className="text-xs leading-5 text-muted-foreground">{t('recording.notice.description')}</p>
        </div>
        <button
          type="button"
          onClick={() => toast.dismiss(toastId)}
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t('common.close')}
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 pl-11">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={dontShowAgain}
            onCheckedChange={checked => setDontShowAgain(checked === true)}
          />
          <span className="select-none">{t('recording.notice.dontShowAgain')}</span>
        </label>
        <Button size="sm" onClick={() => void acknowledge()}>
          <ShieldCheck />
          {t('recording.notice.acknowledge')}
        </Button>
      </div>
    </div>
  );
}
