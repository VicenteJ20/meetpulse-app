import React, { useState, useEffect } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import Image from 'next/image';
import { CheckCircle2, ExternalLink, FolderKanban, Layers, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import AnalyticsConsentSwitch from './AnalyticsConsentSwitch';
import { UpdateDialog } from './UpdateDialog';
import { Button } from './ui/button';
import { DialogContent, DialogTitle } from './ui/dialog';
import { VisuallyHidden } from './ui/visually-hidden';
import { updateService, UpdateInfo } from '@/services/updateService';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { APP_VERSION } from '@/config/app';

const REPOSITORY_URL = 'https://github.com/VicenteJ20/meetpulse-app';

const PILLARS = [
  { icon: ShieldCheck, title: 'about.p1Title', body: 'about.p1Body' },
  { icon: Layers, title: 'about.p2Title', body: 'about.p2Body' },
  { icon: FolderKanban, title: 'about.p3Title', body: 'about.p3Body' },
  { icon: Sparkles, title: 'about.p4Title', body: 'about.p4Body' },
] as const;

/** Contenido del diálogo "Acerca de": ancho para aprovechar el espacio y sin barra de desplazamiento habitual. */
export function AboutDialogContent() {
  const { t } = useTranslation();
  return (
    <DialogContent className="max-w-[44rem] gap-0 overflow-hidden p-0">
      <VisuallyHidden>
        <DialogTitle>{t('nav.about')}</DialogTitle>
      </VisuallyHidden>
      <About />
    </DialogContent>
  );
}

export function About() {
  const { t } = useTranslation();
  const [currentVersion, setCurrentVersion] = useState<string>(APP_VERSION);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [upToDate, setUpToDate] = useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);

  useEffect(() => {
    getVersion().then(setCurrentVersion).catch(console.error);
  }, []);

  const handleCheckForUpdates = async () => {
    setIsChecking(true);
    setUpToDate(false);
    try {
      const info = await updateService.checkForUpdates(true);
      setUpdateInfo(info);
      if (info.available) setShowUpdateDialog(true);
      else setUpToDate(true);
    } catch (error) {
      console.error('Failed to check for updates:', error);
      toast.error(t('about.updateFailed'));
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="custom-scrollbar max-h-[calc(100dvh-2rem)] overflow-y-auto">
      <header className="relative flex items-center gap-4 overflow-hidden border-b border-border bg-gradient-to-br from-brand/12 via-brand/5 to-transparent px-6 py-5 pr-14">
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-brand/10 blur-2xl" />
        <Image src="/icon.png" alt="" width={56} height={56} priority className="relative size-14 shrink-0 rounded-[1.1rem] shadow-sm ring-1 ring-border" />
        <div className="relative min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="text-xl font-semibold tracking-[-0.03em]">{t('app.name')}</h1>
            <span className="rounded-full bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-border">v{currentVersion}</span>
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">{t('about.openSource')}</span>
          </div>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">{t('about.tagline')}</p>
        </div>
        <div className="relative flex shrink-0 flex-col items-end gap-1.5">
          <Button variant="outline" size="sm" onClick={handleCheckForUpdates} disabled={isChecking}>
            {isChecking ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            {isChecking ? t('about.checking') : t('about.checkUpdates')}
          </Button>
          {updateInfo?.available && (
            <span className="text-xs font-medium text-brand">{t('about.updateAvailable').replace('{v}', updateInfo.version ?? '')}</span>
          )}
          {upToDate && <span role="status" className="text-xs text-muted-foreground">{t('about.upToDate')}</span>}
        </div>
      </header>

      <ul className="grid gap-3 px-6 pt-5 sm:grid-cols-2">
        {PILLARS.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex items-start gap-3 rounded-xl border border-border bg-background/60 p-3.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
              <Icon className="size-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold leading-5">{t(title)}</h2>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{t(body)}</p>
            </div>
          </li>
        ))}
      </ul>

      <section className="mx-6 mt-4 rounded-xl border border-border p-4">
        <AnalyticsConsentSwitch compact />
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 px-6 pb-5 pt-4 text-xs text-muted-foreground">
        <span>{t('about.license')}</span>
        <button
          type="button"
          onClick={() => invoke('open_external_url', { url: REPOSITORY_URL }).catch(console.error)}
          className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
        >
          {t('about.sourceCode')} <ExternalLink className="size-3" />
        </button>
      </footer>

      <UpdateDialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog} updateInfo={updateInfo} />
    </div>
  );
}
