'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ArrowUpRight, Check, Loader2, LockKeyhole, LogIn, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

function readableError(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === 'string') return reason;
  return 'We could not complete the Google sign-in. Please try again.';
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return <main className="relative h-screen overflow-hidden bg-[#f7f9fc] text-slate-950">
    <div className="pointer-events-none absolute -left-40 -top-44 h-[34rem] w-[34rem] rounded-full bg-blue-200/50 blur-3xl" />
    <div className="pointer-events-none absolute -bottom-56 right-[-10rem] h-[36rem] w-[36rem] rounded-full bg-cyan-100/70 blur-3xl" />
    <div className="relative grid h-full overflow-hidden bg-white lg:grid-cols-2">{children}</div>
  </main>;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading, session, signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);

  if (session) return <>{children}</>;

  if (loading) return <AuthShell><section className="col-span-full flex flex-col items-center justify-center gap-5 bg-white"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-300"><Loader2 className="h-6 w-6 animate-spin" /></div><div className="text-center"><p className="font-semibold text-slate-900">Preparing your workspace</p><p className="mt-1 text-sm text-slate-500">Checking your secure MeetPulse session…</p></div></section></AuthShell>;

  const handleSignIn = async () => {
    setError(null);
    try { await signIn(); }
    catch (reason) { setError(readableError(reason)); }
  };

  return <AuthShell>
    <section className="relative hidden overflow-hidden bg-slate-950 px-12 py-11 text-white lg:flex lg:flex-col">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(37,99,235,0.55),transparent_32%),radial-gradient(circle_at_78%_76%,rgba(8,145,178,0.38),transparent_30%)]" />
      <div className="relative flex items-center gap-3"><Image src="/icon.png" alt="" width={40} height={40} priority className="rounded-xl" /><span className="text-lg font-semibold tracking-tight">MeetPulse</span></div>
      <div className="relative my-auto max-w-lg"><p className="mb-5 text-sm font-medium text-blue-200">MEETING INTELLIGENCE, ON YOUR DESKTOP</p><h1 className="text-5xl font-semibold leading-[1.05] tracking-[-0.04em]">Turn every conversation into momentum.</h1><p className="mt-6 max-w-md text-lg leading-8 text-slate-300">Capture what matters, keep the context, and move work forward without sending your meetings away from your desktop.</p><div className="mt-10 space-y-4 text-sm text-slate-200"><p className="flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10"><Check className="h-3.5 w-3.5 text-cyan-200" /></span>Local recording and transcription workflow</p><p className="flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10"><Check className="h-3.5 w-3.5 text-cyan-200" /></span>Structured notes, decisions, and follow-ups</p><p className="flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10"><Check className="h-3.5 w-3.5 text-cyan-200" /></span>Cloud Wiki that turns shared context into a knowledge center</p></div></div>
      <p className="relative text-xs text-slate-400">MeetPulse desktop · Your meeting intelligence stays in your control.</p>
    </section>

    <section className="relative flex min-h-[600px] flex-col items-center bg-[radial-gradient(circle_at_90%_15%,rgba(219,234,254,0.7),transparent_30%)] px-7 py-8 sm:px-12 sm:py-11">
      <div className="flex items-center justify-between lg:hidden"><div className="flex items-center gap-2 font-semibold"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-white"><Sparkles className="h-4 w-4" /></span>MeetPulse</div><span className="text-xs font-medium text-slate-400">DESKTOP</span></div>
      <div className="my-auto w-full max-w-md"><div className="mb-7 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm"><LockKeyhole className="h-3.5 w-3.5 text-blue-600" />Secure workspace access</div><h2 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950">Welcome back.</h2><p className="mt-3 text-[15px] leading-6 text-slate-500">Sign in to open your personal workspace and the Wiki tenants you belong to.</p>
        {error && <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-red-700"><p className="font-medium">Google sign-in didn’t complete</p><p className="mt-1 break-words text-red-600">{error}</p></div>}
        <button onClick={handleSignIn} className="mt-8 flex w-full items-center justify-center gap-3 rounded-xl bg-slate-950 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-slate-300 transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-100"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-bold text-slate-900">G</span>Continue with Google<ArrowUpRight className="ml-1 h-4 w-4 text-slate-300" /></button>
        <p className="mt-5 text-center text-xs leading-5 text-slate-400">A browser window will open to complete Google authentication. MeetPulse only uses your verified identity to secure access.</p>
      </div>
      <div className="flex w-full max-w-md items-center justify-between text-xs text-slate-400"><span>Protected by your Google account</span><span>MeetPulse</span></div>
    </section>
  </AuthShell>;
}
