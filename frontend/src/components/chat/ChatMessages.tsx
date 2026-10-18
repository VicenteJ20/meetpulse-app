"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, Quote, Sparkles } from "lucide-react";
import { useTranslation } from "@/contexts/UiPreferencesContext";
import { cn } from "@/lib/utils";
import type { Message, Source } from "@/contexts/AssistantContext";
import { ChatMarkdown, citedNumbers, CopyButton } from "./ChatMarkdown";

const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const COLLAPSED = 3;

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
            {(i === 0 || shown[i - 1].source.title !== entry.source.title) && (
              <li className="truncate px-1.5 pb-0.5 pt-2 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground/80">{entry.source.title}</li>
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
                <span className="mt-0.5 shrink-0 font-mono text-[0.7rem] tabular-nums text-muted-foreground">{mmss(entry.source.start)}</span>
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

export function ChatThread({ messages, sourceClick, large }: { messages: Message[]; sourceClick: (source: Source) => void; large?: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      {messages.map((message) =>
        message.role === "user" ? (
          <UserMessage key={message.id} message={message} />
        ) : (
          <AssistantMessage key={message.id} message={message} sourceClick={sourceClick} large={large} />
        ),
      )}
    </div>
  );
}
