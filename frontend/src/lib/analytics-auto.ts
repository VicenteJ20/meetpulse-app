import Analytics, { sanitizeErrorMessage } from '@/lib/analytics';
import { catalogs } from '@/i18n/catalogs';
import { setInvokeReporter } from '@/lib/tauri-core';

/**
 * Central, privacy-safe coverage for the whole app (only active while the user is opted in).
 *
 * - Feature usage: a curated list of meaningful controls (assistant, coach, library, exports...)
 *   reported as `feature_used`. A control is matched only when its label is exactly one of the app's
 *   own translated strings, so typed text, meeting titles or model names can never leak through here.
 * - Backend actions: only user-triggered Tauri commands from an allowlist, with the command name,
 *   result and duration, plus a few allowlisted non-sensitive arguments.
 * - Frontend errors: message with paths and URLs removed.
 */

const SAFE_ARGS: Record<string, string[]> = {
  api_save_transcript_config: ['provider', 'model'],
  api_save_model_config: ['provider', 'model', 'whisperModel'],
  api_save_chat_model_config: ['provider', 'model'],
  api_save_api_key: ['provider'],
  api_delete_api_key: ['provider'],
  api_save_meeting_summary_language: ['language'],
  builtin_ai_download_model: ['modelName'],
  builtin_ai_delete_model: ['modelName'],
  builtin_ai_cancel_download: ['modelName'],
  whisper_download_model: ['modelName'],
  whisper_cancel_download: ['modelName'],
  whisper_delete_corrupted_model: ['modelName'],
  parakeet_download_model: ['modelName'],
  parakeet_retry_download: ['modelName'],
  parakeet_cancel_download: ['modelName'],
  parakeet_delete_corrupted_model: ['modelName'],
  pull_ollama_model: ['modelName'],
  delete_ollama_model: ['modelName'],
  set_audio_backend: ['backend'],
};

/** User-triggered commands. Reads, polling, autosaves and commands that already emit their own event are left out. */
const TRACKED_COMMANDS = new Set<string>([
  ...Object.keys(SAFE_ARGS),
  'api_save_custom_openai_config',
  'api_test_custom_openai_connection',
  'import_and_initialize_database',
  'select_legacy_database_path',
  'select_and_validate_audio_command',
  'trigger_microphone_permission',
  'trigger_system_audio_permission_command',
  'open_system_settings',
  'open_external_url',
  'open_recordings_folder',
  'open_models_folder',
  'open_database_folder',
  'open_parakeet_models_folder',
  'toggle_console',
  'show_console',
  'hide_console',
  'cancel_import_command',
  'cancel_retranscription_command',
  'desktop_assistant_new_chat',
  'desktop_assistant_delete_session',
  'desktop_assistant_dismiss',
  'desktop_assistant_cancel',
  'desktop_assistant_preferences',
  'desktop_test_gemini_audio',
  'cleanup_checkpoints',
]);

const CLICK_TARGETS =
  'button,a[href],[role="button"],[role="tab"],[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"],[role="option"],[role="switch"],[role="checkbox"],[role="radio"]';

