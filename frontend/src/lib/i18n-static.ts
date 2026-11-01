import { catalogs, type TranslationKey } from '@/i18n/catalogs';
import { withAssistant } from '@/config/brand';

const LOCALE_KEY = 'meetpulse-ui-locale';

function currentLocale(): 'en' | 'es' {
  try {
    const stored = window.localStorage.getItem(LOCALE_KEY);
    if (stored === 'es' || stored === 'en') return stored;
  } catch {
    // Sin acceso al almacenamiento: se usa el idioma del sistema.
  }
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en';
}

/**
 * Traduce fuera de componentes (hooks, contextos, avisos). Lee el idioma elegido en la interfaz y
 * reemplaza los marcadores `{nombre}` con `vars`.
 */
export function tStatic(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text = withAssistant(catalogs[currentLocale()][key]);
  if (vars) {
    for (const [name, value] of Object.entries(vars)) text = text.split(`{${name}}`).join(String(value));
  }
  return text;
}
