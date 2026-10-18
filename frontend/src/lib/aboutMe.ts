// "Sobre mí": descripción libre del usuario que alimenta los análisis (resumen, coach y chat).
// Se guarda por dispositivo, igual que las preferencias del asistente.
const KEY = 'meetpulse-about-me';
export const ABOUT_ME_MAX = 1200;

export function loadAboutMe(): string {
  try {
    return (localStorage.getItem(KEY) ?? '').slice(0, ABOUT_ME_MAX);
  } catch {
    return '';
  }
}

export function saveAboutMe(value: string) {
  try {
    localStorage.setItem(KEY, value.slice(0, ABOUT_ME_MAX));
  } catch {}
}

/** Texto para anteponer a un prompt de análisis. Vacío si el usuario no escribió nada. */
export function aboutMePrompt(): string {
  const about = loadAboutMe().trim();
  return about
    ? `About the user (the person who recorded this meeting; "[Usuario]" lines in the transcript are them, "[Equipo]" lines are the other participants): ${about}`
    : '';
}
