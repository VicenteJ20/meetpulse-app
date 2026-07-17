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
          toast: 'border-border bg-popover text-popover-foreground shadow-xl',
          title: 'text-foreground',
          description: 'text-muted-foreground',
          closeButton: 'border-border bg-background text-foreground hover:bg-muted',
        },
      }}
    />
  );
}
