'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { invoke } from '@tauri-apps/api/core';
import Analytics from '@/lib/analytics';
import { toast } from 'sonner';
import { ChevronRight, FileText, FolderOpen, Library, Mic, Pencil, Search, SlidersHorizontal, Sparkles, Trash2, UserRound, X } from 'lucide-react';
import { useSidebar, type CurrentMeeting } from '@/components/Sidebar/SidebarProvider';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { ConfirmationModal } from '@/components/ConfirmationModel/confirmation-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PageHeader, EmptyState } from '@/components/ui/product';
import { LibraryMark } from '@/components/brand/LibraryMark';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SelectField } from '@/components/ui/select-field';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';

type SemanticHit = { id: string; meetingId?: string; title: string; text: string; start: number; rank?: number };

const GROUP_PREVIEW = 5;

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function LibraryPage() {
  const router = useRouter();
  const { t, formatDate } = useTranslation();
  const { meetings, setMeetings, setCurrentMeeting, handleRecordingToggle } = useSidebar();
  const [query, setQuery] = useState('');
  const [client, setClient] = useState<string>('');
  const [project, setProject] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [tag, setTag] = useState<string>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming] = useState<CurrentMeeting | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [meetingLimit, setMeetingLimit] = useState(20);

  const NONE = '__none__';
  const byClient = (m: CurrentMeeting) => m.client || NONE;
  const byProject = (m: CurrentMeeting) => m.project || NONE;
  const tags = useMemo(
    () => Array.from(new Set(meetings.flatMap((meeting) => meeting.tags ?? []).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [meetings],
  );

  // Nivel actual: clientes -> proyectos -> reuniones. Se conserva en la URL para volver desde una reunión.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setClient(params.get('client') ?? '');
    setProject(params.get('project') ?? '');
  }, []);
  const go = (nextClient: string, nextProject = '') => {
    setClient(nextClient);
    setProject(nextProject);
    setSelected(new Set());
    setShowAllGroups(false);
    setMeetingLimit(20);
    const params = new URLSearchParams();
    if (nextClient) params.set('client', nextClient);
    if (nextProject) params.set('project', nextProject);
    window.history.replaceState(null, '', `${window.location.pathname}${params.size ? `?${params}` : ''}`);
  };

  const inClient = useMemo(() => (client ? meetings.filter((m) => byClient(m) === client) : meetings), [meetings, client]);

  const groups = useMemo(() => {
    const source = client ? inClient : meetings;
    const key = client ? byProject : byClient;
    const map = new Map<string, { id: string; count: number; last: string; projects: Set<string> }>();
    for (const m of source) {
      const id = key(m);
      const entry = map.get(id) ?? { id, count: 0, last: '', projects: new Set<string>() };
      entry.count += 1;
      if ((m.created_at ?? '') > entry.last) entry.last = m.created_at ?? '';
      if (m.project) entry.projects.add(m.project);
      map.set(id, entry);
    }
    return [...map.values()].sort((x, y) => (x.id === NONE ? 1 : y.id === NONE ? -1 : y.last.localeCompare(x.last)));
  }, [meetings, inClient, client]);

  const trimmedQuery = query.trim();
  useEffect(() => setMeetingLimit(20), [trimmedQuery]);
  const searching = trimmedQuery.length > 0;
  // Niveles: clientes -> proyectos -> reuniones. La búsqueda mira todo y salta directo a las reuniones.
  const level: 'clients' | 'projects' | 'meetings' = searching || project ? 'meetings' : client ? 'projects' : 'clients';
  const home = level === 'clients';

  // Asegura que las reuniones nuevas tengan su índice semántico (no hace nada si ya está al día).
  useEffect(() => {
    void invoke('desktop_search_index', { cancel: false }).catch(() => undefined);
  }, []);

  // Búsqueda semántica sobre el índice local (multilingual-e5-small + texto): devuelve pasajes por reunión.
  const [hits, setHits] = useState<Map<string, SemanticHit>>(new Map());
  const [searchingIndex, setSearchingIndex] = useState(false);
  useEffect(() => {
    if (trimmedQuery.length < 3) {
      setHits(new Map());
      setSearchingIndex(false);
      return;
    }
    let stale = false;
    setSearchingIndex(true);
    const timer = setTimeout(() => {
      void invoke<{ sources: SemanticHit[] }>('desktop_search_query', { query: trimmedQuery })
        .then((result) => {
          if (stale) return;
          const next = new Map<string, SemanticHit>();
          (result.sources ?? []).forEach((source, rank) => {
            if (source.meetingId && !next.has(source.meetingId)) next.set(source.meetingId, { ...source, rank });
          });
          setHits(next);
        })
        .catch((error) => {
          if (!stale) console.warn('Library semantic search failed:', error);
        })
        .finally(() => {
          if (!stale) setSearchingIndex(false);
        });
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [trimmedQuery]);

  const visible = useMemo(() => {
    const q = normalize(trimmedQuery);
    const inScope = (m: CurrentMeeting) =>
      (searching || !client || byClient(m) === client) && (searching || !project || byProject(m) === project);
    const list = [...meetings]
      .filter(inScope)
      .filter((m) => !tag || (m.tags ?? []).includes(tag))
      .filter((m) => {
        const date = m.created_at?.slice(0, 10) ?? '';
        return (!fromDate || (date && date >= fromDate)) && (!toDate || (date && date <= toDate));
      })
      .filter(
        (m) =>
          !q ||
          hits.has(m.id) ||
          normalize(`${m.title} ${m.client ?? ''} ${m.project ?? ''} ${(m.tags ?? []).join(' ')}`).includes(q),
      );
    return list.sort((a, b) => {
      const ra = hits.get(a.id)?.rank ?? Infinity;
      const rb = hits.get(b.id)?.rank ?? Infinity;
      return ra !== rb ? ra - rb : (b.created_at ?? '').localeCompare(a.created_at ?? '');
    });
  }, [meetings, trimmedQuery, client, project, tag, fromDate, toDate, searching, hits]);

  // Clientes y proyectos cuyo nombre coincide con la búsqueda.
  const nameMatches = useMemo(() => {
    const q = normalize(trimmedQuery);
    if (!q) return [] as { client: string; project: string }[];
    const seen = new Map<string, { client: string; project: string }>();
    for (const m of meetings) {
      if (m.client && normalize(m.client).includes(q)) seen.set(m.client, { client: m.client, project: '' });
      if (m.client && m.project && normalize(m.project).includes(q)) seen.set(`${m.client}/${m.project}`, { client: m.client, project: m.project });
    }
    return [...seen.values()].slice(0, 6);
  }, [meetings, trimmedQuery]);

  const rows = level === 'meetings' ? visible.slice(0, meetingLimit) : [];

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
        void Analytics.trackMeetingDeleted(id);
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
      void Analytics.track('meeting_renamed', { meeting_id: renaming.id, title_length: String(title.length) });
      setMeetings(meetings.map((m) => (m.id === renaming.id ? { ...m, title } : m)));
      setRenaming(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const clearFilters = () => {
    setQuery('');
    setTag('');
    setFromDate('');
    setToDate('');
  };

  return (
    <main className="custom-scrollbar h-dvh overflow-y-auto">
      <div className={cn('mx-auto flex min-h-full max-w-[760px] flex-col gap-6 px-8 py-10', home ? 'justify-center' : 'justify-start pt-14')}>
        <div className="animate-enter flex flex-col items-center gap-4 text-center">
          <LibraryMark className="size-14 drop-shadow-sm" />
          <PageHeader title={t('library.title')} description={t('library.hint')} className="justify-center text-center" />
          <div className="relative w-full max-w-[560px]">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('library.searchPlaceholder')}
              aria-label={t('library.searchPlaceholder')}
              className="h-12 w-full rounded-full border border-input bg-card pl-11 pr-11 text-[15px] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground hover:border-border-strong focus:border-brand focus:shadow-[0_0_0_3px_hsl(var(--brand)/0.12)]"
            />
            {query && (
              <button type="button" aria-label={t('common.cancel')} onClick={() => setQuery('')} className="absolute right-3.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="size-4" />
              </button>
            )}
          </div>
          {level === 'meetings' && (
            <Button variant={showFilters || tag || fromDate || toDate ? 'secondary' : 'ghost'} size="sm" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
              <SlidersHorizontal /> {t('library.filters')}
            </Button>
          )}
        </div>

        {showFilters && level === 'meetings' && (
          <div className="animate-enter flex flex-wrap items-center justify-center gap-2">
            <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label={t('library.fromDate')} title={t('library.fromDate')} className="w-[9.5rem]" />
            <span aria-hidden="true" className="text-xs text-muted-foreground">–</span>
            <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label={t('library.toDate')} title={t('library.toDate')} className="w-[9.5rem]" />
            <SelectField
              aria-label={t('library.allTags')}
              value={tag}
              onValueChange={setTag}
              placeholder={t('library.allTags')}
              className="w-40"
              options={[{ value: '', label: t('library.allTags') }, ...tags.map((value) => ({ value, label: value }))]}
            />
          </div>
        )}

        {!searching && (client || project) && (
          <nav aria-label="Breadcrumb" className="animate-enter flex items-center gap-1 text-sm text-muted-foreground">
            <button type="button" onClick={() => go('')} className="rounded px-1 hover:text-foreground">{t('library.clients')}</button>
            <ChevronRight className="size-3.5" />
            {project ? (
              <>
                <button type="button" onClick={() => go(client)} className="rounded px-1 hover:text-foreground">{client === NONE ? t('library.noClient') : client}</button>
                <ChevronRight className="size-3.5" />
                <span className="px-1 font-medium text-foreground">{project === NONE ? t('library.noProject') : project}</span>
              </>
            ) : (
              <span className="px-1 font-medium text-foreground">{client === NONE ? t('library.noClient') : client}</span>
            )}
          </nav>
        )}

        {selected.size > 0 && (
          <div className="animate-enter flex flex-wrap items-center gap-2 rounded-lg bg-accent px-3 py-2">
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

        {meetings.length > 0 && level !== 'meetings' && (
          <section key={`groups-${client}`} className="animate-enter flex flex-col gap-2">
            <ul
              className={cn(
                'divide-y divide-border overflow-hidden rounded-xl border border-border bg-card',
                showAllGroups && 'max-h-[22rem] overflow-y-auto',
              )}
            >
              {(showAllGroups ? groups : groups.slice(0, GROUP_PREVIEW)).map((group) => {
                const isClients = level === 'clients';
                const label = group.id === NONE ? (isClients ? t('library.noClient') : t('library.noProject')) : group.id;
                return (
                  <li key={group.id}>
                    <button
                      type="button"
                      onClick={() => (isClients ? go(group.id) : go(client, group.id))}
                      className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium group-hover:text-brand">{label}</span>
                      <span className="shrink-0 text-sm text-muted-foreground">
                        {isClients && group.projects.size > 0 ? `${t('library.nProjects').replace('{n}', String(group.projects.size))} · ` : ''}
                        {t('library.nMeetings').replace('{n}', String(group.count))}
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                    </button>
                  </li>
                );
              })}
            </ul>
            {groups.length > GROUP_PREVIEW && (
              <button
                type="button"
                onClick={() => setShowAllGroups((v) => !v)}
                className="self-center rounded-full px-3 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {showAllGroups ? t('library.showLess') : t('library.showAll').replace('{n}', String(groups.length))}
              </button>
            )}
          </section>
        )}

        {searching && nameMatches.length > 0 && (
          <section className="animate-enter flex flex-col gap-2">
            <h2 className="text-xs font-medium text-muted-foreground">{t('library.clientsProjects')}</h2>
            <div className="flex flex-wrap gap-2">
              {nameMatches.map((match) => (
                <button
                  key={`${match.client}/${match.project}`}
                  type="button"
                  onClick={() => { setQuery(''); go(match.client, match.project); }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-sm text-accent-foreground transition-colors hover:bg-accent/70"
                >
                  <FolderOpen className="size-3.5" />
                  {[match.client, match.project].filter(Boolean).join(' / ')}
                </button>
              ))}
            </div>
          </section>
        )}

        {meetings.length > 0 && level === 'meetings' && (
          <h2 className="-mb-3 text-xs font-medium text-muted-foreground">
            {searching && searchingIndex ? t('library.searching') : t('library.meetings')}
          </h2>
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
        ) : level === 'meetings' && rows.length === 0 ? (
          searchingIndex ? null : (
            <div className="product-surface">
              <EmptyState
                icon={<Search className="size-5" />}
                title={t('library.empty')}
                description={t('library.emptyHint')}
                action={<Button variant="outline" onClick={clearFilters}>{t('library.clearFilters')}</Button>}
              />
            </div>
          )
        ) : rows.length > 0 ? (
          <ul className="stagger divide-y divide-border border-y border-border">
            {rows.map((meeting, index) => {
              const isSelected = selected.has(meeting.id);
              const hit = searching ? hits.get(meeting.id) : undefined;
              const fromSummary = !!hit && /:s\d+$/.test(hit.id);
              const where = [meeting.client, meeting.project].filter(Boolean).join(' / ') || t('library.noClient');
              const date = meeting.created_at ? formatDate(meeting.created_at, { day: 'numeric', month: 'short' }) : '';
              return (
                <li
                  key={meeting.id}
                  style={{ '--i': Math.min(index, 10) } as React.CSSProperties}
                  className={cn('group relative flex items-start gap-3 px-2 py-3.5 transition-colors', isSelected ? 'bg-accent' : 'hover:bg-muted/40')}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggle(meeting.id)}
                    aria-label={meeting.title}
                    className={cn('mt-1 transition-opacity', isSelected || selected.size > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')}
                  />
                  <button
                    type="button"
                    onClick={() => (hit && !fromSummary
                      ? (setCurrentMeeting(meeting), router.push(`/meeting-details?id=${encodeURIComponent(meeting.id)}&sourceTime=${hit.start}`))
                      : open(meeting))}
                    className="flex min-w-0 flex-1 flex-col text-left"
                  >
                    <span className="truncate text-[15px] font-medium group-hover:text-brand">{meeting.title}</span>
                    <span className="mt-0.5 truncate text-sm text-muted-foreground">{where}</span>
                    {hit && (
                      <span className="mt-1.5 line-clamp-2 text-sm leading-snug text-muted-foreground/80">
                        {fromSummary && <span className="mr-1.5 font-medium text-brand">{t('library.fromSummary')} ·</span>}
                        {hit.text.trim()}
                      </span>
                    )}
                  </button>
                  <span className="mt-0.5 shrink-0 text-xs tabular-nums text-muted-foreground group-focus-within:hidden group-hover:hidden">{date}</span>
                  <div className="hidden shrink-0 items-center group-focus-within:flex group-hover:flex">
                    <Button size="icon" variant="ghost" className="size-7" aria-label={t('library.rename')} onClick={() => { setRenaming(meeting); setRenameValue(meeting.title); }}>
                      <Pencil />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 hover:text-destructive"
                      aria-label={t('library.delete')}
                      onClick={() => { setSelected(new Set([meeting.id])); setConfirmDelete(true); }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}

        {level === 'meetings' && visible.length > meetingLimit && (
          <button type="button" onClick={() => setMeetingLimit((n) => n + 20)} className="self-center rounded-full px-3 py-1 text-sm text-muted-foreground hover:text-foreground">
            {t('library.showMore').replace('{n}', String(visible.length - meetingLimit))}
          </button>
        )}

        {searching && trimmedQuery.length > 2 && (
          <button
            type="button"
            onClick={() => router.push(`/ask?q=${encodeURIComponent(trimmedQuery)}`)}
            className="inline-flex items-center gap-1.5 self-start text-sm text-brand hover:underline"
          >
            <Sparkles className="size-4" /> {t('library.askAbout')}
          </button>
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
