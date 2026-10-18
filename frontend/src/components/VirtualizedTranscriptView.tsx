'use client';

import { useTranslation } from '@/contexts/UiPreferencesContext';
import { useRef, useEffect, useState, memo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import { useTranscriptStreaming } from "@/hooks/useTranscriptStreaming";
import { ConfidenceIndicator } from "./ConfidenceIndicator";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { motion } from "framer-motion";
import { Mic, Users } from "lucide-react";
import { TranscriptSegmentData } from "@/types";
import { estimateTranscriptSegmentHeight } from "@/lib/transcriptLayout";

export interface VirtualizedTranscriptViewProps {
    /** Transcript segments to display */
    segments: TranscriptSegmentData[];
    /** Whether recording is in progress */
    isRecording?: boolean;
    /** Whether recording is paused */
    isPaused?: boolean;
    /** Whether processing/finalizing transcription */
    isProcessing?: boolean;
    /** Whether stopping */
    isStopping?: boolean;
    /** Enable streaming effect for latest segment */
    enableStreaming?: boolean;
    /** Show confidence indicators */
    showConfidence?: boolean;
    /** Completely disable auto-scroll behavior (for meeting details page) */
    disableAutoScroll?: boolean;

    // Pagination props (infinite scroll)
    hasMore?: boolean;
    isLoadingMore?: boolean;
    totalCount?: number;
    loadedCount?: number;
    onLoadMore?: () => void;
}

// Use one layout model for every non-empty transcript. Switching from normal
// flow to absolute virtual rows mid-recording causes visible position jumps.
const VIRTUALIZATION_THRESHOLD = 1;

// Helper function to format seconds as recording-relative time [MM:SS]
function formatRecordingTime(seconds: number | undefined): string {
    if (seconds === undefined) return '--:--';

    const totalSeconds = Math.floor(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;

    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Helper function to remove filler words and repetitions
function cleanStopWords(text: string): string {
    const stopWords = ['uh', 'um', 'er', 'ah', 'hmm', 'hm', 'eh', 'oh'];

    let cleanedText = text;
    stopWords.forEach(word => {
        const pattern = new RegExp(`\\b${word}\\b[,\\s]*`, 'gi');
        cleanedText = cleanedText.replace(pattern, ' ');
    });

    return cleanedText.replace(/\s+/g, ' ').trim();
}

// Memoized transcript segment component
const TranscriptSegment = memo(function TranscriptSegment({
    id,
    timestamp,
    text,
    confidence,
    isStreaming,
    showConfidence,
    speakerLabel,
}: {
    id: string;
    timestamp: number;
    text: string;
    confidence?: number;
    isStreaming: boolean;
    showConfidence: boolean;
    speakerLabel?: { text: string; source: string; me: boolean; first: boolean };
}) {
    const displayText = cleanStopWords(text) || (text.trim() === '' ? '[Silence]' : text);

    return (
        <div id={`segment-${id}`} className="pb-3">
            {speakerLabel && (
                <div className={`flex items-center gap-2 pb-1.5 text-sm font-semibold ${speakerLabel.first ? 'pt-1' : 'mt-3 border-t border-border pt-4'}`}>
                    <span className={`grid size-[22px] place-items-center rounded-full text-[0.6rem] font-semibold ${speakerLabel.me ? 'bg-accent text-brand' : 'bg-muted text-muted-foreground'}`}>
                        {speakerLabel.me ? <Mic className="size-3" /> : <Users className="size-3" />}
                    </span>
                    {speakerLabel.text}
                    <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">{speakerLabel.source}</span>
                </div>
            )}
            <div className="flex items-start gap-2">
                <Tooltip>
                    <TooltipTrigger>
                        <span className="mt-1.5 min-w-[50px] flex-shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                            {formatRecordingTime(timestamp)}
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>
                        {confidence !== undefined && showConfidence && (
                            <ConfidenceIndicator confidence={confidence} showIndicator={showConfidence} />
                        )}
                    </TooltipContent>
                </Tooltip>
                <div className="min-w-0 flex-1">
                    <div
                        className={`rounded-lg border px-3 py-2 transition-colors duration-300 ${
                            isStreaming
                                ? 'border-border bg-muted/70'
                                : 'border-transparent bg-transparent'
                        }`}
                    >
                        <p className="break-words text-[0.95rem] leading-relaxed text-foreground">{displayText}</p>
                    </div>
                </div>
            </div>
        </div>
    );
});

export const VirtualizedTranscriptView: React.FC<VirtualizedTranscriptViewProps> = ({
    segments,
    isRecording = false,
    isPaused = false,
    isProcessing = false,
    isStopping = false,
    enableStreaming = false,
    showConfidence = true,
    disableAutoScroll = false,
    hasMore = false,
    isLoadingMore = false,
    totalCount = 0,
    loadedCount = 0,
    onLoadMore,
}) => {
    // Create scroll ref first - shared between virtualizer and auto-scroll hook
    const scrollRef = useRef<HTMLDivElement>(null);
    // Ref for infinite scroll trigger element
    const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

    // Setup virtualizer for efficient rendering of large lists
    const virtualizer = useVirtualizer({
        count: segments.length,
        getScrollElement: () => scrollRef.current,
        getItemKey: (index) => segments[index]?.id ?? index,
        estimateSize: (index) => estimateTranscriptSegmentHeight(segments[index]?.text ?? ''),
        overscan: 10, // Render extra items above/below viewport
    });

    // Custom hook for auto-scrolling (supports both virtualized and non-virtualized)
    const { autoScroll, scrollToBottom } = useAutoScroll({
        scrollRef,
        segments,
        isRecording,
        isPaused,
        virtualizer,
        virtualizationThreshold: VIRTUALIZATION_THRESHOLD,
        disableAutoScroll,
    });

    const { t } = useTranslation();
    // El rótulo solo se muestra cuando cambia quien habla
    const labelFor = (segment: TranscriptSegmentData, previous?: TranscriptSegmentData) =>
        segment.speaker && segment.speaker !== previous?.speaker
            ? {
                text: t(segment.speaker === 'me' ? 'transcript.me' : 'transcript.team'),
                source: t(segment.speaker === 'me' ? 'transcript.micSource' : 'transcript.systemSource'),
                me: segment.speaker === 'me',
                first: !previous,
            }
            : undefined;
    const [sourceTime, setSourceTime] = useState<number | null>(() => {
        if (typeof window === 'undefined') return null;
        const raw = new URLSearchParams(window.location.search).get('sourceTime');
        return raw !== null && Number.isFinite(Number(raw)) ? Number(raw) : null;
    });
    const [highlight, setHighlight] = useState('');
    useEffect(() => {
        const onSource = (event: Event) => setSourceTime((event as CustomEvent<{start: number}>).detail.start);
        window.addEventListener('meetpulse-source', onSource);
        return () => window.removeEventListener('meetpulse-source', onSource);
    }, []);
    useEffect(() => {
        if (sourceTime === null || !segments.length) return;
        if (hasMore && segments[segments.length - 1].timestamp < sourceTime) { if (!isLoadingMore) onLoadMore?.(); return; }
        const index = segments.reduce((best, segment, i) => Math.abs(segment.timestamp - sourceTime) < Math.abs(segments[best].timestamp - sourceTime) ? i : best, 0);
        virtualizer.scrollToIndex(index, { align: 'center' }); setHighlight(segments[index].id); setSourceTime(null);

    }, [sourceTime, segments.length, hasMore, isLoadingMore, onLoadMore, virtualizer]);

    useEffect(() => { if (!highlight) return; const timer = setTimeout(() => setHighlight(''), 6000); return () => clearTimeout(timer); }, [highlight]);

    // Streaming text effect hook (typewriter animation for new transcripts)
    const { streamingSegmentId, getDisplayText } = useTranscriptStreaming(
        segments,
        isRecording,
        enableStreaming
    );

    // Infinite scroll: IntersectionObserver to trigger loading more
    useEffect(() => {
        if (!onLoadMore || !hasMore || isLoadingMore || isRecording || segments.length === 0) {
            return;
        }

        const triggerElement = loadMoreTriggerRef.current;
        if (!triggerElement) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
                    onLoadMore();
                }
            },
            {
                root: null,
                rootMargin: '100px',
                threshold: 0,
            }
        );

        observer.observe(triggerElement);

        return () => observer.disconnect();
    }, [hasMore, isLoadingMore, onLoadMore, isRecording, segments.length]);

    // Scroll-based fallback for fast scrolling
    useEffect(() => {
        if (!onLoadMore || !hasMore || isLoadingMore || isRecording) return;

        const scrollElement = scrollRef.current;
        if (!scrollElement) return;

        let ticking = false;

        const handleScroll = () => {
            if (ticking || isLoadingMore || !hasMore) return;

            ticking = true;
            requestAnimationFrame(() => {
                const { scrollTop, scrollHeight, clientHeight } = scrollElement;
                const scrollBottom = scrollHeight - scrollTop - clientHeight;

                // Trigger load when within 200px of bottom
                if (scrollBottom < 200 && hasMore && !isLoadingMore) {
                    onLoadMore();
                }
                ticking = false;
            });
        };

        scrollElement.addEventListener('scroll', handleScroll, { passive: true });
        return () => scrollElement.removeEventListener('scroll', handleScroll);
    }, [onLoadMore, hasMore, isLoadingMore, isRecording]);

    // Use simple rendering for small lists, virtualization for large lists
    const useVirtualization = segments.length >= VIRTUALIZATION_THRESHOLD;

    return (
        <div ref={scrollRef} className="flex flex-col h-full overflow-y-auto px-4 py-2">
            {/* Content - add padding when recording to prevent overlap */}
            <div className={isRecording ? 'pt-2' : ''}>
            {isRecording && !autoScroll && <button className="sticky top-2 z-10 mx-auto block rounded-full bg-brand px-4 py-2 text-sm text-brand-foreground shadow" onClick={scrollToBottom}>{t('live.backLive')}</button>}
            {segments.length === 0 ? (
                // Empty state
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-8 text-center text-muted-foreground"
                >
                    {isRecording ? (
                        <>
                            <div className="flex items-center justify-center mb-3">
                                <div className={`w-3 h-3 rounded-full ${isPaused ? 'bg-warning' : 'bg-brand animate-pulse'}`}></div>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {isPaused ? t('live.pausedTitle') : t('live.waiting')}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {isPaused ? t('live.pausedText') : t('live.waitingText')}
                            </p>
                        </>
                    ) : (
                        <>
                            <p className="text-sm">{t('live.welcome')}</p>
                        </>
                    )}
                </motion.div>
            ) : useVirtualization ? (
                // Virtualized rendering for large lists
                <>
                    <div
                        style={{
                            height: virtualizer.getTotalSize(),
                            width: "100%",
                            position: "relative",
                        }}
                    >
                        {virtualizer.getVirtualItems().map((virtualRow) => {
                            const segment = segments[virtualRow.index];
                            const isStreaming = streamingSegmentId === segment.id;

                            return (
                                <div
                                    key={segment.id}
                                    className={highlight === segment.id ? "transcript-source-highlight" : ""}
                                    data-index={virtualRow.index}
                                    ref={virtualizer.measureElement}
                                    style={{
                                        position: "absolute",
                                        top: 0,
                                        left: 0,
                                        width: "100%",
                                        transform: `translateY(${virtualRow.start}px)`,
                                    }}
                                >
                                    <TranscriptSegment
                                        id={segment.id}
                                        timestamp={segment.timestamp}
                                        text={getDisplayText(segment)}
                                        confidence={segment.confidence}
                                        isStreaming={isStreaming}
                                        showConfidence={showConfidence}
                                        speakerLabel={labelFor(segment, segments[segments.indexOf(segment) - 1])}
                                    />
                                </div>
                            );
                        })}
                    </div>

                    {/* Infinite scroll trigger and loading indicator */}
                    {(hasMore || isLoadingMore) && !isRecording && segments.length > 0 && (
                        <div ref={loadMoreTriggerRef} className="flex justify-center items-center py-4 mt-2">
                            {isLoadingMore ? (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-foreground" />
                                    <span className="text-sm">Loading more...</span>
                                </div>
                            ) : hasMore && totalCount > 0 ? (
                                <span className="text-sm text-muted-foreground">
                                    Showing {loadedCount} of {totalCount} segments
                                </span>
                            ) : null}
                        </div>
                    )}

                    {/* Listening indicator when recording */}
                    {!isStopping && isRecording && !isPaused && !isProcessing && segments.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="mt-4 flex items-center gap-2 text-muted-foreground"
                        >
                            <div className="w-2 h-2 bg-brand rounded-full animate-pulse"></div>
                            <span className="text-sm">Listening...</span>
                        </motion.div>
                    )}
                </>
            ) : (
                // Simple rendering for small lists (better animations)
                <>
                    <div className="space-y-1">
                        {segments.map((segment) => {
                            const isStreaming = streamingSegmentId === segment.id;

                            return (
                                <motion.div
                                    key={segment.id}
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.15 }}
                                >
                                    <TranscriptSegment
                                        id={segment.id}
                                        timestamp={segment.timestamp}
                                        text={getDisplayText(segment)}
                                        confidence={segment.confidence}
                                        isStreaming={isStreaming}
                                        showConfidence={showConfidence}
                                        speakerLabel={labelFor(segment, segments[segments.indexOf(segment) - 1])}
                                    />
                                </motion.div>
                            );
                        })}
                    </div>

                    {/* Infinite scroll trigger (for small lists that grow) */}
                    {(hasMore || isLoadingMore) && !isRecording && segments.length > 0 && (
                        <div ref={loadMoreTriggerRef} className="flex justify-center items-center py-4 mt-2">
                            {isLoadingMore ? (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-foreground" />
                                    <span className="text-sm">Loading more...</span>
                                </div>
                            ) : hasMore && totalCount > 0 ? (
                                <span className="text-sm text-muted-foreground">
                                    Showing {loadedCount} of {totalCount} segments
                                </span>
                            ) : null}
                        </div>
                    )}

                    {/* Listening indicator when recording */}
                    {!isStopping && isRecording && !isPaused && !isProcessing && segments.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="mt-4 flex items-center gap-2 text-muted-foreground"
                        >
                            <div className="w-2 h-2 bg-brand rounded-full animate-pulse"></div>
                            <span className="text-sm">Listening...</span>
                        </motion.div>
                    )}
                </>
            )}
            </div>
        </div>
    );
};
