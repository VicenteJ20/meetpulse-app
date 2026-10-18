"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Cloud, Lock, Quote, ShieldCheck, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/i18n/catalogs";
import type { Message, Source } from "./AssistantContext";

type Props = {
  t: (key: TranslationKey) => string;
  host: HTMLDivElement;
  messages: Message[];
  busy: boolean;
  error: string;
  partial: boolean;
  question: string;
  setQuestion: (value: string) => void;
  ask: () => Promise<void>;
  cancel: () => void;
  ready: boolean;
  clients: string[];
  projects: string[];
  client: string;
  project: string;
  setClient: (client: string) => void;
  setProject: (project: string) => void;
  sourceClick: (source: Source) => void;
  isLocalProvider: boolean;
  provider: string;
  model: string;
};

const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

// Chat general sobre todas las reuniones. Vacío: saludo y campo al centro; con mensajes: hilo arriba y campo abajo.
export function AskView(props: Props) {
  const {
    t, host, messages, busy, error, partial, question, setQuestion, ask, cancel, ready,
    clients, projects, client, project, setClient, setProject, sourceClick,
    isLocalProvider, provider, model,
  } = props;
  const empty = messages.length === 0 && !busy;
  // Con mensajes, el alcance queda fijo: evita mezclar información de otros clientes en la misma conversación.
  const locked = messages.length > 0;
  const threadRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [question]);

  const scopeLabel = project ? `${client} / ${project}` : client || t("ask.scopeAll");

  const sourceCards = (message: Message) =>
    message.sources.length > 0 && (
      <div className="mt-4 space-y-1.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Quote className="size-3.5" />
          {t("assistant.sources")}
        </p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {message.sources.map((source, index) => (
            <button
              key={`${source.id}-${index}`}
              type="button"
              onClick={() => sourceClick(source)}
              title={source.text}
              className="flex gap-2.5 rounded-xl border border-border bg-card p-2.5 text-left transition-[border-color,background-color] duration-150 hover:border-brand hover:bg-accent/50"
            >
              <span className="mt-0.5 grid size-[18px] shrink-0 place-items-center rounded bg-muted font-mono text-[0.68rem] text-muted-foreground">{index + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[0.82rem] font-medium">
                  <span className="truncate">{source.title}</span>
                  <span className="ml-auto shrink-0 font-mono text-[0.7rem] tabular-nums text-muted-foreground">{mmss(source.start)}</span>
                </span>
                <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">{source.text}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    );

  const composer = (
    <motion.form
      layout="position"
      transition={{ type: "spring", stiffness: 420, damping: 38 }}
      onSubmit={(event) => {
        event.preventDefault();
        void ask();
      }}
      className={cn("w-full", empty ? "max-w-2xl" : "max-w-3xl")}
    >
      <div className="rounded-2xl border border-input bg-card p-3 shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-[border-color,box-shadow] duration-150 focus-within:border-brand focus-within:shadow-[0_0_0_3px_hsl(var(--brand)/0.15)]">
        <textarea
          ref={textareaRef}
          rows={empty ? 2 : 1}
          aria-label={t("assistant.askLabel")}
          placeholder={t("assistant.placeholderGlobal")}
          value={question}
          maxLength={3000}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void ask();
            }
          }}
          className="block max-h-[180px] w-full resize-none bg-transparent px-1 text-[0.95rem] leading-6 outline-none placeholder:text-muted-foreground"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {locked ? (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-muted px-3 text-xs font-medium text-muted-foreground" title={t("ask.scopeLocked")}>
              <Lock className="size-3.5" />
              {scopeLabel}
            </span>
          ) : (
            <>
              <SelectField
                aria-label={t("assistant.client")}
                value={client}
                onValueChange={(value) => { setClient(value); setProject(""); }}
                options={[{ value: "", label: t("ask.scopeAll") }, ...clients.map((c) => ({ value: c, label: c }))]}
                className="h-8 w-auto min-w-[9rem] max-w-[14rem] rounded-full px-3 text-xs"
              />
              <SelectField
                aria-label={t("assistant.project")}
                value={project}
                onValueChange={setProject}
                disabled={!client}
                options={[{ value: "", label: t("ask.projectAll") }, ...projects.map((p) => ({ value: p, label: p }))]}
                className="h-8 w-auto min-w-[9rem] max-w-[14rem] rounded-full px-3 text-xs"
              />
            </>
          )}
          <span className="ml-auto hidden min-w-0 items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
            {isLocalProvider ? <ShieldCheck className="size-3.5 shrink-0 text-success" /> : <Cloud className="size-3.5 shrink-0 text-warning" />}
            <span className="truncate">
              {isLocalProvider ? t("assistant.privacyLocal") : t("assistant.privacyCloud").replace("{provider}", provider)}
              {model ? ` · ${model}` : ""}
            </span>
          </span>
          {busy ? (
            <Button type="button" size="icon" variant="outline" className="size-8 rounded-full" onClick={cancel} aria-label={t("assistant.cancel")}>
              <Square className="size-3.5 fill-current" />
            </Button>
          ) : (
            <Button type="submit" size="icon" className="size-8 rounded-full" aria-label={t("assistant.send")} disabled={!ready || !question.trim()}>
              <ArrowUp />
            </Button>
          )}
        </div>
      </div>
    </motion.form>
  );

  const content = (
    <div className={cn("flex h-full min-h-0 w-full flex-col items-center", empty && "justify-center")}>
      <AnimatePresence initial={false}>
        {empty && (
          <motion.div
            key="hero"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12, transition: { duration: 0.15 } }}
            className="mb-6 flex flex-col items-center gap-3 px-6 text-center"
          >
            <span className="grid size-12 place-items-center rounded-2xl bg-accent text-brand"><Sparkles className="size-6" /></span>
            <h1 className="text-2xl font-semibold tracking-[-0.03em]">{t("ask.heroTitle")}</h1>
            <p className="max-w-md text-sm text-muted-foreground">{t("ask.heroText")}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {!empty && (
        <div ref={threadRef} className="custom-scrollbar min-h-0 w-full flex-1 overflow-y-auto px-6 pt-8" aria-live="polite">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 pb-6">
            {messages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="animate-enter flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-[0.95rem] leading-6">{message.text}</p>
                </div>
              ) : (
                <article key={message.id} className="animate-enter flex gap-3">
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-accent text-brand"><Sparkles className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="prose prose-sm max-w-none break-words text-foreground prose-p:my-2 prose-headings:text-foreground prose-strong:text-foreground dark:prose-invert">
                      <ReactMarkdown>{message.text}</ReactMarkdown>
                    </div>
                    {sourceCards(message)}
                  </div>
                </article>
              ),
            )}
            {busy && (
              <div role="status" className="animate-enter flex items-center gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-brand"><Sparkles className="size-4" /></span>
                <span className="inline-flex gap-1" aria-label={t("assistant.generating")}>
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="size-1.5 animate-blink rounded-full bg-muted-foreground" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </span>
              </div>
            )}
            {partial && !busy && <p className="text-xs text-muted-foreground">{t("assistant.partial")}</p>}
          </div>
        </div>
      )}

      {error && <p role="alert" className="mb-2 max-h-24 w-full max-w-3xl overflow-auto break-words px-6 text-xs text-destructive">{error}</p>}
      <div className={cn("flex w-full justify-center px-6", empty ? "pb-0" : "pb-5")}>{composer}</div>
    </div>
  );

  return createPortal(content, host);
}
