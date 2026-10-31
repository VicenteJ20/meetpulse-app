'use client';

import React from 'react';
import { Check, ShieldCheck, X } from 'lucide-react';
import { APP_VERSION } from '@/config/app';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface AnalyticsDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** When provided the dialog asks for confirmation before turning analytics off. */
  onConfirmDisable?: () => void;
}

const SHARED_GROUPS = ['models', 'meetings', 'devices', 'usage', 'platform'] as const;

const EXAMPLE_EVENT = {
  event: 'meeting_ended',
  app_version: APP_VERSION,
  transcription_provider: 'parakeet',
  summary_provider: 'ollama',
  active_duration_seconds: '1520.4',
  microphone_device_type: 'Wired',
  system_audio_device_type: 'Bluetooth',
  chunks_processed: '150',
  had_fatal_error: 'false',
};

export default function AnalyticsDataModal({ isOpen, onClose, onConfirmDisable }: AnalyticsDataModalProps) {
  const { t } = useTranslation();
  const lines = (key: string) => t(key as Parameters<typeof t>[0]).split('\n');

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[88vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-brand" />
            {t('mx.data.title')}
          </DialogTitle>
          <DialogDescription>{t('mx.data.intro')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {SHARED_GROUPS.map(group => (
            <section key={group} className="rounded-xl border border-border bg-card p-4">
              <h4 className="text-sm font-semibold">{t(`mx.data.${group}` as Parameters<typeof t>[0])}</h4>
              <ul className="mt-2 space-y-1">
                {lines(`mx.data.${group}Items`).map(item => (
                  <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-brand" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <section className="rounded-xl border border-border bg-muted/40 p-4">
            <h4 className="text-sm font-semibold">{t('mx.data.never')}</h4>
            <ul className="mt-2 space-y-1">
              {lines('mx.data.neverItems').map(item => (
                <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <X className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h4 className="text-sm font-semibold">{t('mx.data.example')}</h4>
            <pre className="mt-2 overflow-x-auto rounded-xl border border-border bg-muted/40 p-3 font-mono text-xs">
              {JSON.stringify(EXAMPLE_EVENT, null, 2)}
            </pre>
          </section>
        </div>

        <DialogFooter>
          {onConfirmDisable ? (
            <>
              <Button variant="outline" onClick={onClose}>{t('mx.data.keep')}</Button>
              <Button variant="destructive" onClick={onConfirmDisable}>{t('mx.data.disable')}</Button>
            </>
          ) : (
            <Button variant="outline" onClick={onClose}>{t('mx.data.close')}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
