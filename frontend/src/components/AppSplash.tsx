'use client';

import { ShieldCheck } from 'lucide-react';
import { useTranslation } from '@/contexts/UiPreferencesContext';

// Pantalla de inicio mientras se resuelve el estado de la app (evita el parpadeo antes del onboarding).
export function AppSplash() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-live="polite" className="flex h-screen flex-col items-center justify-center gap-5 bg-background">
      <img src="/icon.png" alt="" className="size-14 rounded-2xl" />
      <div className="h-1 w-40 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/3 animate-[splash_1.2s_ease-in-out_infinite] rounded-full bg-brand" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium">{t('loading.starting')}</p>
        <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 text-success" />
          {t('loading.local')}
        </p>
      </div>
    </div>
  );
}
