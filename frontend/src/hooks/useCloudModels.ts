'use client';

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import catalog from '@/config/models.json';

export type CloudModel = { provider: string; id: string; label: string };
export type CloudPurpose = 'analysis' | 'transcription';

type ProviderRule = { label: string; audio?: boolean; include: string; exclude?: string; max?: number };
type ListResult = { models: { id: string; name: string; audio?: boolean | null }[] };

const RULES = catalog.providers as Record<string, ProviderRule>;
const FALLBACK = catalog.fallback as Record<CloudPurpose, CloudModel[]>;

// La lista de cada proveedor se pide una vez por sesión de la app.
const cache = new Map<string, Promise<CloudModel[]>>();

const cleanId = (id: string) => id.replace(/^models\//, '');

// "gemini-3.1-flash-lite" -> "Gemini 3.1 Flash-Lite"
function prettify(id: string): string {
  return id
    .split('-')
    .map((part) => (/^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ')
    .replace(/(\d) (\d)/g, '$1.$2')
    .replace('Flash Lite', 'Flash-Lite');
}

const versionKey = (id: string) => (id.match(/\d+(\.\d+)*/g) ?? []).map((n) => n.padStart(4, '0')).join('.');

async function load(provider: string, purpose: CloudPurpose): Promise<CloudModel[]> {
  const rule = RULES[provider];
  if (!rule) return [];
  const include = new RegExp(rule.include, 'i');
  const exclude = rule.exclude ? new RegExp(rule.exclude, 'i') : null;
  const list = await invoke<ListResult>('desktop_list_models', {
    provider,
    purpose: purpose === 'transcription' ? 'transcription' : 'analysis',
    apiKey: null,
    endpoint: null,
    refresh: false,
  });
  return (list.models ?? [])
    .filter((m) => {
      const id = cleanId(m.id);
      if (!include.test(id) || (exclude && exclude.test(id))) return false;
      return purpose === 'transcription' ? m.audio === true : true;
    })
    .map((m) => ({ provider, id: cleanId(m.id), label: prettify(cleanId(m.id)) }))
    .sort((a, b) => versionKey(b.id).localeCompare(versionKey(a.id)) || a.id.localeCompare(b.id))
    .slice(0, rule.max ?? 6);
}

/**
 * Modelos en la nube vigentes para un uso. Salen en vivo del proveedor, filtrados por las reglas de
 * `src/config/models.json`; sin clave o sin conexión se usa la lista de respaldo del mismo archivo.
 */
export function useCloudModels(purpose: CloudPurpose): CloudModel[] {
  const [models, setModels] = useState<CloudModel[]>(FALLBACK[purpose]);

  useEffect(() => {
    let active = true;
    const providers = Object.keys(RULES).filter((p) => purpose !== 'transcription' || RULES[p].audio);
    void Promise.all(
      providers.map((provider) => {
        const key = `${provider}:${purpose}`;
        if (!cache.has(key)) cache.set(key, load(provider, purpose).catch(() => []));
        return cache.get(key)!;
      }),
    ).then((groups) => {
      if (!active) return;
      const live = groups.flat();
      setModels(live.length > 0 ? live : FALLBACK[purpose]);
    });
    return () => { active = false; };
  }, [purpose]);

  return models;
}
