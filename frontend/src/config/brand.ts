// Nombre del asistente en la interfaz (chat y coach). Cambiarlo aquí lo actualiza en todas las pantallas:
// los textos traducibles usan el marcador {assistant}.
export const ASSISTANT_NAME = 'Meety';

export const withAssistant = (text: string): string => text.split('{assistant}').join(ASSISTANT_NAME);
