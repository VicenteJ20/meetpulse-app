import React, { useState, useEffect } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import Image from 'next/image';
import { CheckCircle2, FolderKanban, Layers, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import AnalyticsConsentSwitch from './AnalyticsConsentSwitch';
import { UpdateDialog } from './UpdateDialog';
import { Button } from './ui/button';
import { updateService, UpdateInfo } from '@/services/updateService';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { APP_VERSION } from '@/config/app';

const PILLARS = [
  { icon: ShieldCheck, title: 'about.p1Title', body: 'about.p1Body' },
  { icon: Layers, title: 'about.p2Title', body: 'about.p2Body' },
  { icon: FolderKanban, title: 'about.p3Title', body: 'about.p3Body' },
  { icon: Sparkles, title: 'about.p4Title', body: 'about.p4Body' },
] as const;

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
    <div className="custom-scrollbar -mr-2 max-h-[calc(100dvh-6rem)] space-y-6 overflow-y-auto pr-2">
      <header className="flex items-center gap-4">
        <Image src="/icon.png" alt="" width={56} height={56} priority className="rounded-2xl" />
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h1 className="text-xl font-semibold tracking-[-0.03em]">{t('app.name')}</h1>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">v{currentVersion}</span>
          </div>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('about.tagline')}</p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={handleCheckForUpdates} disabled={isChecking}>
          {isChecking ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
          {isChecking ? t('about.checking') : t('about.checkUpdates')}
        </Button>
        {updateInfo?.available && (
          <span className="text-sm font-medium text-brand">{t('about.updateAvailable').replace('{v}', updateInfo.version ?? '')}</span>
        )}
        {upToDate && <span role="status" className="text-sm text-muted-foreground">{t('about.upToDate')}</span>}
      </div>

      <ul className="divide-y divide-border rounded-xl border border-border">
        {PILLARS.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex items-start gap-3.5 p-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
              <Icon className="size-[18px]" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">{t(title)}</h2>
              <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{t(body)}</p>
            </div>
          </li>
        ))}
      </ul>

      <section className="border-t border-border pt-5">
        <AnalyticsConsentSwitch />
      </section>

      <p className="text-xs text-muted-foreground">{t('about.license')}</p>

      <UpdateDialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog} updateInfo={updateInfo} />
    </div>
  );
}
