/** Product capabilities. Re-enable Wiki here; it intentionally has no user-facing toggle. */
export const desktopCapabilities = Object.freeze({ wikiEnabled: false as boolean });

export function requireWikiEnabled(): void {
  if (!desktopCapabilities.wikiEnabled) throw new Error('Wiki integration is disabled in this desktop build.');
}
