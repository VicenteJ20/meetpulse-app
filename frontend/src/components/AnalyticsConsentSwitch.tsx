import React, { useContext, useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Info, Loader2, Copy, Check } from 'lucide-react';
import { AnalyticsContext } from './AnalyticsProvider';
import { load } from '@tauri-apps/plugin-store';
import { invoke } from '@tauri-apps/api/core';
import { Analytics } from '@/lib/analytics';
import AnalyticsDataModal from './AnalyticsDataModal';
import { APP_VERSION } from '@/config/app';
import { useTranslation } from '@/contexts/UiPreferencesContext';

const ANALYTICS_DEFAULT_OFF_MIGRATION_KEY = 'analyticsDefaultOffMigrationV1';

export default function AnalyticsConsentSwitch({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { setIsAnalyticsOptedIn, isAnalyticsOptedIn } = useContext(AnalyticsContext);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);

  // Note: Store loading is handled by AnalyticsProvider to avoid race conditions

  useEffect(() => {
    const loadUserId = async () => {
      if (isAnalyticsOptedIn) {
        try {
          const id = await Analytics.getPersistentUserId();
          setUserId(id);
        } catch (error) {
          console.error('Failed to load user ID:', error);
        }
      } else {
        setUserId('');
      }
    };
    loadUserId();
  }, [isAnalyticsOptedIn]);

  const handleCopyUserId = async () => {
    if (!userId) return;

    try {
      await navigator.clipboard.writeText(userId);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy user ID:', error);
    }
  };

  const handleToggle = async (enabled: boolean) => {
    // If user is trying to DISABLE, show the modal first
    if (!enabled) {
      setShowModal(true);
      // Track that user viewed the transparency modal
      try {
        await invoke('track_analytics_transparency_viewed');
      } catch (error) {
        console.error('Failed to track transparency view:', error);
      }
      return; // Don't disable yet, wait for modal confirmation
    }

    // If ENABLING, proceed immediately
    await performToggle(enabled);
  };

  const performToggle = async (enabled: boolean) => {
    // Optimistic update - immediately update UI state
    setIsAnalyticsOptedIn(enabled);
    setIsProcessing(true);

    try {
      const store = await load('analytics.json', {
        autoSave: false,
        defaults: {
          analyticsOptedIn: false
        }
      });
      await store.set('analyticsOptedIn', enabled);
      await store.set(ANALYTICS_DEFAULT_OFF_MIGRATION_KEY, true);
      await store.save();

      if (enabled) {
        // Full analytics initialization (same as AnalyticsProvider)
        const userId = await Analytics.getPersistentUserId();

        // Initialize analytics
        await Analytics.init();

        // Identify user with enhanced properties immediately after init
        const deviceInfo = await Analytics.getDeviceInfo();
        await Analytics.identify(userId, {
          app_version: APP_VERSION,
          platform: deviceInfo.platform,
          os_version: deviceInfo.os_version,
          architecture: deviceInfo.architecture,
          first_seen: new Date().toISOString(),
        });

        // Start analytics session with the same user ID
        await Analytics.startSession(userId);

        // Track that user enabled analytics
        try {
          await invoke('track_analytics_enabled');
        } catch (error) {
          console.error('Failed to track analytics enabled:', error);
        }

        console.log('Analytics re-enabled successfully');
      } else {
        // Track that user disabled analytics BEFORE disabling
        try {
          await invoke('track_analytics_disabled');
        } catch (error) {
          console.error('Failed to track analytics disabled:', error);
        }

        await Analytics.disable();
        console.log('Analytics disabled successfully');
      }
    } catch (error) {
      console.error('Failed to toggle analytics:', error);
      // Revert the optimistic update on error
      setIsAnalyticsOptedIn(!enabled);
      // You could also show a toast notification here to inform the user
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmDisable = async () => {
    setShowModal(false);
    await performToggle(false);
  };

  const handleCancelDisable = () => {
    setShowModal(false);
    // Keep analytics enabled, no state change needed
  };

  const [showInfo, setShowInfo] = useState(false);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    invoke<boolean>('analytics_configured').then(setConfigured).catch(() => setConfigured(false));
  }, []);

  return (
    <>
      <div>
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h3 className={compact ? "text-sm font-semibold tracking-tight" : "text-[0.95rem] font-semibold tracking-tight"}>{t('mx.analytics')}</h3>
            <p className={compact ? "mt-0.5 max-w-[62ch] text-xs leading-5 text-muted-foreground" : "mt-1 max-w-[62ch] text-sm text-muted-foreground"}>{t('mx.analyticsDesc')}</p>
          </div>
          <div className="flex items-center gap-2">
            {isProcessing && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
            <Switch checked={isAnalyticsOptedIn} onCheckedChange={handleToggle} disabled={isProcessing || !configured} aria-label={t('mx.enableAnalytics')} />
          </div>
        </div>

        {isAnalyticsOptedIn && userId && (
          <div className={compact ? "mt-3 rounded-lg bg-muted/50 p-3" : "mt-4 rounded-xl border border-border bg-card p-4"}>
            <div className="text-sm font-medium">{t('mx.userId')}</div>
            <p className="mt-1 text-xs text-muted-foreground">{t('mx.userIdDesc')}</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 truncate rounded border border-border bg-muted px-2 py-1 font-mono text-xs">{userId}</code>
              <Button onClick={handleCopyUserId} variant="outline" size="sm" className="shrink-0">
                {isCopied ? <Check className="text-success" /> : <Copy />}
                {isCopied ? t('mx.copied') : t('mx.copy')}
              </Button>
            </div>
          </div>
        )}

        <p className={compact ? "mt-3 flex items-start gap-2 text-xs text-muted-foreground" : "mt-4 flex items-start gap-2 text-xs text-muted-foreground"}>
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {t('mx.privateNote')}{' '}
            <button onClick={() => setShowInfo(true)} className="text-brand hover:underline">{t('mx.privacyPolicy')}</button>
          </span>
        </p>
        {!configured && <p className="mt-2 text-xs text-muted-foreground">{t('mx.notConfigured')}</p>}
      </div>

      {/* 2-Step Opt-Out Modal */}
      <AnalyticsDataModal
        isOpen={showModal}
        onClose={handleCancelDisable}
        onConfirmDisable={handleConfirmDisable}
      />
      <AnalyticsDataModal isOpen={showInfo} onClose={() => setShowInfo(false)} />
    </>
  );
}
