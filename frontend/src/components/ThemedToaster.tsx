'use client';

import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';
import { Toaster } from 'sonner';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';
import { cn } from '@/lib/utils';

// Icono dentro de una tarjeta tintada, igual que en "Acerca de" y en los avisos de actualización y grabación.
function Tile({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={cn('grid size-8 place-items-center rounded-lg [&_svg]:size-[18px]', tone)}>{children}</span>;
}

export function ThemedToaster() {
  const { resolvedTheme } = useUiPreferences();

  return (
    <Toaster
      theme={resolvedTheme}
      position="bottom-center"
      closeButton
      icons={{
        success: <Tile tone="bg-success/15 text-success"><CheckCircle2 /></Tile>,
        error: <Tile tone="bg-destructive/10 text-destructive"><XCircle /></Tile>,
        warning: <Tile tone="bg-warning/15 text-warning"><AlertTriangle /></Tile>,
        info: <Tile tone="bg-brand/10 text-brand"><Info /></Tile>,
        loading: <Tile tone="bg-muted text-muted-foreground"><Loader2 className="animate-spin" /></Tile>,
      }}
      toastOptions={{
        classNames: {
          toast: 'gap-3 rounded-[10px] border-border bg-popover p-3 text-popover-foreground shadow-[0_16px_40px_-12px_rgb(20_30_60_/_0.24)]',
          icon: '!m-0 !size-8',
          content: 'min-w-0 gap-0.5',
          title: 'text-sm font-semibold leading-5 text-foreground',
          description: 'text-xs leading-5 text-muted-foreground',
          actionButton: '!rounded-md !bg-brand !text-brand-foreground !text-xs !font-medium',
          cancelButton: '!rounded-md !bg-muted !text-foreground !text-xs',
          closeButton: 'border-border bg-background text-foreground hover:bg-muted',
        },
      }}
    />
  );
}
