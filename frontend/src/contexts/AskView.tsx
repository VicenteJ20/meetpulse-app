"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Lock, Sparkles, Square } from "lucide-react";
import { ChatThread } from "@/components/chat/ChatMessages";
import { AssistantModelSelect } from "@/components/AssistantModelSelect";
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
  provider: string;
  model: string;
  onModelChange: (provider: string, model: string) => void;
};

// Chat general sobre todas las reuniones. Vacío: saludo y campo al centro; con mensajes: hilo arriba y campo abajo.
export function AskView(props: Props) {
  const {
    t, host, messages, busy, error, partial, question, setQuestion, ask, cancel, ready,
    clients, projects, client, project, setClient, setProject, sourceClick,
    provider, model, onModelChange,
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
      <div className="rounded-2xl border border-input bg-card p-3 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
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
          className="block max-h-[180px] w-full resize-none bg-transparent px-1 text-[0.95rem] leading-6 outline-none focus-visible:ring-0 placeholder:text-muted-foreground"
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
          <AssistantModelSelect className="ml-auto" provider={provider} model={model} onChange={onModelChange} />
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
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-6">
            <ChatThread messages={messages} sourceClick={sourceClick} large />
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
