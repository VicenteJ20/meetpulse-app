"use client"

import { useEffect, useState, useRef } from "react"
import { Switch } from "./ui/switch"
import { Check, FolderOpen, Laptop, Moon, Sun } from "lucide-react"
import { invoke } from "@tauri-apps/api/core"
import Analytics from "@/lib/analytics"
import AnalyticsConsentSwitch from "./AnalyticsConsentSwitch"
import { useConfig, NotificationSettings } from "@/contexts/ConfigContext"
import { ThemePreference, UiLocale, useTranslation, useUiPreferences } from "@/contexts/UiPreferencesContext"

export function PreferenceSettings() {
  const { t } = useTranslation();
  const { theme, setTheme, locale, setLocale } = useUiPreferences();
  const {
    notificationSettings,
    storageLocations,
    isLoadingPreferences,
    loadPreferences,
    updateNotificationSettings
  } = useConfig();

  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [previousNotificationsEnabled, setPreviousNotificationsEnabled] = useState<boolean | null>(null);
  const hasTrackedViewRef = useRef(false);

  // Lazy load preferences on mount (only loads if not already cached)
  useEffect(() => {
    loadPreferences();
    // Reset tracking ref on mount (every tab visit)
    hasTrackedViewRef.current = false;
  }, [loadPreferences]);

  // Track preferences viewed analytics on every tab visit (once per mount)
  useEffect(() => {
    if (hasTrackedViewRef.current) return;

    const trackPreferencesViewed = async () => {
      // Wait for notification settings to be available (either from cache or after loading)
      if (notificationSettings) {
        await Analytics.track('preferences_viewed', {
          notifications_enabled: notificationSettings.notification_preferences.show_recording_started ? 'true' : 'false'
        });
        hasTrackedViewRef.current = true;
      } else if (!isLoadingPreferences) {
        // If not loading and no settings available, track with default value
        await Analytics.track('preferences_viewed', {
          notifications_enabled: 'false'
        });
        hasTrackedViewRef.current = true;
      }
    };

    trackPreferencesViewed();
  }, [notificationSettings, isLoadingPreferences]);

  // Update notificationsEnabled when notificationSettings are loaded from global state
  useEffect(() => {
    if (notificationSettings) {
      // Notification enabled means both started and stopped notifications are enabled
      const enabled =
        notificationSettings.notification_preferences.show_recording_started &&
        notificationSettings.notification_preferences.show_recording_stopped;
      setNotificationsEnabled(enabled);
      if (isInitialLoad) {
        setPreviousNotificationsEnabled(enabled);
        setIsInitialLoad(false);
      }
    } else if (!isLoadingPreferences) {
      // If not loading and no settings, use default
      setNotificationsEnabled(true);
      if (isInitialLoad) {
        setPreviousNotificationsEnabled(true);
        setIsInitialLoad(false);
      }
    }
  }, [notificationSettings, isLoadingPreferences, isInitialLoad])

  useEffect(() => {
    // Skip update on initial load or if value hasn't actually changed
    if (isInitialLoad || notificationsEnabled === null || notificationsEnabled === previousNotificationsEnabled) return;
    if (!notificationSettings) return;

    const handleUpdateNotificationSettings = async () => {
      console.log("Updating notification settings to:", notificationsEnabled);

      try {
        // Update the notification preferences
        const updatedSettings: NotificationSettings = {
          ...notificationSettings,
          notification_preferences: {
            ...notificationSettings.notification_preferences,
            show_recording_started: notificationsEnabled,
            show_recording_stopped: notificationsEnabled,
          }
        };

        console.log("Calling updateNotificationSettings with:", updatedSettings);
        await updateNotificationSettings(updatedSettings);
        setPreviousNotificationsEnabled(notificationsEnabled);
        console.log("Successfully updated notification settings to:", notificationsEnabled);

        // Track notification preference change - only fires when user manually toggles
        await Analytics.track('notification_settings_changed', {
          notifications_enabled: notificationsEnabled.toString()
        });
      } catch (error) {
        console.error('Failed to update notification settings:', error);
      }
    };

    handleUpdateNotificationSettings();
  }, [notificationsEnabled, notificationSettings, isInitialLoad, previousNotificationsEnabled, updateNotificationSettings])

  const handleOpenFolder = async (folderType: 'database' | 'models' | 'recordings') => {
    try {
      switch (folderType) {
        case 'database':
          await invoke('open_database_folder');
          break;
        case 'models':
          await invoke('open_models_folder');
          break;
        case 'recordings':
          await invoke('open_recordings_folder');
          break;
      }

      // Track storage folder access
      await Analytics.track('storage_folder_opened', {
        folder_type: folderType
      });
    } catch (error) {
      console.error(`Failed to open ${folderType} folder:`, error);
    }
  };

  // Show loading only if we're actually loading and don't have cached data
  if (isLoadingPreferences && !notificationSettings && !storageLocations) {
    return <div className="py-8 text-sm text-muted-foreground">{t('common.loading')}</div>
  }

  // Show loading if notificationsEnabled hasn't been determined yet
  if (notificationsEnabled === null && !isLoadingPreferences) {
    return <div className="py-8 text-sm text-muted-foreground">{t('common.loading')}</div>
  }

  // Ensure we have a boolean value for the Switch component
  const notificationsEnabledValue = notificationsEnabled ?? false;

  return (
    <div className="divide-y divide-border/70">
      <section className="py-7 first:pt-5">
        <h2 className="text-lg font-semibold">{t('settings.appearance')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('settings.appearanceDescription')}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {([
            ['system', Laptop, t('settings.theme.system')],
            ['light', Sun, t('settings.theme.light')],
            ['dark', Moon, t('settings.theme.dark')],
          ] as [ThemePreference, typeof Laptop, string][]).map(([value, Icon, label]) => (
            <button key={value} onClick={() => setTheme(value)} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${theme === value ? 'border-brand/50 bg-brand/8 text-foreground' : 'border-border hover:bg-muted/50'}`}>
              <Icon className="h-4 w-4 text-muted-foreground" /><span className="flex-1 text-sm font-medium">{label}</span>{theme === value && <Check className="h-4 w-4 text-brand" />}
            </button>
          ))}
        </div>
        <div className="mt-6">
          <h3 className="text-sm font-semibold">{t('settings.language')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t('settings.languageDescription')}</p>
          <div className="mt-3 inline-flex rounded-xl border border-border bg-muted/40 p-1">
            {(['en', 'es'] as UiLocale[]).map(value => <button key={value} onClick={() => setLocale(value)} className={`rounded-lg px-4 py-2 text-sm font-medium transition ${locale === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{t(`settings.language.${value}`)}</button>)}
          </div>
        </div>
      </section>

      {/* Notifications Section */}
      <section className="flex items-center justify-between gap-6 py-7">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">{t('settings.notifications')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t('settings.notificationsDescription')}</p>
          </div>
        </div>
        <Switch checked={notificationsEnabledValue} onCheckedChange={setNotificationsEnabled} />
      </section>

      {/* Data Storage Locations Section */}
      <section className="py-7">
        <h3 className="text-lg font-semibold">{t('settings.recordingsLocation')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t('settings.storageDescription')}</p>

        <div className="space-y-4">
          {/* Database Location */}
          {/* <div className="p-4 border rounded-lg bg-muted/50">
            <div className="font-medium mb-2">Database</div>
            <div className="text-sm text-muted-foreground mb-3 break-all font-mono text-xs">
              {storageLocations?.database || 'Loading...'}
            </div>
            <button
              onClick={() => handleOpenFolder('database')}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
              Open Folder
            </button>
          </div> */}

          {/* Models Location */}
          {/* <div className="p-4 border rounded-lg bg-muted/50">
            <div className="font-medium mb-2">Whisper Models</div>
            <div className="text-sm text-muted-foreground mb-3 break-all font-mono text-xs">
              {storageLocations?.models || 'Loading...'}
            </div>
            <button
              onClick={() => handleOpenFolder('models')}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
              Open Folder
            </button>
          </div> */}

          {/* Recordings Location */}
          <div className="mt-5 rounded-xl border border-border bg-muted/35 p-4">
            <div className="text-sm font-medium">{t('settings.recordingsLocation')}</div>
            <div className="mb-3 mt-2 break-all font-mono text-xs text-muted-foreground">
              {storageLocations?.recordings || 'Loading...'}
            </div>
            <button
              onClick={() => handleOpenFolder('recordings')}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
              {t('settings.openFolder')}
            </button>
          </div>
        </div>
      </section>

      {/* Analytics Section */}
      <section className="py-7">
        <AnalyticsConsentSwitch />
      </section>
    </div>
  )
}
