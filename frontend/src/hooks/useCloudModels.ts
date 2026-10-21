'use client';

import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import catalog from '@/config/models.json';
import { canonicalGatewayTranscriptionModel, GATEWAY_TRANSCRIPTION_MODELS, gatewayTranscriptionChoices } from '@/lib/gateway-transcription';
import { recommendedFirst } from '@/lib/model-review';

export type CloudModel = { provider: string; id: string; label: string };
export type CloudPurpose = 'analysis' | 'transcription';

export type GatewayModel = {
  provider: 'vercel-gateway';
  id: string;
  name: string;
  label: string;
  modelType: string;
  tags: string[];
  inputModalities: string[];
  outputModalities: string[];
  zdr: string | null;
  noTraining: string | null;
  priceInput: string | null;
  priceOutput: string | null;
  transcriptionPerSecond: string | null;
  inputTokens: number | null;
};

type RawGatewayModel = {
  id: string;
  name?: string;
  modelType?: string;
  tags?: string[];
  inputModalities?: string[];
  outputModalities?: string[];
  zdr?: string | null;
  noTraining?: string | null;
  priceInput?: string | null;
  priceOutput?: string | null;
  transcriptionPerSecond?: string | null;
  inputTokens?: number | null;
  audio?: boolean | null;
};

type ProviderRule = { label: string; audio?: boolean; include: string; exclude?: string; max?: number };

const RULES = catalog.providers as Record<string, ProviderRule>;

let catalogPromise: Promise<GatewayModel[]> | null = null;

const cleanId = (id: string) => id.replace(/^models\//, '');

function toGatewayModel(model: RawGatewayModel): GatewayModel | null {
  const id = cleanId(model.id || '');
  if (!id) return null;
  const name = model.name?.trim() || id;
  return {
    provider: 'vercel-gateway',
    id,
    name,
    label: name,
    modelType: model.modelType || '',
    tags: model.tags ?? [],
    inputModalities: model.inputModalities ?? [],
    outputModalities: model.outputModalities ?? [],
    zdr: model.zdr ?? null,
    noTraining: model.noTraining ?? null,
    priceInput: model.priceInput ?? null,
    priceOutput: model.priceOutput ?? null,
    transcriptionPerSecond: model.transcriptionPerSecond ?? null,
    inputTokens: model.inputTokens ?? null,
  };
}

export function loadGatewayCatalog(refresh = false): Promise<GatewayModel[]> {
  if (!refresh && catalogPromise) return catalogPromise;
  const request = invoke<{ models?: RawGatewayModel[] }>('desktop_list_models', {
    provider: 'vercel-gateway',
    purpose: 'analysis',
    apiKey: null,
    endpoint: null,
    refresh,
  })
    .then((list) => (list.models ?? []).map(toGatewayModel).filter((model): model is GatewayModel => model !== null))
    .catch((error) => {
      catalogPromise = null;
      throw error;
    });
  catalogPromise = request;
  return request;
}

export function useGatewayCatalog() {
  const [models, setModels] = useState<GatewayModel[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const reload = (refresh = false) => {
    setLoading(true);
    return loadGatewayCatalog(refresh)
      .then((next) => {
        setModels(next);
        setError('');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadGatewayCatalog(false)
      .then((next) => {
        if (active) {
          setModels(next);
          setError('');
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { models, error, loading, reload };
}

const versionKey = (id: string) => (id.match(/\d+(\.\d+)*/g) ?? []).map((n) => n.padStart(4, '0')).join('.');

/** Keeps the models approved in models.json. Providers without a rule pass through unchanged. */
export function selectApprovedModels<T extends { id: string; audio?: boolean | null; modelType?: string; tags?: string[]; inputModalities?: string[] }>(
  provider: string,
  purpose: string,
  models: T[],
): T[] {
  if (provider === 'vercel-gateway' && purpose === 'transcription') {
    const byId = new Map<string, T>();
    for (const model of models) {
      const canonical = canonicalGatewayTranscriptionModel(model.id);
      if (canonical) byId.set(canonical, { ...model, id: canonical });
    }
    return GATEWAY_TRANSCRIPTION_MODELS.flatMap((choice) => {
      const live = byId.get(choice.id);
      return live ? [live] : [];
    });
  }
  if (provider === 'vercel-gateway') {
    const filtered = models.filter((model) => model.modelType === 'language');
    return recommendedFirst(filtered, 'analysis');
  }
  const rule = RULES[provider];
  if (!rule) return models;
  const include = new RegExp(rule.include, 'i');
  const exclude = rule.exclude ? new RegExp(rule.exclude, 'i') : null;
  return models
    .filter((model) => {
      const id = cleanId(model.id);
      if (!include.test(id) || (exclude && exclude.test(id))) return false;
      return purpose === 'transcription' ? model.audio === true : true;
    })
    .sort((a, b) => versionKey(cleanId(b.id)).localeCompare(versionKey(cleanId(a.id))) || cleanId(a.id).localeCompare(cleanId(b.id)))
    .slice(0, rule.max ?? 6);
}

/**
 * Cloud models from Vercel AI Gateway.
 * Transcription is the fixed allowlist, with MAI-Transcribe-2 first.
 * Analysis keeps language models. Recommended entries from model-review.json sort first.
 */
export function useCloudModels(purpose: CloudPurpose): CloudModel[] {
  const { models } = useGatewayCatalog();
  return useMemo(() => {
    if (purpose === 'transcription') {
      return gatewayTranscriptionChoices(models).map((model) => ({
        provider: 'vercel-gateway' as const,
        id: model.id,
        label: model.label,
      }));
    }
    const filtered = models.filter((model) => model.modelType === 'language');
    return recommendedFirst(filtered, 'analysis').map((model) => ({
      provider: 'vercel-gateway' as const,
      id: model.id,
      label: model.label,
    }));
  }, [models, purpose]);
}
