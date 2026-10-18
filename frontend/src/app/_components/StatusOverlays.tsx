import { Loader2 } from 'lucide-react';
import { useTranslation } from '@/contexts/UiPreferencesContext';

interface StatusOverlaysProps {
  isProcessing: boolean;      // Finalizando la transcripción tras detener
  isSaving: boolean;          // Guardando la reunión
  sidebarCollapsed: boolean;  // Se mantiene por compatibilidad con page.tsx
}

function StatusOverlay({ show, message }: { show: boolean; message: string }) {
  if (!show) return null;
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-7 left-14 right-0 z-30 flex justify-center px-6">
      <div className="flex items-center gap-2.5 rounded-full border border-border bg-card px-4 py-2 shadow-lg">
        <Loader2 className="size-4 animate-spin text-brand" />
        <span className="text-sm text-foreground">{message}</span>
      </div>
    </div>
  );
}

export function StatusOverlays({ isProcessing, isSaving }: StatusOverlaysProps) {
  const { t } = useTranslation();
  return (
    <>
      <StatusOverlay show={isProcessing} message={t('loading.finalizing')} />
      <StatusOverlay show={isSaving} message={t('loading.saving')} />
    </>
  );
}
