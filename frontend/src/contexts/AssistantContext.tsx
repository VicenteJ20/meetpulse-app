"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  X,
  Pause,
  ArrowLeft,
  ArrowUp,
  Copy,
  Trash2,
  Settings2,
  Lightbulb,
  Sparkles,
  Quote,
  Loader2,
  ShieldCheck,
  Cloud,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useTranscripts } from "@/contexts/TranscriptContext";
import { useRecordingState } from "@/contexts/RecordingStateContext";
import { useConfig } from "@/contexts/ConfigContext";
import { useSidebar } from "@/components/Sidebar/SidebarProvider";
import { useTranslation } from "@/contexts/UiPreferencesContext";
import { Button } from "@/components/ui/button";
import { loadAssistantDefaults } from "@/lib/assistantDefaults";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { SelectField } from "@/components/ui/select-field";
import { ProviderModelPicker } from "@/components/ProviderModelPicker";

type Target = {
  id: string;
  meetingId?: string;
  title: string;
  folderPath?: string;
  context?: string;
};
type Source = {
  id: string;
  meetingId?: string;
  sessionId?: string;
  title: string;
  text: string;
  start: number;
  end?: number;
};
type Message = {
  id: string;
  role: string;
  kind: string;
  text: string;
  sources: Source[];
  scope: string;
  dismissed: boolean;
};
type Prefs = { provider?: string; model?: string; cadence?: number };
type SearchStatus = {
  ready: boolean;
  downloading: boolean;
  paused: boolean;
  downloaded: number;
  totalBytes: number;
  indexing: boolean;
  indexed: number;
  total: number;
  missingMeetings: number;
  error?: string;
};
const Context = createContext<{
  setTarget: (target: Target | null) => void;
  open: boolean;
  toggle: () => void;
  coach: boolean;
  toggleCoach: () => void;
} | null>(null);
export function useAssistant() {
  const value = useContext(Context);
  if (!value) throw new Error("AssistantProvider missing");
  return value;
}
export function useAssistantTarget(target: Target) {
  const { setTarget } = useAssistant();
  useEffect(() => {
    setTarget(target);
  }, [
    target.id,
    target.title,
    target.context,
    target.folderPath,
    target.meetingId,
    setTarget,
  ]);
}
export function AssistantButton() {
  const { open, toggle, coach } = useAssistant();
  const { t } = useTranslation();
  return (
    <Button
      size="sm"
      variant={open ? "default" : "outline"}
      onClick={toggle}
      aria-expanded={open}
      aria-controls="meeting-assistant"
    >
      <MessageSquare size={16} />
      {t("assistant.title")}
      {coach && (
        <span
          aria-label="Coach active"
          className="h-2 w-2 rounded-full bg-success"
        />
      )}
    </Button>
  );
}
export function AssistantProvider({ children }: { children: ReactNode }) {
  const { locale, t } = useTranslation();
  const es = locale === "es";
  const router = useRouter();
  const { transcripts, currentMeetingId, meetingTitle } = useTranscripts();
  const { isRecording, isPaused } = useRecordingState();
  const { modelConfig } = useConfig();
  const { meetings } = useSidebar();
  const [savedTarget, setTarget] = useState<Target | null>(null);
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(360);
  const [tab, setTab] = useState<"coach" | "chat">("chat");
  const [coach, setCoach] = useState(false);
  const [session, setSession] = useState("");
  const [prefs, setPrefs] = useState<Prefs>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [detail, setDetail] = useState<Message>();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [scope, setScope] = useState("current");
  const [client, setClient] = useState("");
  const [project, setProject] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [settings, setSettings] = useState(false);
  const [autoIndex, setAutoIndex] = useState(true);
  const [search, setSearch] = useState<SearchStatus>();
  const [partial, setPartial] = useState(false);
  const request = useRef("");
  const version = useRef(0);
  const sessionRef = useRef("");
  const sync = useRef<Promise<unknown>>(Promise.resolve());
  const lastCoach = useRef("");
  const sent = useRef(new Map<string, string>());
  const coachJob = useRef<() => void>(() => {});
  const live = (isRecording || isPaused) && currentMeetingId;
  const target: Target | null = live
    ? {
        id: currentMeetingId!,
        title: meetingTitle || (es ? "Reunión en vivo" : "Live meeting"),
        context:
          typeof window !== "undefined"
            ? localStorage.getItem("meetpulse-recording-context") || ""
            : "",
      }
    : savedTarget;
  const defaultCadence = typeof window !== "undefined" ? loadAssistantDefaults().cadence : 60;
  const startedFor = useRef("");
  useEffect(() => {
    if (!isRecording || !currentMeetingId || startedFor.current === currentMeetingId) return;
    startedFor.current = currentMeetingId;
    const defaults = loadAssistantDefaults();
    // Se aplica tras el reinicio de estado que ocurre al cambiar de reunión.
    const timer = setTimeout(() => {
      if (defaults.chatOnStart) setOpen(true);
      if (defaults.coachOnStart) {
        setTab("coach");
        setOpen(true);
        setCoach(true);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [isRecording, currentMeetingId]);
  const provider = prefs.provider || modelConfig.provider;
  const model = prefs.model ?? modelConfig.model;
  useEffect(() => {
    const shell = document.querySelector<HTMLElement>(".app-shell");
    if (shell) {
      shell.dataset.assistantOpen = String(open && !!target);
      shell.style.setProperty("--assistant-width", `${width}px`);
    }
  }, [open, width, !!target]);
  useEffect(() => {
    setCoach(false);
    lastCoach.current = "";
    sent.current.clear();
    setDetail(undefined);
    setError("");
    setSession("");
    sessionRef.current = "";
    setMessages([]);
    setPrefs({});
    setBusy("");
    if (request.current)
      void invoke("desktop_assistant_cancel", { requestId: request.current });
    request.current = "";
    const current = ++version.current;
    if (!target) return;
    void invoke<{ id: string; preferences: Prefs; messages: Message[] }>(
      "desktop_assistant_session",
      {
        id: target.id,
        meetingId: target.meetingId ?? null,
        title: target.title,
        folderPath: target.folderPath ?? null,
        context: target.context ?? null,
      },
    )
      .then((value) => {
        if (current !== version.current) return;
        sessionRef.current = value.id;
        setSession(value.id);
        setPrefs(value.preferences);
        setMessages(value.messages);
      })
      .catch((e) => {
        if (current === version.current) setError(String(e));
      });
    return () => {
      ++version.current;
    };
  }, [target?.id, target?.meetingId]);
  useEffect(() => {
    if (!session || !target) return;
    void invoke("desktop_assistant_session", {
      id: session,
      meetingId: target.meetingId ?? null,
      title: target.title,
      folderPath: target.folderPath ?? null,
      context: target.context ?? null,
    }).catch((e) => setError(String(e)));
  }, [session, target?.title, target?.context, target?.folderPath]);
  async function syncLive() {
    if (!session || !live) return sync.current;
    const fragments = transcripts
      .filter((t) => !t.is_partial)
      .map((t) => ({
        id: String(t.sequence_id ?? t.id),
        text: t.text,
        start: t.audio_start_time ?? t.chunk_start_time ?? 0,
        end: t.audio_end_time ?? null,
      }))
      .filter((f) => sent.current.get(f.id) !== JSON.stringify(f));
    if (!fragments.length) return sync.current;
    const activeSession = session;
    fragments.forEach((f) => sent.current.set(f.id, JSON.stringify(f)));
    sync.current = sync.current
      .catch(() => {})
      .then(() =>
        invoke("desktop_assistant_sync", {
          sessionId: activeSession,
          fragments,
          recording: isRecording,
        }),
      )
      .catch((e) => {
        if (sessionRef.current === activeSession) sent.current.clear();
        throw e;
      });
    return sync.current;
  }
  useEffect(() => {
    if (!session || !live) return;
    const timer = setTimeout(() => {
      void syncLive().catch((e) => setError(String(e)));
    }, 150);
    return () => clearTimeout(timer);
  }, [session, transcripts, live, isRecording]);
  useEffect(() => {
    void invoke("desktop_assistant_recording_state", {
      recording: isRecording,
    }).catch(() => {});
  }, [isRecording]);
  useEffect(() => {
    if (!isRecording) {
      setCoach(false);
      if (session)
        void invoke("desktop_assistant_sync", {
          sessionId: session,
          fragments: [],
          recording: false,
        });
    }
  }, [isRecording, session]);
  useEffect(
    () => () => {
      if (request.current)
        void invoke("desktop_assistant_cancel", { requestId: request.current });
    },
    [],
  );
  async function reload(id: string) {
    if (!target) return;
    const value = await invoke<{ messages: Message[] }>(
      "desktop_assistant_session",
      {
        id,
        meetingId: target.meetingId ?? null,
        title: target.title,
        folderPath: target.folderPath ?? null,
        context: null,
      },
    );
    if (sessionRef.current === id) setMessages(value.messages);
  }
  async function ask(kind: "chat" | "coach") {
    if (!session || !target || (kind === "coach" && (!isRecording || isPaused)))
      return;
    if (kind === "coach" && (busy || !transcripts.some((t) => !t.is_partial)))
      return;
    if (kind === "chat" && (!question.trim() || busy === "chat")) return;
    if (kind === "chat" && scope === "history" && (!client || !project)) {
      setError(
        es ? "Selecciona cliente y proyecto." : "Select client and project.",
      );
      return;
    }
    if (from && to && from > to) {
      setError(es ? "El rango de fechas no es válido." : "Invalid date range.");
      return;
    }
    const key = transcripts
      .filter((t) => !t.is_partial)
      .map((t) => `${t.sequence_id ?? t.id}:${t.text}`)
      .join("|");
    if (kind === "coach" && key === lastCoach.current) return;
    if (busy === "coach")
      await invoke("desktop_assistant_cancel", { requestId: request.current });
    const id = crypto.randomUUID();
    const activeSession = session;
    request.current = id;
    setBusy(kind);
    setError("");
    const text = question;
    try {
      await syncLive();
      const result = await invoke<{ messages: Message[]; partial: boolean }>(
        "desktop_assistant_ask",
        {
          request: {
            requestId: id,
            sessionId: activeSession,
            kind,
            question: kind === "chat" ? text : "",
            client: kind === "chat" && scope === "history" ? client : null,
            project: kind === "chat" && scope === "history" ? project : null,
            from: from || null,
            to: to || null,
            locale,
            provider,
            model,
          },
        },
      );
      if (request.current !== id || sessionRef.current !== activeSession)
        return;
      if (kind === "chat") setQuestion("");
      else lastCoach.current = key;
      setPartial(result.partial);
      await reload(activeSession);
    } catch (e) {
      if (request.current === id) {
        setError(String(e));
        await reload(activeSession).catch(() => {});
      }
    } finally {
      if (request.current === id) {
        request.current = "";
        setBusy("");
      }
    }
  }
  coachJob.current = () => {
    if (coach && isRecording && !isPaused) void ask("coach");
  };
  useEffect(() => {
    if (!coach) return;
    const timer = setInterval(
      () => coachJob.current(),
      (prefs.cadence || defaultCadence) * 1000,
    );
    return () => clearInterval(timer);
  }, [coach, prefs.cadence, defaultCadence, session]);
  const pollSearch = useCallback(async () => {
    try {
      setSearch(await invoke<SearchStatus>("desktop_search_status"));
    } catch (e) {
      setError(String(e));
    }
  }, []);
  useEffect(() => {
    if (!open) return;
    void pollSearch();
    if (autoIndex)
      void invoke("desktop_search_index", { cancel: false }).catch((e) =>
        setError(String(e)),
      );
    const timer = setInterval(() => void pollSearch(), 4000);
    return () => clearInterval(timer);
  }, [open, pollSearch, autoIndex]);
  useEffect(() => {
    if (
      autoIndex &&
      search?.ready &&
      !search.indexing &&
      !search.error &&
      !isRecording &&
      (search.indexed < search.total || search.missingMeetings > 0)
    )
      void invoke("desktop_search_index", { cancel: false }).catch((e) =>
        setError(String(e)),
      );
  }, [
    autoIndex,
    search?.ready,
    search?.indexing,
    search?.error,
    search?.indexed,
    search?.total,
    search?.missingMeetings,
    isRecording,
  ]);
  async function searchAction(command: string, args: Record<string, unknown>) {
    try {
      if (command === "desktop_search_index")
        setAutoIndex(args.cancel !== true);
      await invoke(command, args);
      await pollSearch();
    } catch (e) {
      setError(String(e));
    }
  }
  async function savePrefs(next: Prefs) {
    setPrefs(next);
    try {
      await invoke("desktop_assistant_preferences", {
        sessionId: session,
        preferences: next,
      });
    } catch (e) {
      setError(String(e));
    }
  }
  function sourceClick(source: Source) {
    if (source.meetingId) {
      router.push(
        `/meeting-details?id=${encodeURIComponent(source.meetingId)}&sourceTime=${source.start}`,
      );
      window.dispatchEvent(
        new CustomEvent("meetpulse-source", { detail: source }),
      );
    } else
      window.dispatchEvent(
        new CustomEvent("meetpulse-source", { detail: source }),
      );
  }
  const hasMeeting = !!target;
  const selectedScope =
    scope === "current" ? "current" : `${client} / ${project}`;
  const shown = messages.filter(
    (m) =>
      m.kind === tab &&
      !m.dismissed &&
      (tab === "coach" || m.scope === selectedScope),
  );
  const isLocalProvider =
    provider === "builtin-ai" ||
    (provider === "ollama" &&
      /localhost|127\.0\.0\.1/.test(modelConfig.ollamaEndpoint || "localhost"));
  const clients = Array.from(
    new Set(meetings.map((m) => m.client).filter((c): c is string => !!c)),
  );
  const projects = Array.from(
    new Set(
      meetings
        .filter((m) => m.client === client)
        .map((m) => m.project)
        .filter((p): p is string => !!p),
    ),
  );
  const mmss = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  const indexLabel = search?.ready
    ? search.indexing
      ? t("assistant.indexing")
      : t("assistant.indexReady")
          .replace("{indexed}", String(search.indexed))
          .replace("{total}", String(search.total))
    : t("assistant.indexOff");

  const sourceCards = (message: Message) =>
    message.sources.length > 0 && (
      <div className="mt-3 space-y-1.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Quote className="size-3.5" />
          {t("assistant.sources")}
        </p>
        {message.sources.map((source, i) => (
          <button
            key={`${source.id}-${i}`}
            type="button"
            onClick={() => sourceClick(source)}
            className="flex w-full gap-2.5 rounded-lg border border-border bg-card p-2.5 text-left transition-colors hover:border-brand hover:bg-accent/50"
            title={source.text}
          >
            <span className="mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded bg-muted font-mono text-[0.68rem] text-muted-foreground">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-[0.82rem] font-medium">
                <span className="truncate">{source.title}</span>
                <span className="ml-auto shrink-0 font-mono text-[0.7rem] tabular-nums text-muted-foreground">
                  {mmss(source.start)}
                </span>
              </span>
              <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                {source.text}
              </span>
            </span>
          </button>
        ))}
      </div>
    );

  const coachCards = shown.map((m) => {
    let parsed: { title?: string; reason?: string } = {};
    try {
      parsed = JSON.parse(m.text);
    } catch {
      parsed = { title: m.text };
    }
    return (
      <button
        key={m.id}
        type="button"
        onClick={() => setDetail(m)}
        className="flex w-full flex-col gap-1 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-brand"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-brand">
          <Lightbulb className="size-3.5" />
          {t("assistant.tabCoach")}
        </span>
        <span className="text-sm font-medium leading-snug">{parsed.title}</span>
        {parsed.reason && (
          <span className="line-clamp-2 text-xs text-muted-foreground">{parsed.reason}</span>
        )}
      </button>
    );
  });

  return (
    <Context.Provider
      value={{
        setTarget,
        open,
        toggle: () => setOpen((v) => !v),
        coach,
        toggleCoach: () => {
          setTab("coach");
          setOpen(true);
          setCoach((v) => !v);
        },
      }}
    >
      {children}
      {open && target && (
        <aside
          id="meeting-assistant"
          aria-label={t("assistant.title")}
          className="assistant-panel fixed bottom-0 right-0 top-0 z-40 flex flex-col border-l border-border bg-card shadow-lg"
          style={{ width }}
        >
          <div
            role="separator"
            aria-label={t("assistant.width")}
            aria-orientation="vertical"
            aria-valuenow={width}
            aria-valuemin={320}
            aria-valuemax={560}
            tabIndex={0}
            className="absolute bottom-0 left-0 top-0 z-10 w-1 cursor-col-resize transition-colors hover:bg-brand/40 focus:bg-brand"
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setWidth((w) => Math.min(560, w + 20));
              if (e.key === "ArrowRight")
                setWidth((w) => Math.max(320, w - 20));
            }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId))
                setWidth(
                  Math.max(320, Math.min(560, window.innerWidth - e.clientX)),
                );
            }}
          />

          <header className="shrink-0 px-4 pb-3 pt-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="font-semibold tracking-tight">{t("assistant.title")}</h2>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={`size-1.5 rounded-full ${search?.ready ? "bg-success" : "bg-muted-foreground/50"}`} />
                  <span className="truncate">{indexLabel}</span>
                </p>
              </div>
              <div className="flex shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t("assistant.settings")}
                  aria-pressed={settings}
                  onClick={() => setSettings((v) => !v)}
                >
                  <Settings2 />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t("assistant.close")}
                  onClick={() => setOpen(false)}
                >
                  <X />
                </Button>
              </div>
            </div>
            <Segmented
              aria-label={t("assistant.title")}
              className="mt-3 flex w-full [&>button]:flex-1 [&>button]:justify-center"
              value={tab}
              onValueChange={(next) => {
                setTab(next);
                setDetail(undefined);
              }}
              options={[
                { value: "chat", label: t("assistant.tabChat"), icon: <MessageSquare /> },
                {
                  value: "coach",
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      {t("assistant.tabCoach")}
                      {coach && <span className="size-1.5 rounded-full bg-brand" />}
                    </span>
                  ),
                  icon: <Lightbulb />,
                },
              ]}
            />
          </header>

          {settings && (
            <div className="custom-scrollbar max-h-[45vh] shrink-0 space-y-3 overflow-y-auto border-y border-border bg-muted/30 p-4 text-sm">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{t("assistant.modelLabel")}</label>
                <SelectField
                  aria-label={t("assistant.modelLabel")}
                  value={provider}
                  onValueChange={(next) => void savePrefs({ ...prefs, provider: next, model: "" })}
                  options={[
                    "builtin-ai",
                    "ollama",
                    "gemini",
                    "openai",
                    "claude",
                    "groq",
                    "openrouter",
                    "custom-openai",
                  ].map((p) => ({ value: p, label: p }))}
                />
              </div>
              <ProviderModelPicker
                provider={provider}
                value={model}
                endpoint={provider === "ollama" ? modelConfig.ollamaEndpoint : undefined}
                onChange={(id) => void savePrefs({ ...prefs, provider, model: id })}
              />
              <Button size="sm" variant="ghost" onClick={() => void savePrefs({ cadence: prefs.cadence })}>
                {t("assistant.useAnalysis")}
              </Button>
              <p className="text-xs text-muted-foreground">{t("assistant.apiNote")}</p>
              <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">{indexLabel}</p>
                <Button size="sm" variant="outline" onClick={() => router.push("/settings?tab=privacy")}>
                  {t("st.manageSearch")}
                </Button>
              </div>
            </div>
          )}

          {tab === "coach" ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 pb-3">
              <Button
                size="sm"
                variant={coach ? "outline" : "default"}
                disabled={!isRecording || !session}
                onClick={() => setCoach((v) => !v)}
              >
                {coach ? <Pause /> : <Lightbulb />}
                {coach ? t("assistant.coachPause") : t("assistant.coachOn")}
              </Button>
              <SelectField
                aria-label={t("assistant.interval")}
                className="h-7 w-20 text-xs"
                value={String(prefs.cadence || defaultCadence)}
                onValueChange={(next) => void savePrefs({ ...prefs, cadence: Number(next) })}
                options={[30, 60, 120].map((n) => ({ value: String(n), label: `${n}s` }))}
              />
              <Button
                size="sm"
                variant="ghost"
                disabled={!!busy || !isRecording || isPaused}
                onClick={() => {
                  lastCoach.current = "";
                  void ask("coach");
                }}
              >
                {t("assistant.updateNow")}
              </Button>
            </div>
          ) : (
            <div className="shrink-0 space-y-2 border-b border-border px-4 pb-3">
              {hasMeeting ? (
                <SelectField
                  aria-label={t("assistant.scope")}
                  value={scope}
                  onValueChange={setScope}
                  options={[
                    { value: "current", label: t("assistant.scopeCurrent") },
                    { value: "history", label: t("assistant.scopeHistory") },
                  ]}
                />
              ) : null}
              {scope === "history" && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <SelectField
                      aria-label={t("assistant.client")}
                      placeholder={t("assistant.client")}
                      value={client}
                      onValueChange={(next) => {
                        setClient(next);
                        setProject("");
                      }}
                      options={clients.map((c) => ({ value: c, label: c }))}
                    />
                    <SelectField
                      aria-label={t("assistant.project")}
                      placeholder={t("assistant.project")}
                      value={project}
                      onValueChange={setProject}
                      options={projects.map((p) => ({ value: p, label: p }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="date" aria-label={t("assistant.from")} value={from} onChange={(e) => setFrom(e.target.value)} />
                    <Input type="date" aria-label={t("assistant.to")} value={to} onChange={(e) => setTo(e.target.value)} />
                  </div>
                  {!search?.ready && (
                    <button type="button" className="text-xs text-brand hover:underline" onClick={() => setSettings(true)}>
                      {t("assistant.enableSearch")}
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
            {detail ? (
              <>
                <Button size="sm" variant="ghost" onClick={() => setDetail(undefined)}>
                  <ArrowLeft />
                  {t("assistant.back")}
                </Button>
                {(() => {
                  let d: {
                    title?: string;
                    reason?: string;
                    questions?: string[];
                    steps?: string[];
                  } = {};
                  try {
                    d = JSON.parse(detail.text);
                  } catch {}
                  return (
                    <article className="mt-3 space-y-3 text-sm">
                      <h3 className="text-base font-semibold leading-snug">{d.title}</h3>
                      <p className="text-muted-foreground">{d.reason}</p>
                      <h4 className="text-xs font-semibold text-muted-foreground">{t("assistant.suggestedQuestions")}</h4>
                      <ul className="list-disc space-y-1 pl-4">
                        {d.questions?.map((q, i) => (<li key={i}>{q}</li>))}
                      </ul>
                      <h4 className="text-xs font-semibold text-muted-foreground">{t("assistant.nextSteps")}</h4>
                      <ul className="list-disc space-y-1 pl-4">
                        {d.steps?.map((s, i) => (<li key={i}>{s}</li>))}
                      </ul>
                      <h4 className="text-xs font-semibold text-muted-foreground">{t("assistant.evidence")}</h4>
                      {detail.sources.slice(0, 3).map((source) => (
                        <blockquote
                          key={source.id}
                          className="border-l-[3px] border-brand/60 pl-3 text-xs leading-5 text-muted-foreground"
                        >
                          {source.text.length > 600 ? `${source.text.slice(0, 600)}…` : source.text}
                        </blockquote>
                      ))}
                      {sourceCards(detail)}
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void navigator.clipboard.writeText(
                              [d.title, d.reason, ...(d.questions || []), ...(d.steps || [])].join("\n"),
                            )
                          }
                        >
                          <Copy />
                          {t("assistant.copy")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            await invoke("desktop_assistant_dismiss", { messageId: detail.id });
                            setDetail(undefined);
                            await reload(session);
                          }}
                        >
                          <Trash2 />
                          {t("assistant.dismiss")}
                        </Button>
                      </div>
                    </article>
                  );
                })()}
              </>
            ) : shown.length ? (
              tab === "coach" ? (
                <div className="space-y-2.5">{coachCards}</div>
              ) : (
                <div className="space-y-5">
                  {shown.map((m) =>
                    m.role === "user" ? (
                      <div key={m.id} className="flex justify-end">
                        <p className="max-w-[88%] whitespace-pre-wrap break-words rounded-xl bg-muted px-3 py-2 text-sm">{m.text}</p>
                      </div>
                    ) : (
                      <article key={m.id} className="flex gap-2.5">
                        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                          <Sparkles className="size-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="prose prose-sm max-w-none break-words text-foreground prose-p:my-1.5 prose-headings:text-foreground prose-strong:text-foreground dark:prose-invert">
                            <ReactMarkdown>{m.text}</ReactMarkdown>
                          </div>
                          {sourceCards(m)}
                        </div>
                      </article>
                    ),
                  )}
                </div>
              )
            ) : tab === "coach" ? (
              <div className="mx-auto flex max-w-[18rem] flex-col items-center gap-2.5 py-8 text-center">
                <Lightbulb className="size-8 text-brand" />
                <h3 className="font-semibold">{coach ? t("assistant.tabCoach") : t("assistant.coachOffTitle")}</h3>
                <p className="text-sm text-muted-foreground">
                  {coach
                    ? t("assistant.coachListening")
                    : isRecording
                      ? t("assistant.coachOffText")
                      : t("assistant.coachNeedsRecording")}
                </p>
                {!coach && isRecording && (
                  <>
                    <Button onClick={() => setCoach(true)}>{t("assistant.coachOn")}</Button>
                    <p className="text-xs text-muted-foreground">{t("assistant.coachOptional")}</p>
                  </>
                )}
              </div>
            ) : (
              <div className="mx-auto flex max-w-[18rem] flex-col items-center gap-2.5 py-8 text-center">
                <Sparkles className="size-8 text-brand" />
                <p className="text-sm text-muted-foreground">
                  {hasMeeting ? t("assistant.emptyChat") : t("assistant.emptyChatGlobal")}
                </p>
              </div>
            )}
          </div>

          {partial && (
            <p className="px-4 py-1 text-xs text-muted-foreground">{t("assistant.partial")}</p>
          )}
          {error && (
            <p role="alert" className="max-h-28 overflow-auto break-words px-4 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
          {busy && (
            <div role="status" className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-2"><Loader2 className="size-3.5 animate-spin" />{t("assistant.generating")}</span>
              <button
                className="text-brand hover:underline"
                onClick={() => void invoke("desktop_assistant_cancel", { requestId: request.current })}
              >
                {t("assistant.cancel")}
              </button>
            </div>
          )}

          {tab === "chat" && (
            <form
              className="shrink-0 px-3 pb-3"
              onSubmit={(e) => {
                e.preventDefault();
                void ask("chat");
              }}
            >
              <div className="rounded-xl border border-input bg-card p-2.5 transition-[border-color,box-shadow] focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25">
                <textarea
                  aria-label={t("assistant.askLabel")}
                  placeholder={hasMeeting ? t("assistant.placeholder") : t("assistant.placeholderGlobal")}
                  className="max-h-40 min-h-[2.75rem] w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  value={question}
                  maxLength={3000}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void ask("chat");
                    }
                  }}
                />
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    {isLocalProvider ? <ShieldCheck className="size-3.5 shrink-0 text-success" /> : <Cloud className="size-3.5 shrink-0 text-warning" />}
                    <span className="truncate">
                      {isLocalProvider ? t("assistant.privacyLocal") : t("assistant.privacyCloud").replace("{provider}", provider)}
                      {model ? ` · ${model}` : ""}
                    </span>
                  </span>
                  <Button
                    type="submit"
                    size="icon"
                    className="ml-auto size-7 shrink-0"
                    aria-label={t("assistant.send")}
                    disabled={busy === "chat" || !session || !question.trim()}
                  >
                    <ArrowUp />
                  </Button>
                </div>
              </div>
            </form>
          )}
        </aside>
      )}
    </Context.Provider>
  );
}
