import { invoke } from '@tauri-apps/api/core';
import { load } from '@tauri-apps/plugin-store';
import Analytics from '@/lib/analytics';
import { APP_VERSION } from '@/config/app';

// Se conserva el nombre de la clave para no perder la decisión de quien ya la tomó.
export const ANALYTICS_DECISION_KEY = 'analyticsDefaultOffMigrationV1';

/** Guarda la decisión de analítica y la aplica: inicializa la sesión o la apaga. */
export async function persistAnalyticsConsent(enabled: boolean): Promise<void> {
  const store = await load('analytics.json', {
    autoSave: false,
    defaults: { analyticsOptedIn: false },
  });
  await store.set('analyticsOptedIn', enabled);
  await store.set(ANALYTICS_DECISION_KEY, true);
  await store.save();

  if (enabled) {
    const userId = await Analytics.getPersistentUserId();
    await Analytics.init();
    const deviceInfo = await Analytics.getDeviceInfo();
    await Analytics.identify(userId, {
      app_version: APP_VERSION,
      platform: deviceInfo.platform,
      os_version: deviceInfo.os_version,
      architecture: deviceInfo.architecture,
      first_seen: new Date().toISOString(),
    });
    await Analytics.startSession(userId);
    await invoke('track_analytics_enabled').catch((error) => console.error('Failed to track analytics enabled:', error));
  } else {
    await invoke('track_analytics_disabled').catch((error) => console.error('Failed to track analytics disabled:', error));
    await Analytics.disable();
  }
}

/** Indica si ya hay una decisión guardada (en el primer arranque todavía no la hay). */
export async function hasAnalyticsDecision(): Promise<boolean> {
  const store = await load('analytics.json', {
    autoSave: false,
    defaults: { analyticsOptedIn: false },
  });
  return store.has(ANALYTICS_DECISION_KEY);
}
