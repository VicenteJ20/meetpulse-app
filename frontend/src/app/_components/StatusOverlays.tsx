import { Check, Loader2 } from 'lucide-react';
import { useTranslation } from '@/contexts/UiPreferencesContext';

interface StatusOverlaysProps {
  isStopping: boolean;
  isProcessing: boolean;
  isSaving: boolean;
}

const steps = ['stopping', 'processing', 'saving'] as const;
type Step = (typeof steps)[number];

export function StatusOverlays({ isStopping, isProcessing, isSaving }: StatusOverlaysProps) {
  const { t } = useTranslation();
  const active: Step | null = isStopping ? 'stopping' : isProcessing ? 'processing' : isSaving ? 'saving' : null;
  if (!active) return null;

  const labels: Record<Step, string> = {
    stopping: t('loading.stopping'),
    processing: t('loading.finalizing'),
    saving: t('loading.saving'),
  };
  const activeIndex = steps.indexOf(active);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={labels[active]}
      className="recording-status-overlay pointer-events-none fixed bottom-6 left-14 right-0 z-30 flex justify-center px-6"
    >
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
        <div className="mb-3 flex items-center justify-center gap-2.5">
          <Loader2 className="size-4 animate-spin text-brand" />
          <span className="text-sm font-medium text-foreground">{labels[active]}</span>
        </div>
        <ol className="grid grid-cols-3 gap-2" aria-label={t('loading.progress')}>
          {steps.map((step, index) => {
            const complete = index < activeIndex;
            const current = index === activeIndex;
            return (
              <li
                key={step}
                aria-current={current ? 'step' : undefined}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs ${current ? 'bg-accent font-medium text-accent-foreground' : complete ? 'text-success' : 'text-muted-foreground'}`}
              >
                {complete && <Check className="size-3.5" aria-hidden="true" />}
                {labels[step]}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
