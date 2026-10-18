'use client';

import { Toaster } from 'sonner';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';

export function ThemedToaster() {
  const { resolvedTheme } = useUiPreferences();

  return (
    <Toaster
      theme={resolvedTheme}
      position="bottom-center"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: 'rounded-[10px] border-border bg-popover text-popover-foreground shadow-[0_16px_40px_-12px_rgb(20_30_60_/_0.24)]',
          title: 'text-foreground',
          description: 'text-muted-foreground',
          closeButton: 'border-border bg-background text-foreground hover:bg-muted',
        },
      }}
    />
  );
}
