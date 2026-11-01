'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Library, Mic, Monitor, Moon, Settings, Sparkles, Square, Sun, Home, Info as InfoIcon } from 'lucide-react';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';
import { useRecordingState } from '@/contexts/RecordingStateContext';
import { useTranslation, useUiPreferences, type ThemePreference } from '@/contexts/UiPreferencesContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import { AboutDialogContent } from '@/components/About';
import { cn } from '@/lib/utils';
import Analytics from '@/lib/analytics';
import Image from 'next/image';

export const OPEN_PALETTE_EVENT = 'meetpulse-open-palette';

type RailButtonProps = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  active?: boolean;
  recording?: boolean;
  disabled?: boolean;
};

function RailButton({ label, icon: Icon, onClick, active, recording, disabled }: RailButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors',
            'hover:bg-muted hover:text-foreground disabled:cursor-not-allowed',
            active && 'bg-accent text-accent-foreground',
            recording && 'bg-recording text-recording-foreground hover:bg-recording/90 hover:text-recording-foreground',
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

// Riel de navegación de 56 px (Quiet Studio v2). Reemplaza la barra lateral con el árbol de reuniones:
// ese árbol vive ahora en la Biblioteca.
export default function Rail() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const { theme, setTheme } = useUiPreferences();
  const { handleRecordingToggle } = useSidebar();
  const { isRecording } = useRecordingState();

  // El tray de Rust llama a window.openSettings
  useEffect(() => {
    (window as unknown as { openSettings?: () => void }).openSettings = () => router.push('/settings');
    return () => {
      delete (window as unknown as { openSettings?: () => void }).openSettings;
    };
  }, [router]);

  // Ctrl+K abre la paleta y Ctrl+J abre Preguntar
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'k') {
        event.preventDefault();
        void Analytics.track('shortcut_used', { shortcut: 'ctrl_k' });
        window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
      } else if (key === 'j') {
        event.preventDefault();
        void Analytics.track('shortcut_used', { shortcut: 'ctrl_j' });
        router.push('/ask');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  const themeCycle: Record<ThemePreference, ThemePreference> = { system: 'light', light: 'dark', dark: 'system' };
  const ThemeIcon = theme === 'system' ? Monitor : theme === 'light' ? Sun : Moon;
  const themeName = theme === 'system' ? t('nav.themeSystem') : theme === 'light' ? t('nav.themeLight') : t('nav.themeDark');

  return (
    <TooltipProvider delayDuration={150}>
      <nav
        aria-label="MeetPulse"
        className="desktop-rail flex h-dvh min-h-0 w-14 flex-col items-center gap-1 border-r border-border bg-card py-3"
      >
        <Dialog>
          <DialogTrigger asChild>
            <button type="button" aria-label="MeetPulse" title="MeetPulse" className="mb-3 rounded-lg transition-opacity hover:opacity-80">
              <Image src="/icon.png" alt="MeetPulse" width={30} height={30} priority />
            </button>
          </DialogTrigger>
          <AboutDialogContent />
        </Dialog>

        <RailButton label={t('nav.home')} icon={Home} active={pathname === '/'} onClick={() => router.push('/')} />
        <RailButton label={t('nav.library')} icon={Library} active={pathname === '/library' || pathname === '/meeting-details'} onClick={() => router.push('/library')} />
        <RailButton label={t('nav.askShortcut')} icon={Sparkles} active={pathname === '/ask'} onClick={() => router.push('/ask')} />
        <RailButton
          label={isRecording ? t('home.ready') : t('nav.recordLive')}
          icon={isRecording ? Square : Mic}
          recording={isRecording}
          disabled={isRecording}
          onClick={handleRecordingToggle}
        />

        <div className="mt-auto flex flex-col items-center gap-1">
          <RailButton label={`${t('nav.theme')}: ${themeName}`} icon={ThemeIcon} onClick={() => setTheme(themeCycle[theme])} />
          <RailButton label={t('nav.settings')} icon={Settings} active={pathname === '/settings'} onClick={() => router.push('/settings')} />
          <Dialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <DialogTrigger asChild>
                  <button type="button" aria-label={t('nav.about')} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                    <InfoIcon className="h-[18px] w-[18px]" />
                  </button>
                </DialogTrigger>
              </TooltipTrigger>
              <TooltipContent side="right">{t('nav.about')}</TooltipContent>
            </Tooltip>
            <AboutDialogContent />
          </Dialog>
        </div>
      </nav>
    </TooltipProvider>
  );
}