/** Translation key of a control -> [feature, area]. Only these are reported; everything else stays silent. */
const FEATURES: Record<string, [string, string]> = {
  'library.filters': ['library_filters_opened', 'library'],
  'library.clearFilters': ['library_filters_cleared', 'library'],
  'library.open': ['library_meeting_opened', 'library'],
  'library.ask': ['library_ask_about_meeting', 'library'],
  'library.askAbout': ['library_ask_about_search', 'library'],
  'home.addContext': ['home_client_project_added', 'home'],
  'home.importAudio': ['home_import_audio_clicked', 'home'],
  'home.coachOpt': ['home_coach_option_selected', 'home'],
  'home.viewLibrary': ['home_open_library', 'home'],
  'meeting.export': ['export_menu_opened', 'meeting'],
  'meeting.searchTranscript': ['transcript_search_opened', 'meeting'],
  'meeting.tabAssistant': ['meeting_assistant_tab_opened', 'meeting'],
  'assistant.tabChat': ['assistant_chat_tab', 'assistant'],
  'assistant.tabCoach': ['assistant_coach_tab', 'assistant'],
  'assistant.coachOn': ['coach_turned_on', 'assistant'],
  'assistant.coachPause': ['coach_paused', 'assistant'],
  'assistant.updateNow': ['coach_manual_update', 'assistant'],
  'assistant.dismiss': ['coach_suggestion_dismissed', 'assistant'],
  'assistant.scopeCurrent': ['assistant_scope_this_meeting', 'assistant'],
  'assistant.scopeAll': ['assistant_scope_all_meetings', 'assistant'],
  'assistant.scopeHistory': ['assistant_scope_client_project', 'assistant'],
  'assistant.enableSearch': ['semantic_search_enable_clicked', 'assistant'],
  'assistant.settings': ['assistant_settings_opened', 'assistant'],
  'chat.newChat': ['chat_new', 'assistant'],
  'chat.stop': ['chat_stopped', 'assistant'],
  'chat.suggest1': ['chat_suggestion_used', 'assistant'],
  'chat.suggest2': ['chat_suggestion_used', 'assistant'],
  'chat.suggest3': ['chat_suggestion_used', 'assistant'],
  'chat.suggest4': ['chat_suggestion_used', 'assistant'],
  'ask.newConversation': ['ask_new_conversation', 'ask'],
  'ask.delete': ['ask_conversation_deleted', 'ask'],
  'ask.rebuild': ['ask_index_rebuilt', 'ask'],
  'ask.indexSettings': ['ask_index_settings_opened', 'ask'],
  'st.change': ['settings_model_change_clicked', 'settings'],
  'st.manageSearch': ['settings_search_setup_clicked', 'settings'],
};

let featureByLabel: Map<string, [string, string]> | null = null;

function featureForLabel(label: string): [string, string] | null {
  if (!featureByLabel) {
    featureByLabel = new Map();
    for (const catalog of [catalogs.en, catalogs.es] as Record<string, string>[]) {
      for (const [key, feature] of Object.entries(FEATURES)) {
        const text = catalog[key];
        if (text && !featureByLabel.has(text)) featureByLabel.set(text, feature);
      }
    }
  }
  return featureByLabel.get(label) ?? null;
}

function labelOf(element: Element): string {
  const raw = element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || '';
  return raw.replace(/\s+/g, ' ').trim();
}

function hostOf(value: unknown): string {
  try {
    return new URL(String(value)).host;
  } catch {
    return 'unknown';
  }
}

export function installAutoAnalytics(): () => void {
  if (typeof window === 'undefined') return () => {};

  const onClick = (event: MouseEvent) => {
    const target = (event.target as Element | null)?.closest?.(CLICK_TARGETS);
    if (!target) return;
    const label = labelOf(target);
    if (!label || label.length > 80) return;
    const match = featureForLabel(label);
    if (!match) return;
    void Analytics.trackFeatureUsedEnhanced(match[0], { area: match[1], route: window.location.pathname });
  };
  document.addEventListener('click', onClick, true);

  setInvokeReporter((cmd, args, success, durationMs) => {
    if (!TRACKED_COMMANDS.has(cmd)) return;
    const values = (args ?? {}) as Record<string, unknown>;
    const properties: Record<string, string> = {
      command: cmd,
      success: String(success),
      duration_ms: String(durationMs),
    };
    for (const field of SAFE_ARGS[cmd] ?? []) {
      const value = values[field];
      if (typeof value === 'string' && value) properties[field] = value;
    }
    if (cmd === 'open_external_url') properties.host = hostOf(values.url);
    void Analytics.track('backend_action', properties);
  });

  const onError = (event: ErrorEvent) => {
    void Analytics.track('frontend_error', {
      kind: 'error',
      message: sanitizeErrorMessage(event.message || 'unknown'),
      route: window.location.pathname,
    });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    void Analytics.track('frontend_error', {
      kind: 'unhandled_rejection',
      message: sanitizeErrorMessage(reason instanceof Error ? reason.message : String(reason ?? 'unknown')),
      route: window.location.pathname,
    });
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  return () => {
    document.removeEventListener('click', onClick, true);
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    setInvokeReporter(null);
  };
}
