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
import { MessageSquare } from "lucide-react";
import { useTranscripts } from "@/contexts/TranscriptContext";
import { useRecordingState } from "@/contexts/RecordingStateContext";
import { useConfig } from "@/contexts/ConfigContext";
import { useSidebar } from "@/components/Sidebar/SidebarProvider";
import { useTranslation } from "@/contexts/UiPreferencesContext";
import { Button } from "@/components/ui/button";
import { loadAssistantDefaults } from "@/lib/assistantDefaults";
import { loadAboutMe } from "@/lib/aboutMe";
import { AssistantPanel } from "./AssistantPanel";
import { AskView } from "./AskView";

export type Target = {
  id: string;
  meetingId?: string;
  title: string;
  folderPath?: string;
  context?: string;
  allMeetings?: boolean;
  initialQuestion?: string;
};
export type Source = {
  id: string;
  meetingId?: string;
  sessionId?: string;
  title: string;
  text: string;
  start: number;
  end?: number;
};
export type Message = {
  id: string;
  role: string;
  kind: string;
  text: string;
  sources: Source[];
  scope: string;
  dismissed: boolean;
};
export type Prefs = { provider?: string; model?: string; cadence?: number };
export type SearchStatus = {
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
  activeTab: "coach" | "chat";
  toggleChat: () => void;
  coach: boolean;
  toggleCoach: () => void;
  setLiveDockHost: (host: HTMLDivElement | null) => void;
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
    target.allMeetings,
    target.initialQuestion,
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

export function LiveAssistantDockHost({ isOpen }: { isOpen: boolean }) {
  const { setLiveDockHost } = useAssistant();
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLiveDockHost(hostRef.current);
    return () => setLiveDockHost(null);
  }, [setLiveDockHost]);

  return (
    <div
      ref={hostRef}
      className="live-dock-host"
      data-dock={isOpen ? "on" : "off"}
      aria-label={isOpen ? "Assistant dock" : undefined}
    />
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
  const [liveDockHost, setLiveDockHost] = useState<HTMLDivElement | null>(null);
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
  useEffect(() => {
    setScope(target?.allMeetings ? "all" : "current");
    setClient("");
    setProject("");
    setQuestion(target?.initialQuestion ?? "");
    if (target?.allMeetings) {
      setTab("chat");
      setOpen(true);
    }
  }, [target?.id, target?.allMeetings, target?.initialQuestion]);
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
      shell.dataset.assistantOpen = String(open && !!target && !liveDockHost);
      shell.style.setProperty("--assistant-width", `${width}px`);
    }
  }, [open, width, !!target, liveDockHost]);
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
    if (kind === "chat" && scope === "history" && !client) {
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
            project: kind === "chat" && scope === "history" && project ? project : null,
            allMeetings: kind === "chat" && scope === "all",
            from: from || null,
            to: to || null,
            locale,
            provider,
            model,
            aboutMe: loadAboutMe().trim() || null,
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
  const selectedScope =
    scope === "current" ? "current" : scope === "all" ? "all meetings" : project ? `${client} / ${project}` : client;
  const isAskPage = !!target?.allMeetings && !live;
  // En Preguntar la conversación entera se muestra completa: su alcance queda fijado por el primer mensaje.
  const shown = messages.filter((m) =>
    isAskPage
      ? m.kind === "chat" && !m.dismissed
      : m.kind === tab && !m.dismissed && (tab === "coach" || m.scope === selectedScope),
  );
  const firstChatScope = isAskPage ? messages.find((m) => m.kind === "chat")?.scope : undefined;
  useEffect(() => {
    if (!firstChatScope) return;
    if (firstChatScope === "all meetings") {
      setScope("all");
      setClient("");
      setProject("");
    } else {
      const [savedClient, ...rest] = firstChatScope.split(" / ");
      setScope("history");
      setClient(savedClient);
      setProject(rest.join(" / "));
    }
  }, [firstChatScope, session]);
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
  const indexLabel = search?.ready
    ? search.indexing
      ? t("assistant.indexing")
      : t("assistant.indexReady")
          .replace("{indexed}", String(search.indexed))
          .replace("{total}", String(search.total))
    : t("assistant.indexOff");

  return (
    <Context.Provider
      value={{
        setTarget,
        open,
        toggle: () => setOpen((v) => !v),
        activeTab: tab,
        toggleChat: () => {
          if (open && tab === "chat") setOpen(false);
          else {
            setTab("chat");
            setDetail(undefined);
            setOpen(true);
          }
        },
        coach,
        toggleCoach: () => {
          setTab("coach");
          setOpen(true);
          setCoach((v) => !v);
        },
        setLiveDockHost,
      }}
    >
      {children}
      {isAskPage && liveDockHost ? (
        <AskView
          t={t}
          host={liveDockHost}
          messages={shown}
          busy={busy === "chat"}
          error={error}
          partial={partial}
          question={question}
          setQuestion={setQuestion}
          ask={() => ask("chat")}
          cancel={() => {
            if (request.current) void invoke("desktop_assistant_cancel", { requestId: request.current });
            request.current = "";
            setBusy("");
          }}
          ready={!!session}
          clients={clients}
          projects={projects}
          client={client}
          project={project}
          setClient={(value) => { setClient(value); setScope(value ? "history" : "all"); }}
          setProject={setProject}
          sourceClick={sourceClick}
          isLocalProvider={isLocalProvider}
          provider={provider}
          model={model}
        />
      ) : (
      <AssistantPanel
        t={t}
        target={target}
        open={open}
        onClose={() => setOpen(false)}
        host={liveDockHost}
        width={width}
        setWidth={setWidth}
        tab={tab}
        setTab={setTab}
        coach={coach}
        setCoach={setCoach}
        settings={settings}
        setSettings={setSettings}
        indexLabel={indexLabel}
        search={search}
        provider={provider}
        model={model}
        endpoint={provider === "ollama" ? modelConfig.ollamaEndpoint ?? undefined : undefined}
        prefs={prefs}
        savePrefs={savePrefs}
        defaultCadence={defaultCadence}
        isRecording={isRecording}
        isPaused={isPaused}
        session={session}
        busy={busy}
        ask={ask}
        lastCoach={lastCoach}
        scope={scope}
        setScope={setScope}
        clients={clients}
        projects={projects}
        client={client}
        setClient={setClient}
        project={project}
        setProject={setProject}
        from={from}
        setFrom={setFrom}
        to={to}
        setTo={setTo}
        detail={detail}
        setDetail={setDetail}
        reload={reload}
        sourceClick={sourceClick}
        shown={shown}
        partial={partial}
        error={error}
        question={question}
        setQuestion={setQuestion}
        isLocalProvider={isLocalProvider}
        requestId={request.current}
      />
      )}
    </Context.Provider>
  );
}
