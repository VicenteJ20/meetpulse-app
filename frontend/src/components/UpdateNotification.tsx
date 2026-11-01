import React from 'react';
import { Download, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { TranslationKey } from '@/i18n/catalogs';
import { UpdateInfo } from '@/services/updateService';

let globalShowDialogCallback: (() => void) | null = null;

export function setUpdateDialogCallback(callback: () => void) {
  globalShowDialogCallback = callback;
}

type Translate = (key: TranslationKey) => string;

// Aviso discreto de una versión nueva, con el mismo estilo de los menús de MeetPulse.
export function showUpdateNotification(updateInfo: UpdateInfo, t: Translate, onUpdateClick?: () => void) {
  const handleClick = () => {
    if (onUpdateClick) {
      onUpdateClick();
    } else if (globalShowDialogCallback) {
      globalShowDialogCallback();
    }
  };

  toast.custom(
    (id) => (
      <div
        role="status"
        className="flex w-[24rem] max-w-[calc(100vw-2rem)] items-center gap-3 rounded-[10px] border border-border bg-popover p-3 text-popover-foreground shadow-[0_16px_40px_-12px_rgb(20_30_60_/_0.24)]"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
          <Download className="size-[18px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-5">{t('upd.toastTitle')}</p>
          <p className="text-xs leading-5 text-muted-foreground">{t('upd.toastBody').replace('{v}', updateInfo.version ?? '')}</p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            toast.dismiss(id);
            handleClick();
          }}
        >
          {t('upd.toastAction')}
        </Button>
        <button
          type="button"
          aria-label={t('upd.toastDismiss')}
          onClick={() => toast.dismiss(id)}
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
    ),
    {
      duration: 10000,
      position: 'bottom-center',
      // La tarjeta ya trae su propio estilo: se anula el del contenedor de sonner.
      classNames: { toast: '!w-auto !border-0 !bg-transparent !p-0 !shadow-none' },
    }
  );
}
