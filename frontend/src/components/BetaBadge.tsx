'use client';

import { FlaskConical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { withAssistant } from '@/config/brand';
import { cn } from '@/lib/utils';

// Marca de Meety en beta, con el aviso de precisión en el tooltip.
export function BetaBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="warn" tabIndex={0} className={cn('cursor-default', className)}>
            <FlaskConical aria-hidden />
            {t('assistant.beta')}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[16rem] text-balance">
          {withAssistant(t('assistant.betaHint'))}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
