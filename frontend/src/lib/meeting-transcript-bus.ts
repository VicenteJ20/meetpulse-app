export type MeetingTranscriptHit = { id: string; text: string; start: number };

let current: MeetingTranscriptHit[] = [];
const listeners = new Set<() => void>();

/** The open meeting publishes its transcript so the side chat can search it. */
export function publishMeetingTranscript(items: MeetingTranscriptHit[]) {
  current = items;
  listeners.forEach((listener) => listener());
}

export function subscribeMeetingTranscript(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMeetingTranscript() {
  return current;
}
