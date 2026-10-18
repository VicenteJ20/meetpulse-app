// Preferencias globales del coach y del chat (por dispositivo). El modelo se elige por reunión en el panel.
export interface AssistantDefaults {
  coachOnStart: boolean;
  chatOnStart: boolean;
  cadence: number;
}

const KEY = 'meetpulse-assistant-defaults';
const FALLBACK: AssistantDefaults = { coachOnStart: false, chatOnStart: false, cadence: 60 };

export function loadAssistantDefaults(): AssistantDefaults {
  try {
    return { ...FALLBACK, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return FALLBACK;
  }
}

export function saveAssistantDefaults(value: AssistantDefaults) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {}
}
