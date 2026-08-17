export interface WikiConfig {
  baseUrl: string;
  tenantId: string;
}

const STORAGE_KEY = 'meetpulse.wiki.config';
const DEFAULT_WIKI_API_URL = 'https://meetpulse-wiki.vercel.app';

export const DEFAULT_WIKI_CONFIG: WikiConfig = {
  baseUrl: (process.env.NEXT_PUBLIC_WIKI_API_URL || DEFAULT_WIKI_API_URL).trim().replace(/\/$/, ''),
  tenantId: '',
};

export function getWikiConfig(): WikiConfig {
  if (typeof window === 'undefined') return DEFAULT_WIKI_CONFIG;
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}') as Partial<WikiConfig>;
    return {
      baseUrl: saved.baseUrl?.trim() || DEFAULT_WIKI_CONFIG.baseUrl,
      tenantId: saved.tenantId?.trim() || '',
    };
  } catch {
    return DEFAULT_WIKI_CONFIG;
  }
}

export function saveWikiConfig(config: WikiConfig): WikiConfig {
  const next = { baseUrl: config.baseUrl.trim().replace(/\/$/, ''), tenantId: config.tenantId.trim() };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent<WikiConfig>('wiki-config-changed', { detail: next }));
  return next;
}

export interface WikiLastDestination {
  tenantId: string;
  clientId: string;
  projectId: string;
}

const LAST_DESTINATION_KEY = 'meetpulse.wiki.lastDestination';

export function getWikiLastDestination(): WikiLastDestination | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = JSON.parse(window.localStorage.getItem(LAST_DESTINATION_KEY) || 'null') as Partial<WikiLastDestination> | null;
    if (!saved?.tenantId || !saved.clientId || !saved.projectId) return null;
    return { tenantId: saved.tenantId, clientId: saved.clientId, projectId: saved.projectId };
  } catch {
    return null;
  }
}

export function saveWikiLastDestination(destination: WikiLastDestination): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LAST_DESTINATION_KEY, JSON.stringify(destination));
}
