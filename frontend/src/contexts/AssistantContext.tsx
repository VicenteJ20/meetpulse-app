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
  Send,
  Pause,
  Play,
  ArrowLeft,
  Copy,
  Trash2,
  Settings2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useTranscripts } from "@/contexts/TranscriptContext";
import { useRecordingState } from "@/contexts/RecordingStateContext";
import { useConfig } from "@/contexts/ConfigContext";
import { useSidebar } from "@/components/Sidebar/SidebarProvider";
import { useTranslation } from "@/contexts/UiPreferencesContext";
import { Button } from "@/components/ui/button";
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
  const { locale } = useTranslation();
  return (
    <Button
      size="sm"
      variant={open ? "default" : "outline"}
      onClick={toggle}
      aria-expanded={open}
      aria-controls="meeting-assistant"
    >
      <MessageSquare size={16} />
      {locale === "es" ? "Asistente" : "Assistant"}
      {coach && (
        <span
          aria-label="Coach active"
          className="h-2 w-2 rounded-full bg-emerald-500"
        />
      )}
    </Button>
  );
}
export function AssistantProvider({ children }: { children: ReactNode }) {
  const { locale } = useTranslation();
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
      (prefs.cadence || 60) * 1000,
    );
    return () => clearInterval(timer);
  }, [coach, prefs.cadence, session]);
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
  function references(message: Message) {
    return (
      <div className="mt-2 space-y-1">
        {message.sources.map((source, i) => (
          <button
            key={`${source.id}-${i}`}
            onClick={() => sourceClick(source)}
            className="block w-full truncate rounded border border-border px-2 py-1 text-left text-xs text-brand hover:bg-muted"
            title={source.text}
          >
            [{i + 1}] {source.title} · {Math.floor(source.start / 60)}:
            {String(Math.floor(source.start % 60)).padStart(2, "0")}
          </button>
        ))}
      </div>
    );
  }
  const selectedScope =
    scope === "current" ? "current" : `${client} / ${project}`;
  const shown = messages.filter(
    (m) =>
      m.kind === tab &&
      !m.dismissed &&
      (tab === "coach" || m.scope === selectedScope),
  );
  return (
    <Context.Provider
      value={{ setTarget, open, toggle: () => setOpen((v) => !v), coach }}
    >
      {children}
      {open && target && (
        <aside
          id="meeting-assistant"
          aria-label={es ? "Asistente de reunión" : "Meeting assistant"}
          className="assistant-panel fixed bottom-0 right-0 top-0 z-40 flex flex-col border-l border-border bg-card"
          style={{ width }}
        >
          <div
            role="separator"
            aria-label={es ? "Ancho del asistente" : "Assistant width"}
            aria-orientation="vertical"
            aria-valuenow={width}
            aria-valuemin={320}
            aria-valuemax={560}
            tabIndex={0}
            className="absolute bottom-0 left-0 top-0 w-1 cursor-col-resize focus:bg-brand"
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
          <header className="shrink-0 border-b border-border p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">
                {es ? "Asistente" : "Assistant"}
              </h2>
              <div className="flex">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={
                    es ? "Configurar asistente" : "Assistant settings"
                  }
                  onClick={() => setSettings((v) => !v)}
                >
                  <Settings2 size={16} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={es ? "Cerrar asistente" : "Close assistant"}
                  onClick={() => setOpen(false)}
                >
                  <X size={18} />
                </Button>
              </div>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {provider === "builtin-ai" ||
              (provider === "ollama" &&
                /localhost|127\.0\.0\.1/.test(
                  modelConfig.ollamaEndpoint || "localhost",
                ))
                ? "Local"
                : `API · ${provider}`}{" "}
              · {model}
            </p>
            <div role="tablist" className="mt-3 flex gap-2">
              {(["coach", "chat"] as const).map((name) => (
                <button
                  key={name}
                  role="tab"
                  aria-selected={tab === name}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm ${tab === name ? "bg-brand/10 font-medium text-brand" : "hover:bg-muted"}`}
                  onClick={() => {
                    setTab(name);
                    setDetail(undefined);
                  }}
                >
                  {name === "coach" ? "Coach" : "Chat"}
                </button>
              ))}
            </div>
          </header>
          {settings && (
            <div className="max-h-[45vh] shrink-0 space-y-2 overflow-y-auto border-b border-border p-3 text-xs">
              <label>
                {es ? "Modelo del asistente" : "Assistant model"}
                <select
                  className="mt-1 w-full rounded border bg-background p-2"
                  value={provider}
                  onChange={(e) =>
                    void savePrefs({
                      ...prefs,
                      provider: e.target.value,
                      model: "",
                    })
                  }
                >
                  {[
                    "builtin-ai",
                    "ollama",
                    "gemini",
                    "openai",
                    "claude",
                    "groq",
                    "openrouter",
                    "custom-openai",
                  ].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <ProviderModelPicker
                provider={provider}
                value={model}
                endpoint={
                  provider === "ollama" ? modelConfig.ollamaEndpoint : undefined
                }
                onChange={(id) =>
                  void savePrefs({ ...prefs, provider, model: id })
                }
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void savePrefs({ cadence: prefs.cadence })}
              >
                {es ? "Usar modelo del análisis" : "Use analysis model"}
              </Button>
              <p>
                {es
                  ? "Las API reciben los fragmentos necesarios para responder."
                  : "API providers receive the excerpts needed to answer."}
              </p>
              <p>
                {search?.ready
                  ? `${es ? "Índice local" : "Local index"}: ${search.indexed}/${search.total}`
                  : es
                    ? "Búsqueda semántica: descarga inicial de 487 MB."
                    : "Semantic search: initial 487 MB download."}
              </p>
              <p>
                {search
                  ? `${Math.round((search.downloaded / search.totalBytes) * 100)}%`
                  : ""}{" "}
                {search?.indexing ? (es ? "Indexando…" : "Indexing…") : ""}
              </p>
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={search?.downloading}
                  onClick={async () => {
                    await searchAction("desktop_search_download", {
                      action: "start",
                    });
                  }}
                >
                  {es ? "Descargar / reanudar" : "Download / resume"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void searchAction("desktop_search_download", {
                      action: "pause",
                    })
                  }
                >
                  {es ? "Pausar" : "Pause"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void searchAction("desktop_search_download", {
                      action: "cancel",
                    })
                  }
                >
                  {es ? "Cancelar" : "Cancel"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void searchAction("desktop_search_index", { cancel: false })
                  }
                >
                  {es ? "Actualizar índice" : "Update index"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void searchAction("desktop_search_index", { cancel: true })
                  }
                >
                  {es ? "Detener índice" : "Stop indexing"}
                </Button>
              </div>
              {search?.error && (
                <p role="alert" className="text-destructive">
                  {search.error}
                </p>
              )}
            </div>
          )}
          {tab === "coach" ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b p-3">
              <Button
                size="sm"
                variant={coach ? "default" : "outline"}
                disabled={!isRecording || !session}
                onClick={() => setCoach((v) => !v)}
              >
                {coach ? <Pause size={14} /> : <Play size={14} />}{" "}
                {coach
                  ? es
                    ? "Pausar Coach"
                    : "Pause Coach"
                  : es
                    ? "Activar Coach"
                    : "Enable Coach"}
              </Button>
              <select
                aria-label={es ? "Intervalo Coach" : "Coach interval"}
                value={prefs.cadence || 60}
                onChange={(e) =>
                  void savePrefs({ ...prefs, cadence: Number(e.target.value) })
                }
                className="rounded border bg-background p-1 text-xs"
              >
                {[30, 60, 120].map((n) => (
                  <option key={n} value={n}>
                    {n}s
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="ghost"
                disabled={!!busy || !isRecording || isPaused}
                onClick={() => {
                  lastCoach.current = "";
                  void ask("coach");
                }}
              >
                {es ? "Actualizar ahora" : "Update now"}
              </Button>
            </div>
          ) : (
            <div className="shrink-0 space-y-2 border-b p-3 text-xs">
              <select
                aria-label={es ? "Alcance de consulta" : "Query scope"}
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="w-full rounded border bg-background p-2"
              >
                <option value="current">
                  {es ? "Esta reunión" : "This meeting"}
                </option>
                <option value="history">
                  {es
                    ? "Historial por cliente/proyecto"
                    : "Client/project history"}
                </option>
              </select>
              {scope === "history" && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      aria-label={es ? "Cliente" : "Client"}
                      value={client}
                      onChange={(e) => {
                        setClient(e.target.value);
                        setProject("");
                      }}
                      className="min-w-0 rounded border bg-background p-2"
                    >
                      <option value="">{es ? "Cliente" : "Client"}</option>
                      {Array.from(
                        new Set(meetings.map((m) => m.client).filter(Boolean)),
                      ).map((c) => (
                        <option key={c!}>{c}</option>
                      ))}
                    </select>
                    <select
                      aria-label={es ? "Proyecto" : "Project"}
                      value={project}
                      onChange={(e) => setProject(e.target.value)}
                      className="min-w-0 rounded border bg-background p-2"
                    >
                      <option value="">{es ? "Proyecto" : "Project"}</option>
                      {Array.from(
                        new Set(
                          meetings
                            .filter((m) => m.client === client)
                            .map((m) => m.project)
                            .filter(Boolean),
                        ),
                      ).map((p) => (
                        <option key={p!}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      aria-label={es ? "Desde" : "From"}
                      className="min-w-0 w-1/2 rounded border bg-background p-1"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                    />
                    <input
                      type="date"
                      aria-label={es ? "Hasta" : "To"}
                      className="min-w-0 w-1/2 rounded border bg-background p-1"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                    />
                  </div>
                  <button
                    className="text-brand underline"
                    onClick={() => setSettings(true)}
                  >
                    {search?.ready
                      ? `${es ? "Índice" : "Index"}: ${search.indexed}/${search.total}`
                      : es
                        ? "Activar búsqueda semántica local"
                        : "Enable local semantic search"}
                  </button>
                </>
              )}
            </div>
          )}
          <div
            className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4"
            aria-live="polite"
          >
            {detail ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDetail(undefined)}
                >
                  <ArrowLeft size={14} />
                  {es ? "Volver" : "Back"}
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
                      <h3 className="font-semibold">{d.title}</h3>
                      <p>{d.reason}</p>
                      <h4 className="font-medium">
                        {es ? "Preguntas propuestas" : "Suggested questions"}
                      </h4>
                      <ul className="list-disc space-y-1 pl-4">
                        {d.questions?.map((q, i) => (
                          <li key={i}>{q}</li>
                        ))}
                      </ul>
                      <h4 className="font-medium">
                        {es ? "Próximos pasos" : "Next steps"}
                      </h4>
                      <ul className="list-disc space-y-1 pl-4">
                        {d.steps?.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                      <h4 className="font-medium">
                        {es ? "Evidencia" : "Evidence"}
                      </h4>
                      {detail.sources.slice(0, 3).map((source) => (
                        <blockquote
                          key={source.id}
                          className="border-l-2 border-brand/40 pl-3 text-xs leading-5 text-muted-foreground"
                        >
                          {source.text.length > 600
                            ? `${source.text.slice(0, 600)}…`
                            : source.text}
                        </blockquote>
                      ))}
                      {references(detail)}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void navigator.clipboard.writeText(
                              [
                                d.title,
                                d.reason,
                                ...(d.questions || []),
                                ...(d.steps || []),
                              ].join("\n"),
                            )
                          }
                        >
                          <Copy size={14} />
                          {es ? "Copiar" : "Copy"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            await invoke("desktop_assistant_dismiss", {
                              messageId: detail.id,
                            });
                            setDetail(undefined);
                            await reload(session);
                          }}
                        >
                          <Trash2 size={14} />
                          {es ? "Descartar" : "Dismiss"}
                        </Button>
                      </div>
                    </article>
                  );
                })()}
              </>
            ) : shown.length ? (
              <div className="space-y-4">
                {shown.map((m) =>
                  m.kind === "coach" ? (
                    <button
                      key={m.id}
                      onClick={() => setDetail(m)}
                      className="w-full rounded-lg border border-border p-3 text-left text-sm hover:border-brand"
                    >
                      {(() => {
                        try {
                          return JSON.parse(m.text).title;
                        } catch {
                          return m.text;
                        }
                      })()}
                    </button>
                  ) : (
                    <article
                      key={m.id}
                      className={`rounded-lg p-3 text-sm ${m.role === "user" ? "bg-muted" : ""}`}
                    >
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        {m.role === "user" ? (es ? "Tú" : "You") : "MeetPulse"}
                      </p>
                      <div className="prose prose-sm max-w-none break-words dark:prose-invert">
                        <ReactMarkdown>{m.text}</ReactMarkdown>
                      </div>
                      {references(m)}
                    </article>
                  ),
                )}
              </div>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                {tab === "coach"
                  ? es
                    ? "Activa Coach para recibir preguntas y próximos pasos basados en la conversación. No se generarán sugerencias si no hay contenido nuevo."
                    : "Enable Coach for questions and next steps grounded in the conversation. No new content means no new suggestions."
                  : es
                    ? "Consulta la reunión actual o elige un cliente y proyecto para buscar antecedentes."
                    : "Ask about this meeting or select a client and project to find earlier discussions."}
              </p>
            )}
          </div>
          {partial && (
            <p className="px-4 py-1 text-xs text-muted-foreground">
              {es
                ? "Cobertura parcial: búsqueda textual o índice semántico incompleto."
                : "Partial coverage: text search or incomplete semantic index."}
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="max-h-28 overflow-auto break-words px-4 py-2 text-xs text-destructive"
            >
              {error}
            </p>
          )}
          {busy && (
            <div
              role="status"
              className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground"
            >
              {es ? "Generando…" : "Generating…"}
              <button
                className="text-brand"
                onClick={() =>
                  void invoke("desktop_assistant_cancel", {
                    requestId: request.current,
                  })
                }
              >
                {es ? "Cancelar" : "Cancel"}
              </button>
            </div>
          )}
          {tab === "chat" && (
            <form
              className="flex shrink-0 gap-2 border-t p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void ask("chat");
              }}
            >
              <textarea
                aria-label={
                  es ? "Pregunta a la transcripción" : "Ask the transcript"
                }
                placeholder={
                  es ? "Pregunta sobre la reunión…" : "Ask about the meeting…"
                }
                className="min-h-20 min-w-0 flex-1 resize-none rounded-lg border bg-background p-2 text-sm"
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
              <Button
                type="submit"
                size="icon"
                aria-label={es ? "Enviar consulta" : "Send question"}
                disabled={busy === "chat" || !session || !question.trim()}
              >
                <Send size={16} />
              </Button>
            </form>
          )}
        </aside>
      )}
    </Context.Provider>
  );
}
