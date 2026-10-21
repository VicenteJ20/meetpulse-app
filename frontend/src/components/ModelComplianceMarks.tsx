import { Lock, ShieldCheck } from 'lucide-react';
import { complianceMark } from '@/lib/model-review';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

function Mark({
  icon: Icon,
  flag,
  label,
}: {
  icon: typeof ShieldCheck;
  flag?: string | null;
  label: string;
}) {
  const state = complianceMark(flag);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span title={label} aria-label={label} className="inline-flex">
          <Icon
            className={cn(
              'size-3.5',
              state === 'check' ? 'text-success' : state === 'partial' ? 'text-warning' : 'text-muted-foreground/35',
            )}
            aria-hidden
          />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

/** ZDR and No Training marks shown beside a cloud model name. */
export function ModelComplianceMarks({
  zdr,
  noTraining,
  zdrLabel,
  noTrainingLabel,
}: {
  zdr?: string | null;
  noTraining?: string | null;
  zdrLabel: string;
  noTrainingLabel: string;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <span className="inline-flex items-center gap-1.5">
        <Mark icon={ShieldCheck} flag={zdr} label={zdrLabel} />
        <Mark icon={Lock} flag={noTraining} label={noTrainingLabel} />
      </span>
    </TooltipProvider>
  );
}
