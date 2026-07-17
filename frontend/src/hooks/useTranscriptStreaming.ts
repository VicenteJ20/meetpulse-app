import { useEffect, useRef, useState } from 'react';
import { TranscriptSegmentData } from '@/types';

const HIGHLIGHT_DURATION_MS = 450;

/**
 * Highlights a newly arrived transcript without changing its geometry.
 *
 * Gemini delivers complete chunks. Revealing those chunks character by
 * character repeatedly changes line wrapping and can leave virtual rows with
 * stale measurements during a long recording.
 */
export function useTranscriptStreaming(
  segments: TranscriptSegmentData[],
  isRecording: boolean,
  enableStreaming: boolean
) {
  const [streamingSegmentId, setStreamingSegmentId] = useState<string | null>(null);
  const lastSegmentIdRef = useRef<string | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSegmentId = segments.at(-1)?.id ?? null;

  useEffect(() => {
    if (!isRecording || !enableStreaming || !latestSegmentId) {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
      setStreamingSegmentId(null);
      lastSegmentIdRef.current = null;
      return;
    }

    if (latestSegmentId !== lastSegmentIdRef.current) {
      lastSegmentIdRef.current = latestSegmentId;
      setStreamingSegmentId(latestSegmentId);

      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = setTimeout(() => {
        setStreamingSegmentId(null);
        highlightTimeoutRef.current = null;
      }, HIGHLIGHT_DURATION_MS);
    }

    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
    };
  }, [latestSegmentId, isRecording, enableStreaming]);

  return {
    streamingSegmentId,
    getDisplayText: (segment: TranscriptSegmentData): string => segment.text,
  };
}
