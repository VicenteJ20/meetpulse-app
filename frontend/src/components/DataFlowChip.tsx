'use client';

import Link from 'next/link';
import { Cloud, ShieldCheck } from 'lucide-react';
import { useDataFlow } from '@/hooks/useDataFlow';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { cn } from '@/lib/utils';

// Indica qué sale del equipo según los motores elegidos: "Todo local" o "Nube: Google (audio y texto)".
export function DataFlowChip({ className }: { className?: string }) {
  const { t } = useTranslation();
  const flow = useDataFlow();

  const targets = new Map<string, string[]>();
  const add = (provider: string, what: string) => targets.set(provider, [...(targets.get(provider) ?? []), what]);
  if (flow.audioTo) add(flow.audioTo, t('flow.audio'));
  if (flow.textTo) add(flow.textTo === 'custom' ? t('flow.custom') : flow.textTo, t('flow.text'));

  const label = [...targets.entries()].map(([provider, what]) => `${provider} (${what.join(` ${t('flow.and')} `)})`).join(', ');

  return (
    <Link
      href="/settings"
      title={t('flow.tip')}
      className={cn(
        'inline-flex h-6 max-w-full items-center gap-1.5 truncate rounded-full px-2.5 text-xs font-semibold transition-colors hover:underline',
        flow.isLocal ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning',
        className,
      )}
    >
      {flow.isLocal ? <ShieldCheck className="size-3.5 shrink-0" /> : <Cloud className="size-3.5 shrink-0" />}
      <span className="truncate">{flow.isLocal ? t('flow.local') : `${t('flow.cloud')}: ${label}`}</span>
    </Link>
  );
}
