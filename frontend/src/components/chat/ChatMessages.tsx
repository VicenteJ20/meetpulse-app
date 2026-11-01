"use client";

import { Fragment, memo, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ChevronDown, Quote, Sparkles } from "lucide-react";
import { useTranslation } from "@/contexts/UiPreferencesContext";
import { cn } from "@/lib/utils";
import type { Message, Source } from "@/contexts/AssistantContext";
import { ChatMarkdown, citedNumbers, CopyButton } from "./ChatMarkdown";
import { BetaBadge } from "@/components/BetaBadge";

const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const COLLAPSED = 3;
const MEETING_DAY = /^\d{4}-\d{2}-\d{2}$/;

function sameMeeting(a: Source, b: Source) {
  if (a.meetingId && b.meetingId) return a.meetingId === b.meetingId;
  return a.title === b.title;
}

function meetingLabel(source: Source) {
  return source.date && MEETING_DAY.test(source.date) ? `${source.title} · ${source.date}` : source.title;
}

// Fuentes de una respuesta: solo las citadas en el texto, agrupadas por reunión y plegadas tras las primeras.
function SourcesList({ message, sourceClick }: { message: Message; sourceClick: (source: Source) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const entries = useMemo(() => {
    const cited = citedNumbers(message.text);
    const all = message.sources.map((source, index) => ({ source, number: index + 1 }));
    return cited.length ? all.filter((entry) => cited.includes(entry.number)) : all;
  }, [message]);
  if (entries.length === 0) return null;
  const shown = open ? entries : entries.slice(0, COLLAPSED);

  return (
    <div className="mt-4 rounded-xl border border-border bg-muted/20">
      <p className="flex items-center gap-1.5 px-3 pb-1 pt-2.5 text-xs font-semibold text-muted-foreground">
        <Quote className="size-3.5" />
        {t("assistant.sources")}
        <span className="font-mono font-normal tabular-nums">{entries.length}</span>
      </p>
      <ul className="px-1.5 pb-1.5">
        {shown.map((entry, i) => (
          <Fragment key={`${entry.source.id}-${entry.number}`}>
            {(i === 0 || !sameMeeting(shown[i - 1].source, entry.source)) && (
              <li className="truncate px-1.5 pb-0.5 pt-2 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground/80">{meetingLabel(entry.source)}</li>
            )}
            <li>
              <button
                type="button"
                title={entry.source.text}
                onClick={() => sourceClick(entry.source)}
                className="flex w-full items-start gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-accent/60"
              >
                <span className="mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-md bg-accent font-mono text-[0.68rem] font-medium text-accent-foreground">{entry.number}</span>
                <span className="min-w-0 flex-1 text-xs leading-snug text-foreground/90">
                  <span className="line-clamp-2">{entry.source.text}</span>
                </span>
                {!entry.source.id.endsWith(":insight") && (
                  <span className="mt-0.5 shrink-0 font-mono text-[0.7rem] tabular-nums text-muted-foreground">{mmss(entry.source.start)}</span>
                )}
              </button>
            </li>
          </Fragment>
        ))}
      </ul>
      {entries.length > COLLAPSED && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-center gap-1 border-t border-border py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          aria-expanded={open}
        >
          {open ? t("chat.showLess") : t("chat.showAll").replace("{n}", String(entries.length))}
          <ChevronDown className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")} />
        </button>
      )}
    </div>
  );
}

export function UserMessage({ message }: { message: Message }) {
  return (
    <div className="animate-enter flex justify-end">
      <p className="max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-muted px-3.5 py-2 text-[0.92rem] leading-6 text-foreground">{message.text}</p>
    </div>
  );
}

