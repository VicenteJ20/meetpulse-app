import * as React from 'react';
import { cn } from '@/lib/utils';

// Sección plana de ajustes: título, descripción y contenido, separadas por línea fina.
export function SettingsSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('border-t border-border py-6 first:border-t-0 first:pt-1', className)}>
      <div className="mb-4 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h3 className="text-[0.95rem] font-semibold tracking-tight">{title}</h3>
          {description && <p className="mt-1 max-w-[62ch] text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
