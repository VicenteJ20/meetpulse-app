"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronRight, Mic, RefreshCw } from "lucide-react";
import { useTranslation } from "@/contexts/UiPreferencesContext";
import modelCatalog from "@/config/models.json";
import { selectApprovedModels } from "@/hooks/useCloudModels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";

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

// Selector de modelos de un proveedor: lista con búsqueda (desktop_list_models) integrada a la interfaz.
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
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<Catalog>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [audioResult, setAudioResult] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
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

  const approved = useMemo(() => {
    if (!catalog) return [] as ProviderModel[];
    const filtered = selectApprovedModels(provider, purpose, catalog.models ?? []);
    const hasRule = Object.prototype.hasOwnProperty.call(modelCatalog.providers, provider);
    if (!hasRule || filtered.length > 0) return filtered;
    const purposeKey = purpose === "transcription" ? "transcription" : "analysis";
    const fallback = (modelCatalog.fallback[purposeKey] ?? []).filter((model) => model.provider === provider);
    return fallback.map((model) => ({
      id: model.id,
      name: model.label,
      text: true,
      audio: purpose === "transcription" ? true : null,
    }));
  }, [catalog, provider, purpose]);

  const items = useMemo<ComboboxItem[]>(() => {
    const seen = new Set<string>();
    const list: ComboboxItem[] = [];
    for (const model of approved) {
      const id = model.id.replace(/^models\//, "");
      if (seen.has(id)) continue;
      seen.add(id);
      const name = model.name.replace(/^models\//, "");
      list.push({
        value: id,
        label: name === id ? id : name,
        description: name === id ? undefined : id,
        trailing: purpose === "transcription" && model.audio ? <Badge variant="accent"><Mic />audio</Badge> : undefined,
      });
    }
    if (value && !list.some((item) => item.value === value)) {
      list.unshift({ value, label: value, description: t("picker.saved") });
    }
    return list;
  }, [approved, value, purpose, t]);

  return (
    <div className="w-full min-w-0 space-y-2">
      <div className="flex gap-2">
        <Combobox
          className="min-w-0 flex-1"
          aria-label={t("picker.available")}
          items={items}
          value={value}
          onValueChange={onChange}
          placeholder={t("picker.select")}
          searchPlaceholder={t("picker.search")}
          emptyText={t("picker.none")}
          footer={
            catalog
              ? `${approved.length} ${t("picker.models")} · ${catalog.cached ? (catalog.stale ? t("picker.cacheStale") : t("picker.cache")) : "API"}`
              : undefined
          }
        />
        <Button size="icon" variant="outline" aria-label={t("picker.refresh")} title={t("picker.refresh")} disabled={busy} onClick={() => void load(true)}>
          <RefreshCw className={busy ? "animate-spin" : undefined} />
        </Button>
      </div>
      {error && (
        <p role="alert" className="break-words text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => setManualOpen((open) => !open)}
          aria-expanded={manualOpen}
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <ChevronRight className={manualOpen ? "size-3.5 rotate-90 transition-transform" : "size-3.5 transition-transform"} />
          {t("picker.manual")}
        </button>
        {manualOpen && (
          <Input
            aria-label={t("picker.modelId")}
            className="mt-2 font-mono text-xs"
            value={value}
            onChange={(e) => onChange(e.target.value.trimStart().replace(/^models\//, ""))}
          />
        )}
      </div>
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
                setAudioResult(t("picker.audioOk"));
              } catch (e) {
                setAudioResult(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("picker.testAudio")}
          </Button>
          <p role="status" className="mt-1 text-xs text-muted-foreground">
            {audioResult || t("picker.audioNote")}
          </p>
        </div>
      )}
    </div>
  );
}
