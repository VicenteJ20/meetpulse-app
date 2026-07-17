const TRANSCRIPT_LINE_HEIGHT_PX = 28;
const TRANSCRIPT_ROW_CHROME_PX = 32;
const TRANSCRIPT_ESTIMATED_CHARACTERS_PER_LINE = 90;

/**
 * Returns a conservative initial row height for an unmeasured transcript.
 * React Virtual measures the real DOM node afterwards, but overestimating long
 * chunks prevents following rows from being placed on top of them meanwhile.
 */
export function estimateTranscriptSegmentHeight(text: string): number {
    const estimatedLines = Math.max(
        1,
        Math.ceil(Math.max(1, text.length) / TRANSCRIPT_ESTIMATED_CHARACTERS_PER_LINE)
    );

    return TRANSCRIPT_ROW_CHROME_PX + estimatedLines * TRANSCRIPT_LINE_HEIGHT_PX;
}
