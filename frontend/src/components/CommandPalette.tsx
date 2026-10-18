'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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

// Paleta Ctrl+K: reuniones, ajustes, comandos y "Preguntar".
export default function CommandPalette() {
  const router = useRouter();
  const { t } = useTranslation();
  const { theme, setTheme } = useUiPreferences();
  const { meetings, setCurrentMeeting, handleRecordingToggle } = useSidebar();
  const assistant = useAssistant();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

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

  const askItem = trimmed.length > 2 && (
    <CommandGroup heading={t('palette.ask')} forceMount>
      <CommandItem forceMount value={`ask ${trimmed}`} onSelect={() => run(assistant.toggle)}>
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
