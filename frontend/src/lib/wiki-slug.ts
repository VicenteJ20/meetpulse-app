const WIKI_ID_RE = /^[A-Za-z0-9_-]+$/;

/** Slug used for wiki client/project IDs. Matches the API identifier alphabet. */
export function slugifyWikiId(value: string): string {
  const withoutMarks = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\p{M}+/gu, '');
  return withoutMarks.replace(/[^a-z0-9_]+/g, '-').replace(/^-+|-+$/g, '');
}

export function isValidWikiId(value: string): boolean {
  return WIKI_ID_RE.test(value.trim());
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function withMeetingFrontMatter(markdown: string, meetingId: string): string {
  const trimmed = markdown.replace(/^\uFEFF/, '');
  if (!trimmed.startsWith('---')) {
    return `---\nmeeting_id: ${meetingId}\n---\n\n${trimmed}`;
  }
  const close = trimmed.search(/\r?\n---\s*(?:\r?\n|$)/);
  if (close === -1) {
    return `---\nmeeting_id: ${meetingId}\n---\n\n${trimmed}`;
  }
  const frontMatter = trimmed.slice(4, close);
  if (/(^|\n)meeting_id\s*:/m.test(frontMatter)) {
    return trimmed;
  }
  const closer = trimmed.slice(close).match(/^\r?\n---\s*/)?.[0] ?? '\n---\n';
  return `---\nmeeting_id: ${meetingId}\n${frontMatter.replace(/^\r?\n/, '')}${closer}${trimmed.slice(close + closer.length)}`;
}
