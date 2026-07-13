'use client';

import { useState } from 'react';
import { Loader2, LogIn } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading, session, signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  if (loading) return <main className="flex h-screen items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></main>;
  if (session) return <>{children}</>;
  return <main className="flex h-screen items-center justify-center bg-slate-50 p-6"><section className="w-full max-w-md rounded-xl border bg-white p-8 text-center shadow-sm"><h1 className="text-2xl font-bold text-slate-900">Welcome to MeetPulse</h1><p className="mt-2 text-sm text-slate-600">Sign in with Google to access your secure Wiki workspace.</p>{error && <p className="mt-4 whitespace-pre-wrap break-words rounded-md bg-red-50 p-3 text-left text-sm text-red-700">{error}</p>}<button onClick={() => { setError(null); signIn().catch(reason => setError(reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : JSON.stringify(reason))); }} className="mt-6 inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"><LogIn className="h-4 w-4" />Continue with Google</button></section></main>;
}
