"use client";

import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { invoke } from "@tauri-apps/api/core";
import { ArrowLeft, ArrowUp, Cloud, Copy, Lightbulb, Loader2, MessageSquare, Pause, Quote, Settings2, ShieldCheck, Sparkles, Square, Trash2, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { SelectField } from "@/components/ui/select-field";
import { ChatDisclaimer, ChatThread, type PendingReply } from "@/components/chat/ChatMessages";
import { AssistantModelSelect } from "@/components/AssistantModelSelect";
import { ProviderModelPicker } from "@/components/ProviderModelPicker";
import type { TranslationKey } from "@/i18n/catalogs";
import type { Message, Prefs, SearchStatus, Source, Target } from "./AssistantContext";

type Props = {
  t: (key: TranslationKey) => string;
  target: Target | null;
  open: boolean;
  onClose: () => void;
  host: HTMLDivElement | null;
  width: number;
  setWidth: Dispatch<SetStateAction<number>>;
  tab: "coach" | "chat";
  setTab: (tab: "coach" | "chat") => void;
  coach: boolean;
  setCoach: Dispatch<SetStateAction<boolean>>;
  settings: boolean;
  setSettings: Dispatch<SetStateAction<boolean>>;
  indexLabel: string;
  search?: SearchStatus;
  provider: string;
  model: string;
  endpoint?: string;
  prefs: Prefs;
  savePrefs: (next: Prefs) => Promise<void>;
  defaultCadence: number;
  isRecording: boolean;
  isPaused: boolean;
  session: string;
  busy: string;
  ask: (kind: "chat" | "coach") => Promise<void>;
  lastCoach: { current: string };
  scope: string;
  setScope: (scope: string) => void;
  clients: string[];
  projects: string[];
  client: string;
  setClient: (client: string) => void;
  project: string;
  setProject: (project: string) => void;
  from: string;
  setFrom: (date: string) => void;
  to: string;
  setTo: (date: string) => void;
  detail?: Message;
  setDetail: (message?: Message) => void;
  reload: (id: string) => Promise<void>;
  sourceClick: (source: Source) => void;
  shown: Message[];
  partial: boolean;
  error: string;
  question: string;
  setQuestion: (question: string) => void;
  isLocalProvider: boolean;
  requestId: string;
  pending?: PendingReply;
  stopChat: () => void;
};

export function AssistantPanel(props: Props) {
  const {
    t, target, open, onClose, host, width, setWidth, tab, setTab, coach, setCoach,
    settings, setSettings, indexLabel, search, provider, model, endpoint, prefs,
    savePrefs, defaultCadence, isRecording, isPaused, session, busy, ask,
    lastCoach, scope, setScope, clients, projects, client, setClient, project,
    setProject, from, setFrom, to, setTo, detail, setDetail, reload, sourceClick,
    shown, partial, error, question, setQuestion, isLocalProvider, requestId, pending, stopChat,
  } = props;
  const router = useRouter();
  if (!open || !target || typeof document === "undefined") return null;
  const hasMeeting = !!target;
  const selectedScope = scope === "current" ? "current" : scope === "all" ? "all meetings" : `${client} / ${project}`;
  const visibleMessages = shown.filter((message) => tab === "coach" || message.scope === selectedScope);
  const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  const sourceCards = (message: Message) => message.sources.length > 0 && (
    <div className="mt-3 space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Quote className="size-3.5" />{t("assistant.sources")}</p>
      {message.sources.map((source, index) => (
        <button key={`${source.id}-${index}`} type="button" onClick={() => sourceClick(source)} className="flex w-full gap-2.5 rounded-lg border border-border bg-card p-2.5 text-left transition-colors hover:border-brand hover:bg-accent/50" title={source.text}>
          <span className="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded bg-muted font-mono text-[0.68rem] text-muted-foreground">{index + 1}</span>
          <span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-[0.82rem] font-medium"><span className="truncate">{source.title}</span><span className="ml-auto shrink-0 font-mono text-[0.7rem] tabular-nums text-muted-foreground">{mmss(source.start)}</span></span><span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{source.text}</span></span>
        </button>
      ))}
    </div>
  );
  const coachCards = visibleMessages.map((message) => {
    let parsed: { title?: string; reason?: string } = {};
    try { parsed = JSON.parse(message.text); } catch { parsed = { title: message.text }; }
    return <button key={message.id} type="button" onClick={() => setDetail(message)} className="animate-enter flex w-full flex-col gap-1 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-brand"><span className="flex items-center gap-2 text-xs font-semibold text-brand"><Lightbulb className="size-3.5" />{t("assistant.tabCoach")}</span><span className="text-sm font-medium leading-snug">{parsed.title}</span>{parsed.reason && <span className="line-clamp-2 text-xs text-muted-foreground">{parsed.reason}</span>}</button>;
  });
  const content = (
    <aside id="meeting-assistant" aria-label={t("assistant.title")} className={host ? "live-assistant-panel animate-slide-in-right flex h-full min-h-0 w-full min-w-0 flex-col border-l border-border bg-card" : "assistant-panel fixed bottom-0 right-0 top-0 z-40 flex flex-col border-l border-border bg-card shadow-lg"} style={host ? undefined : { width }}>
      {!host && <div role="separator" aria-label={t("assistant.width")} aria-orientation="vertical" aria-valuenow={width} aria-valuemin={320} aria-valuemax={560} tabIndex={0} className="absolute bottom-0 left-0 top-0 z-10 w-1 cursor-col-resize transition-colors hover:bg-brand/40 focus:bg-brand" onKeyDown={(event) => { if (event.key === "ArrowLeft") setWidth((value) => Math.min(560, value + 20)); if (event.key === "ArrowRight") setWidth((value) => Math.max(320, value - 20)); }} onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) setWidth(() => Math.max(320, Math.min(560, window.innerWidth - event.clientX))); }} />}
      <header className="shrink-0 px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-2"><div className={host ? "hidden" : "min-w-0"}><h2 className="font-semibold tracking-tight">{t("assistant.title")}</h2><p className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className={`size-1.5 rounded-full ${search?.ready ? "bg-success" : "bg-muted-foreground/50"}`} /><span className="truncate">{indexLabel}</span></p></div><div className="flex shrink-0"><Button size="icon" variant="ghost" aria-label={t("assistant.settings")} aria-pressed={settings} onClick={() => setSettings((value) => !value)}><Settings2 /></Button><Button size="icon" variant="ghost" aria-label={t("assistant.close")} onClick={onClose}><X /></Button></div></div>
        <Segmented aria-label={t("assistant.title")} className="mt-3 flex w-full [&>button]:flex-1 [&>button]:justify-center" value={tab} onValueChange={(value) => { setTab(value as "coach" | "chat"); setDetail(undefined); }} options={[{ value: "coach", label: <span className="inline-flex items-center gap-1.5">{t("assistant.tabCoach")}{coach && <span className="size-1.5 rounded-full bg-brand" />}</span>, icon: <Lightbulb /> }, { value: "chat", label: t("assistant.tabChat"), icon: <MessageSquare /> }]} />
      </header>
      {settings && <div className="custom-scrollbar max-h-[45vh] shrink-0 space-y-3 overflow-y-auto border-y border-border bg-muted/30 p-4 text-sm"><div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">{t("assistant.modelLabel")}</label><SelectField aria-label={t("assistant.modelLabel")} value={provider} onValueChange={(next) => void savePrefs({ ...prefs, provider: next, model: "" })} options={["builtin-ai", "ollama", "gemini", "openai", "claude", "groq", "openrouter", "custom-openai"].map((item) => ({ value: item, label: item }))} /></div><ProviderModelPicker provider={provider} value={model} endpoint={endpoint} onChange={(id) => void savePrefs({ ...prefs, provider, model: id })} /><Button size="sm" variant="ghost" onClick={() => void savePrefs({ cadence: prefs.cadence })}>{t("assistant.useAnalysis")}</Button><p className="text-xs text-muted-foreground">{t("assistant.apiNote")}</p><div className="flex items-center justify-between gap-2 border-t border-border pt-3"><p className="text-xs text-muted-foreground">{indexLabel}</p><Button size="sm" variant="outline" onClick={() => router.push("/settings?tab=privacy")}>{t("st.manageSearch")}</Button></div></div>}
      {tab === "coach" ? <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 pb-3"><Button size="sm" variant={coach ? "outline" : "default"} disabled={!isRecording || !session} onClick={() => setCoach((value) => !value)}>{coach ? <Pause /> : <Lightbulb />}{coach ? t("assistant.coachPause") : t("assistant.coachOn")}</Button><SelectField aria-label={t("assistant.interval")} className="h-7 w-20 text-xs" value={String(prefs.cadence || defaultCadence)} onValueChange={(next) => void savePrefs({ ...prefs, cadence: Number(next) })} options={[30, 60, 120].map((seconds) => ({ value: String(seconds), label: `${seconds}s` }))} /><Button size="sm" variant="ghost" disabled={!!busy || !isRecording || isPaused} onClick={() => { lastCoach.current = ""; void ask("coach"); }}>{t("assistant.updateNow")}</Button></div> : <div className="shrink-0 space-y-2 border-b border-border px-4 pb-3">{hasMeeting && !target.allMeetings && <SelectField aria-label={t("assistant.scope")} value={scope} onValueChange={setScope} options={[{ value: "current", label: t("assistant.scopeCurrent") }, { value: "all", label: t("assistant.scopeAll") }, { value: "history", label: t("assistant.scopeHistory") }]} />}{scope === "history" && !target.allMeetings && <><div className="grid grid-cols-2 gap-2"><SelectField aria-label={t("assistant.client")} placeholder={t("assistant.client")} value={client} onValueChange={(next) => { setClient(next); setProject(""); }} options={clients.map((item) => ({ value: item, label: item }))} /><SelectField aria-label={t("assistant.project")} placeholder={t("assistant.project")} value={project} onValueChange={setProject} options={projects.map((item) => ({ value: item, label: item }))} /></div><div className="grid grid-cols-2 gap-2"><Input type="date" aria-label={t("assistant.from")} value={from} onChange={(event) => setFrom(event.target.value)} /><Input type="date" aria-label={t("assistant.to")} value={to} onChange={(event) => setTo(event.target.value)} /></div>{!search?.ready && <button type="button" className="text-xs text-brand hover:underline" onClick={() => setSettings(true)}>{t("assistant.enableSearch")}</button>}</>}</div>}
      <div data-chat-scroll className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        {detail ? <><Button size="sm" variant="ghost" onClick={() => setDetail(undefined)}><ArrowLeft />{t("assistant.back")}</Button>{(() => { let parsed: { title?: string; reason?: string; questions?: string[]; steps?: string[] } = {}; try { parsed = JSON.parse(detail.text); } catch {} return <article className="mt-3 space-y-3 text-sm"><h3 className="text-base font-semibold leading-snug">{parsed.title}</h3><p className="text-muted-foreground">{parsed.reason}</p><h4 className="text-xs font-semibold text-muted-foreground">{t("assistant.suggestedQuestions")}</h4><ul className="list-disc space-y-1 pl-4">{parsed.questions?.map((item, index) => <li key={index}>{item}</li>)}</ul><h4 className="text-xs font-semibold text-muted-foreground">{t("assistant.nextSteps")}</h4><ul className="list-disc space-y-1 pl-4">{parsed.steps?.map((item, index) => <li key={index}>{item}</li>)}</ul><h4 className="text-xs font-semibold text-muted-foreground">{t("assistant.evidence")}</h4>{detail.sources.slice(0, 3).map((source) => <blockquote key={source.id} className="border-l-[3px] border-brand/60 pl-3 text-xs leading-5 text-muted-foreground">{source.text.length > 600 ? `${source.text.slice(0, 600)}…` : source.text}</blockquote>)}{sourceCards(detail)}<div className="flex gap-2 pt-1"><Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText([parsed.title, parsed.reason, ...(parsed.questions || []), ...(parsed.steps || [])].filter(Boolean).join("\n"))}><Copy />{t("assistant.copy")}</Button><Button size="sm" variant="ghost" onClick={async () => { await invoke("desktop_assistant_dismiss", { messageId: detail.id }); setDetail(undefined); await reload(session); }}><Trash2 />{t("assistant.dismiss")}</Button></div></article>; })()}</> : visibleMessages.length || (tab === "chat" && pending) ? (tab === "coach" ? <div className="space-y-2.5">{coachCards}</div> : <ChatThread messages={visibleMessages} sourceClick={sourceClick} pending={pending} />) : tab === "coach" ? <div className="mx-auto flex max-w-[18rem] flex-col items-center gap-2.5 py-8 text-center"><Lightbulb className="size-8 text-brand" /><h3 className="font-semibold">{coach ? t("assistant.tabCoach") : t("assistant.coachOffTitle")}</h3><p className="text-sm text-muted-foreground">{coach ? t("assistant.coachListening") : isRecording ? t("assistant.coachOffText") : t("assistant.coachNeedsRecording")}</p>{!coach && isRecording && <><Button onClick={() => setCoach(true)}>{t("assistant.coachOn")}</Button><p className="text-xs text-muted-foreground">{t("assistant.coachOptional")}</p></>}</div> : <div className="mx-auto flex max-w-[18rem] flex-col items-center gap-2.5 py-8 text-center"><Sparkles className="size-8 text-brand" /><p className="text-sm text-muted-foreground">{hasMeeting ? t("assistant.emptyChat") : t("assistant.emptyChatGlobal")}</p></div>}
      </div>
      {partial && <p className="px-4 py-1 text-xs text-muted-foreground">{t("assistant.partial")}</p>}{error && <p role="alert" className="max-h-28 overflow-auto break-words px-4 py-2 text-xs text-destructive">{error}</p>}{busy === "coach" && <div role="status" className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground"><span className="inline-flex items-center gap-2"><Loader2 className="size-3.5 animate-spin" />{t("assistant.generating")}</span><button className="text-brand hover:underline" onClick={() => void invoke("desktop_assistant_cancel", { requestId })}>{t("assistant.cancel")}</button></div>}
      {tab === "chat" && <form className="shrink-0 px-3 pb-3" onSubmit={(event) => { event.preventDefault(); void ask("chat"); }}><div className="rounded-xl border border-input bg-card p-2.5"><textarea aria-label={t("assistant.askLabel")} placeholder={hasMeeting ? t("assistant.placeholder") : t("assistant.placeholderGlobal")} className="max-h-40 min-h-[2.75rem] w-full resize-none bg-transparent text-sm outline-none focus-visible:ring-0 placeholder:text-muted-foreground" value={question} maxLength={3000} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void ask("chat"); } }} /><div className="mt-1.5 flex items-center gap-2"><AssistantModelSelect provider={provider} model={model} onChange={(nextProvider, nextModel) => void savePrefs({ ...prefs, provider: nextProvider, model: nextModel })} />{busy === "chat" ? <Button key="stop" type="button" size="icon" variant="outline" className="animate-pop ml-auto size-7 shrink-0" aria-label={t("chat.stop")} title={t("chat.stop")} onClick={stopChat}><Square className="size-3 fill-current" /></Button> : <Button key="send" type="submit" size="icon" className="animate-pop ml-auto size-7 shrink-0 transition-transform duration-150 active:scale-90" aria-label={t("assistant.send")} disabled={!session || !question.trim()}><ArrowUp /></Button>}</div></div><ChatDisclaimer className="mt-2" /></form>}
    </aside>
  );
  return createPortal(content, host ?? document.body);
}
