"use client";
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "@/contexts/UiPreferencesContext";
import { Button } from "@/components/ui/button";

export interface ProviderModel {
  id: string;
  name: string;
  text: boolean | null;
  audio: boolean | null;
  inputTokens?: number;
  outputTokens?: number;
}
type Catalog = {
  models: ProviderModel[];
  cached: boolean;
  stale: boolean;
  error?: string;
};
export function ProviderModelPicker({
  provider,
  purpose = "analysis",
  value,
  onChange,
  apiKey,
  endpoint,
}: {
  provider: string;
  purpose?: string;
  value: string;
  onChange: (id: string) => void;
  apiKey?: string | null;
  endpoint?: string | null;
}) {
  const { locale } = useTranslation();
  const es = locale === "es";
  const [catalog, setCatalog] = useState<Catalog>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [audioResult, setAudioResult] = useState("");
  const version = useRef(0);
  useEffect(() => setAudioResult(""), [value]);
  async function load(refresh = false) {
    const current = ++version.current;
    setBusy(true);
    setError("");
    try {
      const result = await invoke<Catalog>("desktop_list_models", {
        provider,
        purpose,
        apiKey: apiKey ?? null,
        endpoint: endpoint ?? null,
        refresh,
      });
      if (current === version.current) {
        setCatalog(result);
        setError(result.error || "");
      }
    } catch (e) {
      if (current === version.current) setError(String(e));
    } finally {
      if (current === version.current) setBusy(false);
    }
  }
  useEffect(() => {
    ++version.current;
    setCatalog(undefined);
    setAudioResult("");
    const timer = setTimeout(() => void load(), 600);
    return () => {
      ++version.current;
      clearTimeout(timer);
    };
  }, [provider, purpose, apiKey, endpoint]);
  return (
    <div className="w-full min-w-0 space-y-2">
      <div className="flex gap-2">
        <select
          aria-label={es ? "Modelo disponible" : "Available model"}
          className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{es ? "Seleccionar modelo" : "Select model"}</option>
          {value && !catalog?.models.some((m) => m.id === value) && (
            <option value={value}>
              {value} ({es ? "selección guardada" : "saved selection"})
            </option>
          )}
          {catalog?.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name === m.id ? m.id : `${m.name} · ${m.id}`}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void load(true)}
        >
          {busy ? "…" : es ? "Actualizar" : "Refresh"}
        </Button>
      </div>
      {catalog && (
        <p className="text-xs text-muted-foreground">
          {catalog.models.length} {es ? "modelos" : "models"} ·{" "}
          {catalog.cached
            ? catalog.stale
              ? es
                ? "caché sin actualizar"
                : "stale cache"
              : "caché"
            : "API"}
        </p>
      )}
      {error && (
        <p role="alert" className="break-words text-xs text-destructive">
          {error}
        </p>
      )}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">
          {es ? "Identificador manual (avanzado)" : "Manual ID (advanced)"}
        </summary>
        <input
          aria-label={es ? "Identificador del modelo" : "Model ID"}
          className="mt-2 w-full rounded border border-input bg-background p-2 text-foreground"
          value={value}
          onChange={(e) =>
            onChange(e.target.value.trimStart().replace(/^models\//, ""))
          }
        />
      </details>
      {provider === "gemini" && purpose === "transcription" && (
        <div>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !value}
            onClick={async () => {
              setBusy(true);
              setAudioResult("");
              try {
                await invoke("desktop_test_gemini_audio", {
                  model: value,
                  apiKey: apiKey ?? null,
                });
                setAudioResult(
                  es
                    ? "Entrada de audio compatible."
                    : "Audio input supported.",
                );
              } catch (e) {
                setAudioResult(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {es ? "Probar compatibilidad de audio" : "Test audio compatibility"}
          </Button>
          <p role="status" className="mt-1 text-xs">
            {audioResult ||
              (es
                ? "La lista de modelos no garantiza soporte de audio."
                : "The model list does not guarantee audio support.")}
          </p>
        </div>
      )}
    </div>
  );
}
