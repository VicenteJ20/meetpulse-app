'use client';

import { useEffect, useState } from 'react';
import { Building2, Plus, UserPlus, Users } from 'lucide-react';
import { currentGoogleSession } from '@/services/auth-service';
import { getWikiConfig, saveWikiConfig } from '@/services/wiki-config';

type Tenant = { tenant_id: string; role: 'owner' | 'guest' };
type Member = { google_sub: string; email: string; name?: string; role: 'owner' | 'guest' };
type Invitation = { invitation_id: string; tenant_id: string; created_at: string };
const roleLabel = (role: string) => role === 'owner' ? 'Propietario' : 'Invitado';

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = await currentGoogleSession();
  if (!session) throw new Error('Google sign-in is required.');
  const response = await fetch(new URL(`/api/v1${path}`, getWikiConfig().baseUrl), { ...init, headers: { authorization: `Bearer ${session.idToken}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || 'Wiki request failed.');
  return response.json();
}

export function WikiTenantControls({ emptyState = false }: { emptyState?: boolean }) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [current, setCurrent] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState<Invitation[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const select = (tenantId: string) => { setCurrent(tenantId); saveWikiConfig({ ...getWikiConfig(), tenantId }); };
  const load = async () => {
    try {
      const [tenantResult, invitationResult] = await Promise.all([api<{ items: Tenant[] }>('/tenants'), api<{ items: Invitation[] }>('/me/invitations')]);
      const saved = getWikiConfig().tenantId;
      const selected = tenantResult.items.some(item => item.tenant_id === saved) ? saved : tenantResult.items[0]?.tenant_id || '';
      setTenants(tenantResult.items); setPending(invitationResult.items); setCurrent(selected);
      if (selected !== saved) saveWikiConfig({ ...getWikiConfig(), tenantId: selected });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load tenants.'); }
  };
  useEffect(() => { load(); }, []);

  const active = tenants.find(item => item.tenant_id === current);
  useEffect(() => {
    if (active?.role !== 'owner') { setMembers([]); return; }
    api<{ items: Member[] }>(`/tenants/${current}/members`).then(result => setMembers(result.items)).catch(reason => setError(reason.message));
  }, [current, active?.role]);

  const createTenant = async () => {
    setCreating(true); setError('');
    try { const created = await api<{ tenant_id: string }>('/tenants/provision', { method: 'POST' }); await load(); select(created.tenant_id); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to create your Wiki tenant.'); }
    finally { setCreating(false); }
  };
  const invite = async () => { try { await api(`/tenants/${current}/invitations`, { method: 'POST', body: JSON.stringify({ email }) }); setEmail(''); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to invite user.'); } };
  const respond = async (invitation: Invitation, action: 'accept' | 'reject') => { try { await api(`/me/invitations/${invitation.invitation_id}/${action}`, { method: 'POST' }); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to respond to invitation.'); } };
  const revoke = async (member: Member) => { try { await api(`/tenants/${current}/members/${encodeURIComponent(member.google_sub)}`, { method: 'DELETE' }); setMembers(items => items.filter(item => item.google_sub !== member.google_sub)); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to revoke access.'); } };

  const invitations = pending.length > 0 && <details className="relative"><summary className="cursor-pointer rounded-md border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs text-blue-800">{pending.length} invitation{pending.length > 1 ? 's' : ''}</summary><section className="absolute right-0 z-20 mt-2 w-72 rounded-lg border bg-white p-3 shadow-lg">{pending.map(invitation => <div key={invitation.invitation_id} className="border-b py-2 text-xs last:border-0"><p className="font-medium">Shared tenant: {invitation.tenant_id}</p><div className="mt-2 flex gap-2"><button onClick={() => respond(invitation, 'accept')} className="rounded bg-slate-900 px-2 py-1 text-white">Accept</button><button onClick={() => respond(invitation, 'reject')} className="rounded border px-2 py-1">Reject</button></div></div>)}</section></details>;
  if (emptyState && tenants.length === 0) return <div className="mt-5 space-y-3"><button onClick={createTenant} disabled={creating} className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"><Plus className="h-4 w-4" />{creating ? 'Creating tenant…' : 'Create my Wiki tenant'}</button>{invitations}{error && <p className="text-sm text-red-600">{error}</p>}</div>;

  return <div className="flex items-center gap-2"><details className="relative"><summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-xs"><Building2 className="h-3.5 w-3.5" />My tenants</summary><section className="absolute right-0 z-20 mt-2 w-64 rounded-lg border bg-white p-3 shadow-lg"><p className="mb-2 text-xs font-semibold text-slate-700">Accessible workspaces</p>{tenants.map(tenant => <button key={tenant.tenant_id} onClick={() => select(tenant.tenant_id)} className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-slate-50"><span className="truncate">{tenant.tenant_id}</span><span className={`ml-2 rounded-full px-2 py-0.5 ${tenant.role === 'owner' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{roleLabel(tenant.role)}</span></button>)}{tenants.length === 0 && <p className="text-xs text-slate-500">No tenants yet.</p>}</section></details>{tenants.length > 0 && <select aria-label="Wiki tenant" value={current} onChange={event => select(event.target.value)} className="max-w-48 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs">{tenants.map(tenant => <option key={tenant.tenant_id} value={tenant.tenant_id}>{tenant.tenant_id} · {roleLabel(tenant.role)}</option>)}</select>}{invitations}{active?.role === 'owner' && <details className="relative"><summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-xs"><Users className="h-3.5 w-3.5" />Users</summary><section className="absolute right-0 z-20 mt-2 w-80 rounded-lg border bg-white p-3 shadow-lg"><p className="mb-2 text-xs font-semibold text-slate-700">Members</p>{members.map(member => <div key={member.google_sub} className="flex items-center justify-between gap-2 py-1 text-xs"><span className="truncate">{member.name || member.email}</span><span className={`rounded-full px-2 py-0.5 ${member.role === 'owner' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{roleLabel(member.role)}</span>{member.role === 'guest' && <button onClick={() => revoke(member)} className="text-red-600 hover:underline">Remove</button>}</div>)}<div className="mt-3 flex gap-1 border-t pt-3"><input value={email} onChange={event => setEmail(event.target.value)} placeholder="person@example.com" className="min-w-0 flex-1 rounded border px-2 py-1 text-xs" /><button onClick={invite} disabled={!email} className="rounded bg-slate-900 px-2 text-white"><UserPlus className="h-3.5 w-3.5" /></button></div></section></details>}{error && <span className="max-w-48 truncate text-xs text-red-600" title={error}>{error}</span>}</div>;
}
