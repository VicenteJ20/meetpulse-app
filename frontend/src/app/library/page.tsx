'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { FileText, Library, Mic, Pencil, Search, Sparkles, Trash2, X } from 'lucide-react';
import { useSidebar, type CurrentMeeting } from '@/components/Sidebar/SidebarProvider';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { ConfirmationModal } from '@/components/ConfirmationModel/confirmation-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PageHeader, EmptyState } from '@/components/ui/product';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SelectField } from '@/components/ui/select-field';
import { cn } from '@/lib/utils';

export default function LibraryPage() {
  const router = useRouter();
  const { t, formatDate } = useTranslation();
  const { meetings, setMeetings, setCurrentMeeting, handleRecordingToggle } = useSidebar();
  const [query, setQuery] = useState('');
  const [client, setClient] = useState<string>('');
  const [tag, setTag] = useState<string>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming] = useState<CurrentMeeting | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const clients = useMemo(
    () => Array.from(new Set(meetings.map((m) => m.client).filter((c): c is string => !!c))).sort(),
    [meetings],
  );
  const hasUnclassified = meetings.some((m) => !m.client);
  const tags = useMemo(
    () => Array.from(new Set(meetings.flatMap((meeting) => meeting.tags ?? []).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [meetings],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...meetings]
      .filter((m) => (client === '' ? true : client === '__none__' ? !m.client : m.client === client))
      .filter((m) => !tag || (m.tags ?? []).includes(tag))
      .filter((m) => {
        const date = m.created_at?.slice(0, 10) ?? '';
        return (!fromDate || (date && date >= fromDate)) && (!toDate || (date && date <= toDate));
      })
      .filter(
        (m) =>
          !q ||
          `${m.title} ${m.client ?? ''} ${m.project ?? ''} ${(m.tags ?? []).join(' ')}`.toLowerCase().includes(q),
      )
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  }, [meetings, query, client, tag, fromDate, toDate]);

  const open = (meeting: CurrentMeeting) => {
    setCurrentMeeting(meeting);
    router.push(`/meeting-details?id=${encodeURIComponent(meeting.id)}`);
  };

  const toggle = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const deleteSelected = async () => {
    const ids = [...selected];
    setConfirmDelete(false);
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await invoke('api_delete_meeting', { meetingId: id });
      } catch (error) {
        console.error('Failed to delete meeting', id, error);
        failed.push(id);
      }
    }
    setMeetings(meetings.filter((m) => !ids.includes(m.id) || failed.includes(m.id)));
    setSelected(new Set(failed));
    if (failed.length === 0) toast.success(t('library.deleted'));
    else toast.error(`${failed.length}/${ids.length}`);
  };

  const saveRename = async () => {
    const title = renameValue.trim();
    if (!renaming || !title) return;
    try {
      await invoke('api_save_meeting_title', { meetingId: renaming.id, title });
      setMeetings(meetings.map((m) => (m.id === renaming.id ? { ...m, title } : m)));
      setRenaming(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const clearFilters = () => {
    setQuery('');
    setClient('');
    setTag('');
    setFromDate('');
    setToDate('');
  };

  return (
    <main className="custom-scrollbar h-dvh overflow-y-auto">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-8 pb-16 pt-7">
        <PageHeader
          title={t('library.title')}
          description={t('library.description')}
          actions={
            <>
              <Button variant="outline" onClick={() => router.push('/ask')}>
                <Sparkles /> {t('nav.ask')}
              </Button>
              <Button variant="recording" onClick={handleRecordingToggle}>
                <Mic /> {t('nav.recordLive')}
              </Button>
            </>
          }
        />

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('library.filter')}
              aria-label={t('library.filter')}
              className="pl-8"
            />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('library.allClients')}>
            {[{ id: '', label: t('library.allClients') }, ...clients.map((c) => ({ id: c, label: c })), ...(hasUnclassified && clients.length > 0 ? [{ id: '__none__', label: t('library.noClient') }] : [])].map((chip) => (
              <button
                key={chip.id || 'all'}
                type="button"
                aria-pressed={client === chip.id}
                onClick={() => setClient(chip.id)}
                className={cn(
                  'h-7 rounded-full border px-3 text-sm transition-colors',
                  client === chip.id
                    ? 'border-brand bg-accent text-accent-foreground'
                    : 'border-input bg-card text-muted-foreground hover:border-muted-foreground',
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              aria-label={t('library.fromDate')}
              title={t('library.fromDate')}
              className="h-8 w-[9.5rem]"
            />
            <span aria-hidden="true" className="text-xs text-muted-foreground">–</span>
            <Input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              aria-label={t('library.toDate')}
              title={t('library.toDate')}
              className="h-8 w-[9.5rem]"
            />
            <SelectField
              aria-label={t('library.allTags')}
              value={tag}
              onValueChange={setTag}
              placeholder={t('library.allTags')}
              className="h-8 w-40"
              options={[
                { value: '', label: t('library.allTags') },
                ...tags.map((value) => ({ value, label: value })),
              ]}
            />
          </div>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-accent px-3 py-2">
            <span className="mr-2 text-sm font-semibold text-accent-foreground">
              {t('library.selected').replace('{n}', String(selected.size))}
            </span>
            <Button size="sm" variant="outline" className="text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> {t('library.deleteSelected')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              {t('library.clearSelection')}
            </Button>
          </div>
        )}

        {meetings.length === 0 ? (
          <div className="product-surface">
            <EmptyState
              icon={<Library className="size-5" />}
              title={t('library.none')}
              description={t('library.noneHint')}
              action={
                <Button variant="recording" onClick={handleRecordingToggle}>
                  <Mic /> {t('recording.start')}
                </Button>
              }
            />
          </div>
        ) : visible.length === 0 ? (
          <div className="product-surface">
            <EmptyState
              icon={<Search className="size-5" />}
              title={t('library.empty')}
              description={t('library.emptyHint')}
              action={<Button variant="outline" onClick={clearFilters}>{t('library.clearFilters')}</Button>}
            />
          </div>
        ) : (
          <ul className="product-surface divide-y divide-border overflow-hidden">
            {visible.map((meeting) => {
              const isSelected = selected.has(meeting.id);
              return (
                <li
                  key={meeting.id}
                  className={cn(
                    'group grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 transition-colors',
                    isSelected ? 'bg-accent' : 'hover:bg-muted/50',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(meeting.id)}
                    aria-label={meeting.title}
                    className="size-4 cursor-pointer rounded border-input accent-[hsl(var(--brand))]"
                  />
                  <button type="button" onClick={() => open(meeting)} className="flex min-w-0 flex-col gap-1 text-left">
                    <span className="flex items-center gap-2">
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium group-hover:text-brand">{meeting.title}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5 pl-6 text-sm text-muted-foreground">
                      {meeting.client || meeting.project ? (
                        <span>{[meeting.client, meeting.project].filter(Boolean).join(' / ')}</span>
                      ) : (
                        <span>{t('library.noClient')}</span>
                      )}
                      {(meeting.tags ?? []).map((tag) => (
                        <Badge key={tag}>{tag}</Badge>
                      ))}
                    </span>
                  </button>
                  <div className="flex items-center gap-1">
                    <span className="mr-2 font-mono text-xs tabular-nums text-muted-foreground">
                      {meeting.created_at ? formatDate(meeting.created_at, { dateStyle: 'medium' }) : ''}
                    </span>
                    <div className="flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                      <Button size="icon" variant="ghost" aria-label={t('library.rename')} onClick={() => { setRenaming(meeting); setRenameValue(meeting.title); }}>
                        <Pencil />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t('library.delete')}
                        className="hover:text-destructive"
                        onClick={() => { setSelected(new Set([meeting.id])); setConfirmDelete(true); }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmationModal
        isOpen={confirmDelete}
        text={t('library.deleteConfirm').replace('{n}', String(selected.size))}
        onConfirm={deleteSelected}
        onCancel={() => setConfirmDelete(false)}
      />

      <Dialog open={!!renaming} onOpenChange={(isOpen) => !isOpen && setRenaming(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('library.renameTitle')}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && saveRename()}
            aria-label={t('library.renameTitle')}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}><X /> {t('common.cancel')}</Button>
            <Button onClick={saveRename} disabled={!renameValue.trim()}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
