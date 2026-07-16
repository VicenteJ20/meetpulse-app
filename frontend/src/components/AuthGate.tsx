'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ArrowUpRight, Check, Loader2, LockKeyhole } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/contexts/UiPreferencesContext';

function readableError(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === 'string') return reason;
  return 'We could not complete the Google sign-in. Please try again.';
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return <main className="relative h-screen overflow-hidden bg-background text-foreground">
    <div className="pointer-events-none absolute -left-40 -top-44 h-[34rem] w-[34rem] rounded-full bg-brand/10 blur-3xl" />
    <div className="pointer-events-none absolute -bottom-56 right-[-10rem] h-[36rem] w-[36rem] rounded-full bg-cyan-400/10 blur-3xl" />
    <div className="relative grid h-full overflow-hidden bg-card lg:grid-cols-2">{children}</div>
  </main>;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading, session, signIn } = useAuth();
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  if (session) return <>{children}</>;
  if (loading) return <AuthShell><section className="col-span-full flex flex-col items-center justify-center gap-5 bg-card"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground text-background shadow-lg"><Loader2 className="h-6 w-6 animate-spin" /></div><div className="text-center"><p className="font-semibold">{t('auth.preparing')}</p><p className="mt-1 text-sm text-muted-foreground">{t('auth.checking')}</p></div></section></AuthShell>;

  const handleSignIn = async () => {
    setError(null);
    try { await signIn(); }
    catch (reason) { setError(readableError(reason)); }
  };

  return <AuthShell>
    <section className="relative hidden overflow-hidden bg-[hsl(var(--sidebar))] px-12 py-11 text-white lg:flex lg:flex-col">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,hsl(var(--brand)/.5),transparent_32%),radial-gradient(circle_at_78%_76%,rgba(8,145,178,.32),transparent_30%)]" />
      <div className="relative flex items-center gap-3"><Image src="/icon.png" alt="" width={40} height={40} priority className="rounded-xl" /><span className="text-lg font-semibold tracking-tight">{t('app.name')}</span></div>
      <div className="relative my-auto max-w-lg">
        <p className="mb-5 text-sm font-medium text-blue-200">{t('auth.eyebrow')}</p>
        <h1 className="text-5xl font-semibold leading-[1.05] tracking-[-0.04em]">{t('auth.title')}</h1>
        <p className="mt-6 max-w-md text-lg leading-8 text-slate-300">{t('auth.description')}</p>
        <div className="mt-10 space-y-4 text-sm text-slate-200">
          {['Local recording and transcription workflow', 'Structured notes, decisions, and follow-ups', 'Shared Wiki for durable project context'].map(item => <p key={item} className="flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10"><Check className="h-3.5 w-3.5 text-cyan-200" /></span>{item}</p>)}
        </div>
      </div>
      <p className="relative text-xs text-slate-400">{t('app.name')} desktop · Your meeting intelligence stays in your control.</p>
    </section>

    <section className="relative flex min-h-[600px] flex-col items-center bg-[radial-gradient(circle_at_90%_15%,hsl(var(--brand)/.12),transparent_30%)] px-7 py-8 sm:px-12 sm:py-11">
      <div className="my-auto w-full max-w-md">
        <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm"><LockKeyhole className="h-3.5 w-3.5 text-brand" />Secure workspace access</div>
        <h2 className="text-3xl font-semibold tracking-[-0.035em]">{t('auth.welcome')}</h2>
        <p className="mt-3 text-[15px] leading-6 text-muted-foreground">{t('auth.signInDescription')}</p>
        {error && <div role="alert" className="mt-6 rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm leading-5 text-destructive"><p className="font-medium">Google sign-in did not complete</p><p className="mt-1 break-words opacity-85">{error}</p></div>}
        <button onClick={handleSignIn} className="mt-8 flex w-full items-center justify-center gap-3 rounded-xl bg-foreground px-4 py-3.5 text-sm font-semibold text-background shadow-lg transition hover:opacity-90"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-background text-[11px] font-bold text-foreground">G</span>{t('auth.continueGoogle')}<ArrowUpRight className="ml-1 h-4 w-4 opacity-60" /></button>
        <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">A browser window will open to complete Google authentication.</p>
      </div>
    </section>
  </AuthShell>;
}
