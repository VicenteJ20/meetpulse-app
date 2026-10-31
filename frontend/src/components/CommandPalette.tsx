'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { invoke } from '@tauri-apps/api/core';
import Analytics from '@/lib/analytics';
import { Cpu, FileText, Home, Library, Lightbulb, Mic, Moon, Settings, Sparkles, Waves } from 'lucide-react';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useAssistant } from '@/contexts/AssistantContext';
import { useTranslation, useUiPreferences } from '@/contexts/UiPreferencesContext';
import { OPEN_PALETTE_EVENT } from '@/components/Rail';
import { Kbd } from '@/components/ui/kbd';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@/components/ui/visually-hidden';

type SemanticSource = {
  id: string;
  meetingId?: string;
  title: string;
  text: string;
  start: number;
  end?: number;
};

// Paleta Ctrl+K: reuniones, ajustes, comandos y "Preguntar".
export default function CommandPalette() {
  const router = useRouter();
  const { t } = useTranslation();
  const { theme, setTheme } = useUiPreferences();
  const { meetings, setCurrentMeeting, handleRecordingToggle } = useSidebar();
  const assistant = useAssistant();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [semanticResults, setSemanticResults] = useState<SemanticSource[]>([]);
  const [searching, setSearching] = useState(false);
  const [partialSearch, setPartialSearch] = useState(false);

  useEffect(() => {
    const show = () => {
      setQuery('');
      setOpen(true);
    };
    window.addEventListener(OPEN_PALETTE_EVENT, show);
    return () => window.removeEventListener(OPEN_PALETTE_EVENT, show);
  }, []);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  const recent = useMemo(
    () =>
      [...meetings]
        .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
        .slice(0, 6),
    [meetings],
  );
  const trimmed = query.trim();
  const isQuestion = /\?$/.test(trimmed) || trimmed.split(/\s+/).filter(Boolean).length > 3;

  useEffect(() => {
    if (!open || trimmed.length < 3) {
      setSemanticResults([]);
      setSearching(false);
      setPartialSearch(false);
      return;
    }
    let stale = false;
    setSemanticResults([]);
    setSearching(true);
    const timer = setTimeout(() => {
      void invoke<{ sources: SemanticSource[]; partial: boolean }>('desktop_search_query', { query: trimmed })
        .then((result) => {
          if (stale) return;
          setSemanticResults(result.sources ?? []);
          setPartialSearch(result.partial);
          // Solo el tamaño de la búsqueda, nunca el texto.
          void Analytics.track('search_performed', {
            query_length: String(trimmed.length),
            results_count: String(result.sources?.length ?? 0),
            partial: String(Boolean(result.partial)),
          });
        })
        .catch((error) => {
          if (!stale) console.warn('Semantic palette search failed:', error);
        })
        .finally(() => {
          if (!stale) setSearching(false);
        });
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [open, trimmed]);

  const askItem = trimmed.length > 2 && (
    <CommandGroup heading={t('palette.ask')} forceMount>
      <CommandItem forceMount value={`ask ${trimmed}`} onSelect={() => run(() => router.push(`/ask?q=${encodeURIComponent(trimmed)}`))}>
        <Sparkles className="text-brand" />
        <span className="truncate">{t('palette.askItem').replace('{q}', trimmed)}</span>
      </CommandItem>
    </CommandGroup>
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <VisuallyHidden>
        <DialogTitle>{t('nav.search')}</DialogTitle>
      </VisuallyHidden>
      <CommandInput placeholder={t('palette.placeholder')} value={query} onValueChange={setQuery} />
      <CommandList className="max-h-[22rem]">
        <CommandEmpty>{t('palette.empty')}</CommandEmpty>
        {isQuestion && askItem}
        {trimmed.length > 2 && (
          <CommandGroup heading={partialSearch ? t('palette.textResults') : t('palette.semanticResults')} forceMount>
            {searching && (
              <CommandItem disabled forceMount value="searching local index">
                <Sparkles className="animate-pulse text-brand" />
                <span>{t('palette.searching')}</span>
              </CommandItem>
            )}
            {semanticResults.map((source) => (
              <CommandItem
                key={source.id}
                forceMount
                value={`${trimmed} ${source.title} ${source.text}`}
                onSelect={() => run(() => {
                  if (!source.meetingId) return;
                  setCurrentMeeting({ id: source.meetingId, title: source.title });
                  const fromSummary = /:s\d+$/.test(source.id);
                  router.push(`/meeting-details?id=${encodeURIComponent(source.meetingId)}${fromSummary ? '' : `&sourceTime=${source.start}`}`);
                })}
              >
                <FileText />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{source.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{source.text}</span>
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {/:s\d+$/.test(source.id)
                    ? t('library.fromSummary')
                    : `${Math.floor(source.start / 60)}:${String(Math.floor(source.start % 60)).padStart(2, '0')}`}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading={trimmed ? t('palette.meetings') : t('palette.recent')}>
          {(trimmed ? meetings : recent).map((meeting) => (
            <CommandItem
              key={meeting.id}
              value={`${meeting.title} ${meeting.client ?? ''} ${meeting.project ?? ''} ${(meeting.tags ?? []).join(' ')}`}
              onSelect={() =>
                run(() => {
                  setCurrentMeeting(meeting);
                  router.push(`/meeting-details?id=${encodeURIComponent(meeting.id)}`);
                })
              }
            >
              <FileText />
              <span className="min-w-0 flex-1 truncate">{meeting.title}</span>
              {(meeting.client || meeting.project) && (
                <span className="truncate text-xs text-muted-foreground">
                  {[meeting.client, meeting.project].filter(Boolean).join(' / ')}
                </span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading={t('palette.go')}>
          <CommandItem value={`${t('nav.home')} home`} onSelect={() => run(() => router.push('/'))}>
            <Home /> {t('nav.home')}
          </CommandItem>
          <CommandItem value={`${t('nav.library')} library`} onSelect={() => run(() => router.push('/library'))}>
            <Library /> {t('nav.library')}
          </CommandItem>
          <CommandItem value={`${t('nav.recordLive')} record`} onSelect={() => run(handleRecordingToggle)}>
            <Mic /> {t('recording.start')}
          </CommandItem>
          <CommandItem value={`${t('palette.theme')} theme`} onSelect={() => run(() => setTheme(theme === 'dark' ? 'light' : 'dark'))}>
            <Moon /> {t('palette.theme')}
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading={t('palette.settings')}>
          <CommandItem value={`${t('nav.settings')} settings`} onSelect={() => run(() => router.push('/settings'))}>
            <Settings /> {t('nav.settings')}
          </CommandItem>
          <CommandItem value={`${t('palette.models')} models api keys`} onSelect={() => run(() => router.push('/settings'))}>
            <Cpu /> {t('palette.models')}
          </CommandItem>
          <CommandItem value={`${t('palette.transcription')} transcription`} onSelect={() => run(() => router.push('/settings'))}>
            <Waves /> {t('palette.transcription')}
          </CommandItem>
          <CommandItem value="coach" onSelect={() => run(assistant.toggle)}>
            <Lightbulb /> Coach
          </CommandItem>
        </CommandGroup>
        {!isQuestion && askItem}
      </CommandList>
      <div className="flex items-center gap-4 border-t border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd>{t('palette.navigate')}</span>
        <span className="inline-flex items-center gap-1"><Kbd>Enter</Kbd>{t('palette.open')}</span>
        <span className="ml-auto hidden sm:inline">{t('palette.footer')}</span>
      </div>
    </CommandDialog>
  );
}
