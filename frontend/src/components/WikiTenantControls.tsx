'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Check, ChevronDown, Mail, MoreHorizontal, Plus, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import { wikiAccountRequest, type WikiTenant } from '@/services/wiki-api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/contexts/UiPreferencesContext';

type Member = { google_sub: string; email: string; name?: string; role: 'owner' | 'guest' };
type Invitation = { invitation_id: string; tenant_id: string; created_at: string };
type TenantAvailability = { tenant_id: string; available: boolean };

interface WikiTenantControlsProps {
  tenants: WikiTenant[];
  currentTenantId: string;
  onSelect: (tenantId: string) => void;
  onChanged: (preferredTenantId?: string) => Promise<void>;
  emptyState?: boolean;
}

export function WikiTenantControls({ tenants, currentTenantId, onSelect, onChanged, emptyState = false }: WikiTenantControlsProps) {
  const { t } = useTranslation();
  const [createOpen, setCreateOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [tenantName, setTenantName] = useState('');
  const [availability, setAvailability] = useState<TenantAvailability | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [creating, setCreating] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const active = useMemo(() => tenants.find(item => item.tenant_id === currentTenantId), [currentTenantId, tenants]);

  const loadInvitations = useCallback(async () => {
    try {
      const result = await wikiAccountRequest<{ items: Invitation[] }>('/me/invitations');
      setInvitations(result.items);
    } catch {
      setInvitations([]);
    }
  }, []);

  const loadMembers = useCallback(async () => {
    if (!currentTenantId || active?.role !== 'owner') {
      setMembers([]);
      return;
    }
    try {
      const result = await wikiAccountRequest<{ items: Member[] }>(`/tenants/${currentTenantId}/members`);
      setMembers(result.items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('wiki.errorGeneric'));
    }
  }, [active?.role, currentTenantId, t]);

  useEffect(() => { loadInvitations(); }, [loadInvitations]);
  useEffect(() => { if (manageOpen) loadMembers(); }, [loadMembers, manageOpen]);

  useEffect(() => {
    const name = tenantName.trim();
    if (!name) {
      setAvailability(null);
      return;
    }
    const timer = window.setTimeout(() => {
      setCheckingAvailability(true);
      wikiAccountRequest<TenantAvailability>(`/tenants/availability?name=${encodeURIComponent(name)}`)
        .then(setAvailability)
        .catch(() => setAvailability({ tenant_id: '', available: false }))
        .finally(() => setCheckingAvailability(false));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [tenantName]);

  const createTenant = async () => {
    setCreating(true);
    setError('');
    try {
      const created = await wikiAccountRequest<{ tenant_id: string }>('/tenants/provision', {
        method: 'POST',
        body: JSON.stringify({ name: tenantName.trim() }),
      });
      setTenantName('');
      setAvailability(null);
      setCreateOpen(false);
      await onChanged(created.tenant_id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('wiki.errorGeneric'));
    } finally {
      setCreating(false);
    }
  };

  const invite = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setError('');
    try {
      await wikiAccountRequest(`/tenants/${currentTenantId}/invitations`, {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      setEmail('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('wiki.errorGeneric'));
    } finally {
      setBusy(false);
    }
  };

  const respond = async (invitation: Invitation, action: 'accept' | 'reject') => {
    setBusy(true);
    try {
      await wikiAccountRequest(`/me/invitations/${invitation.invitation_id}/${action}`, { method: 'POST' });
      await Promise.all([loadInvitations(), onChanged(action === 'accept' ? invitation.tenant_id : undefined)]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('wiki.errorGeneric'));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (member: Member) => {
    setBusy(true);
    try {
      await wikiAccountRequest(`/tenants/${currentTenantId}/members/${encodeURIComponent(member.google_sub)}`, { method: 'DELETE' });
      setMembers(items => items.filter(item => item.google_sub !== member.google_sub));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('wiki.errorGeneric'));
    } finally {
      setBusy(false);
    }
  };

  const creationDialog = (
    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('wiki.createWorkspace')}</DialogTitle>
          <DialogDescription>{t('wiki.createWorkspaceDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor="wiki-workspace-name" className="text-sm font-medium">{t('wiki.workspaceName')}</label>
          <Input id="wiki-workspace-name" value={tenantName} onChange={event => setTenantName(event.target.value)} placeholder={t('wiki.workspaceNamePlaceholder')} maxLength={80} />
          {tenantName.trim() && (
            <p className={`text-xs ${availability?.available ? 'text-emerald-600' : 'text-destructive'}`}>
              {checkingAvailability ? t('wiki.checkingAvailability') : availability?.available ? t('wiki.workspaceAvailable').replace('{id}', availability.tenant_id) : t('wiki.workspaceUnavailable')}
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          {!emptyState && <Button variant="ghost" onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>}
          <Button onClick={createTenant} disabled={creating || !availability?.available}><Plus />{creating ? t('wiki.creatingWorkspace') : t('wiki.createWorkspace')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (emptyState) {
    return (
      <div className="flex flex-col items-center gap-3">
        <Button onClick={() => setCreateOpen(true)}><Plus />{t('wiki.createWorkspace')}</Button>
        {invitations.length > 0 && (
          <div className="w-full max-w-sm space-y-2 rounded-xl border border-border bg-muted/35 p-3 text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t('wiki.pendingInvitations')}</p>
            {invitations.map(invitation => (
              <div key={invitation.invitation_id} className="flex items-center gap-2 rounded-lg bg-background p-2.5">
                <Mail className="h-4 w-4 text-brand" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{invitation.tenant_id}</span>
                <Button size="sm" onClick={() => respond(invitation, 'accept')} disabled={busy}>{t('wiki.accept')}</Button>
                <Button size="sm" variant="ghost" onClick={() => respond(invitation, 'reject')} disabled={busy}>{t('wiki.reject')}</Button>
              </div>
            ))}
          </div>
        )}
        {creationDialog}
      </div>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="max-w-[15rem] justify-between">
            <Building2 />
            <span className="truncate">{active?.display_name || active?.tenant_id || t('wiki.workspace')}</span>
            <ChevronDown className="opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>{t('wiki.yourWorkspaces')}</DropdownMenuLabel>
          {tenants.map(tenant => (
            <DropdownMenuItem key={tenant.tenant_id} onSelect={() => onSelect(tenant.tenant_id)} className="py-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand"><Building2 /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{tenant.display_name || tenant.tenant_id}</span>
                <span className="block text-xs text-muted-foreground">{tenant.role === 'owner' ? t('wiki.owner') : t('wiki.guest')}</span>
              </span>
              {tenant.tenant_id === currentTenantId && <Check className="text-brand" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}><Plus />{t('wiki.createWorkspace')}</DropdownMenuItem>
          {active?.role === 'owner' && <DropdownMenuItem onSelect={() => setManageOpen(true)}><Users />{t('wiki.manageMembers')}</DropdownMenuItem>}
          {invitations.length > 0 && <DropdownMenuItem onSelect={() => setManageOpen(true)}><Mail />{t('wiki.pendingInvitations')}<span className="ml-auto rounded-full bg-brand px-2 py-0.5 text-xs text-white">{invitations.length}</span></DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('wiki.manageWorkspace')}</DialogTitle>
            <DialogDescription>{active?.display_name || active?.tenant_id}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-5 overflow-y-auto pr-1">
            {active?.role === 'owner' && (
              <section>
                <div className="mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-brand" /><h3 className="text-sm font-semibold">{t('wiki.members')}</h3></div>
                <div className="space-y-2">
                  {members.map(member => (
                    <div key={member.google_sub} className="flex items-center gap-3 rounded-xl border border-border p-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-semibold">{(member.name || member.email).slice(0, 1).toUpperCase()}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{member.name || member.email}</span><span className="block truncate text-xs text-muted-foreground">{member.email}</span></span>
                      <span className="text-xs text-muted-foreground">{member.role === 'owner' ? t('wiki.owner') : t('wiki.guest')}</span>
                      {member.role === 'guest' && <Button size="icon" variant="ghost" aria-label={t('wiki.removeMember')} onClick={() => revoke(member)} disabled={busy}><Trash2 className="text-destructive" /></Button>}
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <Input value={email} onChange={event => setEmail(event.target.value)} placeholder="person@example.com" type="email" />
                  <Button onClick={invite} disabled={busy || !email.trim()}><UserPlus />{t('wiki.invite')}</Button>
                </div>
              </section>
            )}
            {invitations.length > 0 && (
              <section>
                <h3 className="mb-3 text-sm font-semibold">{t('wiki.pendingInvitations')}</h3>
                <div className="space-y-2">
                  {invitations.map(invitation => (
                    <div key={invitation.invitation_id} className="flex items-center gap-2 rounded-xl border border-border p-3">
                      <Mail className="h-4 w-4 text-brand" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{invitation.tenant_id}</span>
                      <Button size="sm" onClick={() => respond(invitation, 'accept')} disabled={busy}>{t('wiki.accept')}</Button>
                      <Button size="sm" variant="ghost" onClick={() => respond(invitation, 'reject')} disabled={busy}>{t('wiki.reject')}</Button>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {!members.length && !invitations.length && <div className="py-8 text-center text-sm text-muted-foreground"><MoreHorizontal className="mx-auto mb-2 h-5 w-5" />{t('wiki.noWorkspaceActions')}</div>}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </DialogContent>
      </Dialog>
      {creationDialog}
    </>
  );
}