export function AssistantMessage({ message, sourceClick, large = false }: { message: Message; sourceClick: (source: Source) => void; large?: boolean }) {
  return (
    <article className="group animate-enter flex gap-3">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-accent text-brand">
        <Sparkles className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <ChatMarkdown
          className={large ? "chat-md-lg" : undefined}
          onCite={(n) => message.sources[n - 1] && sourceClick(message.sources[n - 1])}
          citationTitle={(n) => message.sources[n - 1]?.text}
        >
          {message.text}
        </ChatMarkdown>
        <SourcesList message={message} sourceClick={sourceClick} />
        <div className="mt-1.5 flex items-center opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
          <CopyButton text={message.text.replace(/\[\d{1,3}(?:\s*[,;]\s*\d{1,3})*\]/g, "").replace(/ +([.,;:])/g, "$1")} />
        </div>
      </div>
    </article>
  );
}

export type PendingReply = { question: string; stage: "loading" | "searching" | "analyzing" | "long" };

// Respuesta en curso: el avatar late, el estado cambia por etapas y las líneas insinúan el texto que viene.
function PendingBubble({ stage }: { stage: PendingReply["stage"] }) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-live="polite" className="animate-enter flex gap-3">
      <span className="relative mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-accent text-brand">
        <span className="absolute inset-0 animate-ping rounded-full bg-brand/25 [animation-duration:1.8s]" aria-hidden="true" />
        <Sparkles className="relative size-4 animate-rec-pulse" />
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <p key={stage} className="animate-enter text-sm text-muted-foreground">{t(`chat.stage.${stage}` as "chat.stage.loading")}</p>
        <div className="mt-3 space-y-2" aria-hidden="true">
          <div className="skeleton-shimmer h-3 w-11/12 rounded" />
          <div className="skeleton-shimmer h-3 w-9/12 rounded" />
          <div className="skeleton-shimmer h-3 w-6/12 rounded" />
        </div>
      </div>
    </div>
  );
}

export function ChatDisclaimer({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <p className={cn("flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground", className)}>
      <BetaBadge />
      {t("chat.disclaimer")}
    </p>
  );
}

// Hilo de la conversación. Se pega al final mientras llega contenido, salvo que la persona suba a leer.
export const ChatThread = memo(function ChatThread({
  messages,
  sourceClick,
  large,
  pending,
}: {
  messages: Message[];
  sourceClick: (source: Source) => void;
  large?: boolean;
  pending?: PendingReply;
}) {
  const { t } = useTranslation();
  const root = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [away, setAway] = useState(false);

  const scroller = () => root.current?.closest<HTMLElement>("[data-chat-scroll]") ?? null;

  useEffect(() => {
    const el = scroller();
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 72;
      stick.current = atBottom;
      setAway(!atBottom);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Al enviar, siempre se baja; después solo si ya se estaba al final.
  useEffect(() => {
    if (pending) stick.current = true;
  }, [!!pending]);

  useEffect(() => {
    const el = scroller();
    if (el && stick.current) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, pending?.stage, !!pending]);

  const toLatest = () => {
    const el = scroller();
    stick.current = true;
    el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  return (
    <div ref={root} className="flex flex-col gap-6">
      {messages.map((message, index) =>
        message.role === "user" ? (
          <UserMessage key={`u-${index}`} message={message} />
        ) : (
          <AssistantMessage key={`a-${index}`} message={message} sourceClick={sourceClick} large={large} />
        ),
      )}
      {pending && (
        <>
          {pending.question && (
            <div className="animate-enter flex justify-end">
              <p className="max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-muted px-3.5 py-2 text-[0.92rem] leading-6 text-foreground">{pending.question}</p>
            </div>
          )}
          <PendingBubble stage={pending.stage} />
        </>
      )}
      {away && (
        <button
          type="button"
          onClick={toLatest}
          className="animate-pop sticky bottom-2 mx-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-[0_8px_24px_-8px_rgb(20_30_60_/_0.35)] transition-colors hover:bg-muted"
        >
          <ArrowDown className="size-3.5" />
          {t("chat.toLatest")}
        </button>
      )}
    </div>
  );
});
