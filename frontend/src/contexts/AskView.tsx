"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Lock, Sparkles, Square } from "lucide-react";
import { ChatDisclaimer, ChatThread, type PendingReply } from "@/components/chat/ChatMessages";
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
  pending?: PendingReply;
  error: string;
  partial: boolean;
  question: string;
  composerKey: string;
  ask: (text: string) => Promise<boolean>;
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

// El texto vive aquí, no en el provider: cada tecla no debe redibujar el hilo ni el resto de la app.
function AskComposer({
  t, question, ask, cancel, ready, busy, empty, locked, scopeLabel,
  clients, projects, client, project, setClient, setProject, provider, model, onModelChange,
}: {
  t: (key: TranslationKey) => string;
  question: string;
  ask: (text: string) => Promise<boolean>;
  cancel: () => void;
  ready: boolean;
  busy: boolean;
  empty: boolean;
  locked: boolean;
  scopeLabel: string;
  clients: string[];
  projects: string[];
  client: string;
  project: string;
  setClient: (client: string) => void;
  setProject: (project: string) => void;
  provider: string;
  model: string;
  onModelChange: (provider: string, model: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(question);

  useEffect(() => {
    setDraft(question);
  }, [question]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [draft]);

  const send = () => {
    const text = draft;
    if (!text.trim() || !ready || busy) return;
    setDraft("");
    void ask(text).then((started) => {
      if (!started) setDraft(text);
    });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
      className="w-full"
    >
      <div className="rounded-2xl border border-input bg-card p-3 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
        <textarea
          ref={textareaRef}
          rows={empty ? 2 : 1}
          aria-label={t("assistant.askLabel")}
          placeholder={t("assistant.placeholderGlobal")}
          value={draft}
          maxLength={3000}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
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
            <Button key="stop" type="button" size="icon" variant="outline" className="animate-pop size-8 rounded-full" onClick={cancel} aria-label={t("chat.stop")} title={t("chat.stop")}>
              <Square className="size-3.5 fill-current" />
            </Button>
          ) : (
            <Button key="send" type="submit" size="icon" className="animate-pop size-8 rounded-full transition-transform duration-150 active:scale-90" aria-label={t("assistant.send")} disabled={!ready || !draft.trim()}>
              <ArrowUp />
            </Button>
          )}
        </div>
      </div>
      <ChatDisclaimer className="mt-2" />
    </form>
  );
}

// Chat general sobre todas las reuniones. Vacío: saludo y campo al centro; con mensajes: hilo arriba y campo abajo.
export function AskView(props: Props) {
  const {
    t, host, messages, pending, error, partial, question, composerKey, ask, cancel, ready,
    clients, projects, client, project, setClient, setProject, sourceClick,
    provider, model, onModelChange,
  } = props;
  const busy = !!pending;
  const empty = messages.length === 0 && !pending;
  // Con mensajes, el alcance queda fijo: evita mezclar información de otros clientes en la misma conversación.
  const locked = messages.length > 0;
  const threadRef = useRef<HTMLDivElement>(null);
  const scopeLabel = project ? `${client} / ${project}` : client || t("ask.scopeAll");

  const composer = (
    <motion.div
      layout="position"
      transition={{ type: "spring", stiffness: 420, damping: 38 }}
      className={cn("w-full", empty ? "max-w-2xl" : "max-w-3xl")}
    >
      <AskComposer
        key={composerKey}
        t={t}
        question={question}
        ask={ask}
        cancel={cancel}
        ready={ready}
        busy={busy}
        empty={empty}
        locked={locked}
        scopeLabel={scopeLabel}
        clients={clients}
        projects={projects}
        client={client}
        project={project}
        setClient={setClient}
        setProject={setProject}
        provider={provider}
        model={model}
        onModelChange={onModelChange}
      />
    </motion.div>
  );

  const content = (
    <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col items-center self-stretch overflow-hidden", empty && "justify-center")}>
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
        <div ref={threadRef} data-chat-scroll className="custom-scrollbar min-h-0 w-full flex-1 overflow-y-auto px-6 pt-8" aria-live="polite">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-6">
            <ChatThread messages={messages} sourceClick={sourceClick} large pending={pending} />
            {partial && !busy && <p className="text-xs text-muted-foreground">{t("assistant.partial")}</p>}
          </div>
        </div>
      )}

      {error && <p role="alert" className="mb-2 max-h-24 w-full max-w-3xl overflow-auto break-words px-6 text-xs text-destructive">{error}</p>}
      <div className={cn("flex w-full shrink-0 justify-center px-6", empty ? "pb-0" : "pb-5")}>{composer}</div>
    </div>
  );

  return createPortal(content, host);
}
