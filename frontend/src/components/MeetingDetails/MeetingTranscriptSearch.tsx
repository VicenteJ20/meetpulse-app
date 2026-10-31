'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { getMeetingTranscript, subscribeMeetingTranscript } from '@/lib/meeting-transcript-bus';

const mmss = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
};

/** Search the open meeting from the side chat and jump to the matching moment. */
export function MeetingTranscriptSearch() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const segments = useSyncExternalStore(subscribeMeetingTranscript, getMeetingTranscript, getMeetingTranscript);
  const needle = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (needle.length < 2) return [];
    return segments.filter((segment) => segment.text.toLowerCase().includes(needle)).slice(0, 6);
  }, [segments, needle]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('meeting.searchTranscript')}
          aria-label={t('meeting.searchTranscript')}
          className="h-8 bg-muted/50 pl-8 pr-8 text-sm"
        />
        {query && (
          <button type="button" aria-label={t('meeting.clearSearch')} onClick={() => setQuery('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {needle.length >= 2 && matches.length === 0 && (
        <p className="px-1 text-xs text-muted-foreground">{t('meeting.noMatches')}</p>
      )}
      {matches.length > 0 && (
        <ul className="grid gap-1">
          {matches.map((segment) => (
            <li key={segment.id}>
              <button
                type="button"
                className="flex w-full gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
                onClick={() => window.dispatchEvent(new CustomEvent('meetpulse-source', { detail: { start: segment.start } }))}
              >
                <span className="shrink-0 font-mono text-[0.7rem] tabular-nums text-muted-foreground">{mmss(segment.start)}</span>
                <span className="line-clamp-2 text-xs text-foreground">{segment.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
