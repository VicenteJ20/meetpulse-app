/** Price and review labels for the provider catalog. The JSON only annotates model ids. */

export function formatUsd(value) {
  if (!Number.isFinite(value)) return '';
  if (value === 0) return '$0';
  const abs = Math.abs(value);
  const digits = abs >= 0.01 ? 2 : 4;
  return `$${value.toFixed(digits)}`;
}

/** USD per token, shown as USD per million tokens. */
export function formatTokenPrice(raw) {
  if (raw == null || String(raw).trim() === '') return '';
  const value = Number(raw);
  if (!Number.isFinite(value)) return '';
  return formatUsd(value * 1_000_000);
}

/** USD per second of audio, shown as USD per hour. */
export function formatHourlyPrice(perSecond) {
  if (perSecond == null || String(perSecond).trim() === '') return '';
  const value = Number(perSecond);
  if (!Number.isFinite(value)) return '';
  return formatUsd(value * 3600);
}

/** all is a full check, some is partial, anything else is empty. */
export function complianceMark(flag) {
  if (flag === 'all') return 'check';
  if (flag === 'some') return 'partial';
  return 'empty';
}

export function reviewStatus(entry) {
  if (!entry || typeof entry !== 'object') {
    return { tested: false, transcription: false, analysis: false, chat: false };
  }
  return {
    tested: true,
    transcription: entry.transcription === true,
    analysis: entry.analysis === true,
    chat: entry.chat === true,
  };
}

export function reviewLabel(entry, language = 'en') {
  const status = reviewStatus(entry);
  if (!status.tested) return language === 'es' ? 'Sin probar' : 'Not tested';
  return language === 'es' ? 'Probado' : 'Tested';
}
