export interface WikiConfig {
  baseUrl: string;
  tenantId: string;
}

const STORAGE_KEY = 'meetpulse.wiki.config';
export const DEFAULT_WIKI_CONFIG: WikiConfig = { baseUrl: 'http://localhost:8000', tenantId: '' };

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
