import { desktopCapabilities } from '@/config/capabilities';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { useTranslation } from '@/contexts/UiPreferencesContext';
import { MeetingWikiState } from '@/types';
import { getWikiConfig, getWikiLastDestination, resolvePreferredTenantId, saveWikiConfig, saveWikiLastDestination, type WikiConfig } from '@/services/wiki-config';
import {
  listWikiTenants,
  WikiApi,
  WikiApiError,
  type WikiClient,
  type WikiProject,
  type WikiTenant,
} from '@/services/wiki-api';
import { isValidWikiId, sha256Hex, slugifyWikiId, withMeetingFrontMatter } from '@/lib/wiki-slug';

export type WikiPublishUiStatus =
  | 'draft'
  | 'publishing'
  | 'published'
  | 'curating'
  | 'curated'
  | 'conflict'
  | 'diverged'
  | 'error';

interface MeetingLike extends MeetingWikiState {
  id: string;
  title: string;
  created_at?: string;
  participants?: unknown;
}

interface UseWikiPublishArgs {
  meeting: MeetingLike;
  meetingTitle: string;
  client: string;
  project: string;
  getMarkdown: () => Promise<string>;
  getRawMarkdown: () => Promise<string>;
}

export function useWikiPublish({
  meeting,
  meetingTitle,
  client,
  project,
  getMarkdown,
  getRawMarkdown,
}: UseWikiPublishArgs) {
  const { t } = useTranslation();
  const [wikiState, setWikiState] = useState<MeetingWikiState>(() => wikiStateFromMeeting(meeting));
  const [isPublishing, setIsPublishing] = useState(false);
  const [destinationOpen, setDestinationOpen] = useState(false);
  const [tenants, setTenants] = useState<WikiTenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState(
    () => getWikiConfig().tenantId || getWikiLastDestination()?.tenantId || ''
  );
  const [clients, setClients] = useState<WikiClient[]>([]);
  const [projects, setProjects] = useState<WikiProject[]>([]);
  const [localAnalysisHash, setLocalAnalysisHash] = useState<string | null>(null);
  const wikiStateRef = useRef(wikiState);
  const pendingPublishRef = useRef<{ title?: string; markdown?: string } | null>(null);
  wikiStateRef.current = wikiState;

  useEffect(() => {
    if (!desktopCapabilities.wikiEnabled) return;
    setWikiState(wikiStateFromMeeting(meeting));
  }, [
    meeting.id,
    meeting.wiki_source_key,
    meeting.wiki_job_id,
    meeting.wiki_ingest_status,
    meeting.wiki_librarian_status,
    meeting.wiki_analysis_hash,
  ]);

  const persistWikiState = useCallback(async (next: MeetingWikiState) => {
    const merged = { ...wikiStateRef.current, ...next };
    setWikiState(merged);
    wikiStateRef.current = merged;
    await invoke('api_save_meeting_wiki_state', {
      meetingId: meeting.id,
      wikiTenantId: merged.wiki_tenant_id ?? null,
      wikiClientId: merged.wiki_client_id ?? null,
      wikiProjectId: merged.wiki_project_id ?? null,
      wikiSourceKey: merged.wiki_source_key ?? null,
      wikiJobId: merged.wiki_job_id ?? null,
      wikiAnalysisHash: merged.wiki_analysis_hash ?? null,
      wikiRawHash: merged.wiki_raw_hash ?? null,
      wikiPublishedAt: merged.wiki_published_at ?? null,
      wikiIngestStatus: merged.wiki_ingest_status ?? null,
      wikiLibrarianStatus: merged.wiki_librarian_status ?? null,
    });
  }, [meeting.id]);

  const refreshLocalHash = useCallback(async () => {
    try {
      const markdown = await getMarkdown();
      if (!markdown.trim()) {
        setLocalAnalysisHash(null);
        return null;
      }
      const hash = await sha256Hex(markdown);
      setLocalAnalysisHash(hash);
      return hash;
    } catch {
      return null;
    }
  }, [getMarkdown]);

  useEffect(() => {
    if (!desktopCapabilities.wikiEnabled) return;
    refreshLocalHash();
  }, [meeting.id, refreshLocalHash]);

  const status = useMemo<WikiPublishUiStatus>(() => {
    if (isPublishing) return 'publishing';
    if (wikiState.wiki_ingest_status === 'error') return 'error';
    if (wikiState.wiki_ingest_status === 'conflict') return 'conflict';
    if (wikiState.wiki_source_key) {
      if (localAnalysisHash && wikiState.wiki_analysis_hash && localAnalysisHash !== wikiState.wiki_analysis_hash) {
        return 'diverged';
      }
      if (wikiState.wiki_librarian_status === 'succeeded') return 'curated';
      if (wikiState.wiki_librarian_status === 'failed') return 'published';
      if (wikiState.wiki_job_id && wikiState.wiki_librarian_status !== 'succeeded') return 'curating';
      return 'published';
    }
    return 'draft';
  }, [isPublishing, localAnalysisHash, wikiState]);

  const destination = useMemo(() => resolveDestination(selectedTenant, client, project), [selectedTenant, client, project]);

  const loadCatalog = useCallback(async (tenantId: string, clientId?: string) => {
    if (!desktopCapabilities.wikiEnabled || !tenantId) {
      setClients([]);
      setProjects([]);
      return;
    }
    try {
      const api = new WikiApi({ ...getWikiConfig(), tenantId });
      const clientPage = await api.clients(100, 0);
      setClients(clientPage.items || []);
      const resolvedClient = slugifyWikiId(clientId || client);
      if (resolvedClient) {
        const projectPage = await api.projects(resolvedClient, 100, 0);
        setProjects(projectPage.items || []);
      } else {
        setProjects([]);
      }
    } catch (error) {
      console.warn('Failed to load Wiki catalog', error);
    }
  }, [client]);

  const openDestination = useCallback(async () => {
    if (!desktopCapabilities.wikiEnabled) return false;
    try {
      const available = await listWikiTenants();
      if (!available.length) {
        toast.error(t('meeting.wikiMissingTenant'));
        return false;
      }
      const tenantId = resolvePreferredTenantId(available);
      if (tenantId) saveWikiConfig({ ...getWikiConfig(), tenantId });
      setTenants(available);
      setSelectedTenant(tenantId);
      await loadCatalog(tenantId, client);
      setDestinationOpen(true);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('wiki.errorGeneric'));
      return false;
    }
  }, [client, loadCatalog, t]);

  useEffect(() => {
    if (!desktopCapabilities.wikiEnabled) return;
    if (selectedTenant) {
      loadCatalog(selectedTenant, client);
    }
  }, [selectedTenant, client, loadCatalog]);

  useEffect(() => {
    if (!desktopCapabilities.wikiEnabled) return;
    let cancelled = false;
    listWikiTenants().then(available => {
      if (cancelled) return;
      setTenants(available);
      const selected = resolvePreferredTenantId(available);
      if (selected) saveWikiConfig({ ...getWikiConfig(), tenantId: selected });
      setSelectedTenant(selected);
    }).catch(error => {
      console.warn('Failed to load Wiki tenants', error);
    });
    return () => { cancelled = true; };
  }, [meeting.id]);

  useEffect(() => {
    if (!desktopCapabilities.wikiEnabled) return;
    const onChange = (event: Event) => {
      const next = (event as CustomEvent<WikiConfig>).detail;
      if (next.tenantId) setSelectedTenant(next.tenantId);
    };
    window.addEventListener('wiki-config-changed', onChange);
    return () => window.removeEventListener('wiki-config-changed', onChange);
  }, []);

  const ingest = useCallback(async (override?: { tenantId?: string; clientId?: string; projectId?: string; markdown?: string; title?: string }) => {
    if (!desktopCapabilities.wikiEnabled) return { ok: true, skipped: true as const };
    const current = wikiStateRef.current;
    if (current.wiki_source_key && current.wiki_ingest_status !== 'error') {
      return { ok: true, skipped: true as const };
    }

    const resolved = resolveDestination(
      override?.tenantId || selectedTenant || getWikiConfig().tenantId,
      override?.clientId ?? client,
      override?.projectId ?? project,
    );
    if (!resolved.ready) {
      pendingPublishRef.current = { title: override?.title, markdown: override?.markdown };
      if (!resolved.tenantId) {
        const available = tenants.length ? tenants : await listWikiTenants();
        const preferredTenant = resolvePreferredTenantId(available);
        if (preferredTenant) {
          saveWikiConfig({ ...getWikiConfig(), tenantId: preferredTenant });
          setSelectedTenant(preferredTenant);
          const retry = resolveDestination(preferredTenant, override?.clientId ?? client, override?.projectId ?? project);
          if (retry.ready) return ingest({ ...override, tenantId: preferredTenant });
        } else if (!available.length) {
          toast.error(t('meeting.wikiMissingTenant'));
          return { ok: false };
        }
      }
      await openDestination();
      toast.info(resolved.tenantId ? t('meeting.wikiNeedsClientProject') : t('meeting.wikiNeedsDestination'));
      return { ok: false, needsDestination: true as const };
    }

    setIsPublishing(true);
    try {
      const markdown = override?.markdown || pendingPublishRef.current?.markdown || await getMarkdown();
      const rawMarkdown = await getRawMarkdown();
      if (!markdown.trim()) throw new Error(t('meeting.wikiMissingSummary'));
      if (!rawMarkdown.trim()) throw new Error(t('meeting.wikiMissingTranscript'));

      const title = override?.title?.trim() || pendingPublishRef.current?.title?.trim() || meetingTitle.trim() || meeting.title;
      const participants = Array.isArray(meeting.participants) && meeting.participants.length
        ? meeting.participants.map(String)
        : ['Not specified'];
      const analysis = withMeetingFrontMatter(markdown, meeting.id);
      const analysisHash = await sha256Hex(markdown);
      const rawHash = await sha256Hex(rawMarkdown);
      const config = { ...getWikiConfig(), tenantId: resolved.tenantId };
      saveWikiConfig(config);

      const result = await new WikiApi(config).ingest({
        clientId: resolved.clientId,
        projectId: resolved.projectId,
        title,
        dateTime: meeting.created_at || new Date().toISOString(),
        participants,
        markdown: analysis,
        rawMarkdown,
      });

      await persistWikiState({
        wiki_tenant_id: resolved.tenantId,
        wiki_client_id: resolved.clientId,
        wiki_project_id: resolved.projectId,
        wiki_source_key: result.source_key,
        wiki_job_id: result.job_id,
        wiki_analysis_hash: analysisHash,
        wiki_raw_hash: rawHash,
        wiki_published_at: new Date().toISOString(),
        wiki_ingest_status: result.ingest_status,
        wiki_librarian_status: result.processing_status || 'pending',
      });
      saveWikiLastDestination({
        tenantId: resolved.tenantId,
        clientId: resolved.clientId,
        projectId: resolved.projectId,
      });
      setLocalAnalysisHash(analysisHash);
      pendingPublishRef.current = null;
      setDestinationOpen(false);

      if (result.ingest_status === 'reconciled') toast.success(t('meeting.wikiReconciled'));
      else if (result.ingest_status === 'unchanged') toast.success(t('meeting.wikiUnchanged'));
      else toast.success(t('meeting.wikiPublished'));
      return { ok: true, skipped: false as const };
    } catch (error) {
      if (error instanceof WikiApiError && error.status === 409) {
        await persistWikiState({
          wiki_tenant_id: resolved.tenantId,
          wiki_client_id: resolved.clientId,
          wiki_project_id: resolved.projectId,
          wiki_source_key: error.sourceKey || current.wiki_source_key,
          wiki_ingest_status: 'conflict',
        });
        toast.error(t('meeting.wikiConflict'));
        pendingPublishRef.current = null;
        setDestinationOpen(false);
        return { ok: false, conflict: true as const };
      }
      const message = error instanceof WikiApiError && error.status === 422
        ? t('meeting.wikiInvalidId')
        : error instanceof Error ? error.message : t('wiki.errorGeneric');
      await persistWikiState({ wiki_ingest_status: 'error' });
      toast.error(message);
      return { ok: false };
    } finally {
      setIsPublishing(false);
    }
  }, [client, getMarkdown, getRawMarkdown, meeting, meetingTitle, openDestination, persistWikiState, project, selectedTenant, t, tenants]);

  const publishAfterAnalysis = useCallback(async (payload?: { title?: string; markdown?: string }) => {
    if (!desktopCapabilities.wikiEnabled) return;
    await refreshLocalHash();
    if (wikiStateRef.current.wiki_source_key && wikiStateRef.current.wiki_ingest_status !== 'error') {
      return;
    }
    await ingest(payload);
  }, [ingest, refreshLocalHash]);

  const confirmDestination = useCallback(async () => {
    return ingest({ tenantId: selectedTenant });
  }, [ingest, selectedTenant]);

  useEffect(() => {
    if (!desktopCapabilities.wikiEnabled) return;
    const jobId = wikiState.wiki_job_id;
    const tenantId = wikiState.wiki_tenant_id || getWikiConfig().tenantId;
    const librarian = wikiState.wiki_librarian_status;
    if (!jobId || !tenantId || librarian === 'succeeded' || librarian === 'failed') return;

    let cancelled = false;
    const poll = async () => {
      try {
        const job = await new WikiApi({ ...getWikiConfig(), tenantId }).job(jobId);
        if (cancelled) return;
        if (job.status === wikiStateRef.current.wiki_librarian_status) return;
        await persistWikiState({ wiki_librarian_status: job.status });
        if (job.status === 'succeeded') {
          toast.success(t('meeting.wikiLibrarianUpdated').replace('{project}', wikiStateRef.current.wiki_project_id || project));
        } else if (job.status === 'failed') {
          toast.error(t('meeting.wikiLibrarianFailed'));
        }
      } catch (error) {
        console.warn('Failed to poll Wiki librarian job', error);
      }
    };

    poll();
    const timer = window.setInterval(poll, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [persistWikiState, project, t, wikiState.wiki_job_id, wikiState.wiki_librarian_status, wikiState.wiki_tenant_id]);

  return {
    status,
    isPublishing,
    destinationOpen,
    setDestinationOpen,
    destination,
    tenants,
    selectedTenant,
    setSelectedTenant,
    clients,
    projects,
    publishAfterAnalysis,
    confirmDestination,
    retryPublish: ingest,
    refreshLocalHash,
    openDestination,
    openWiki: () => { window.location.href = '/wiki'; },
  };
}

function wikiStateFromMeeting(meeting: MeetingWikiState): MeetingWikiState {
  return {
    wiki_tenant_id: meeting.wiki_tenant_id,
    wiki_client_id: meeting.wiki_client_id,
    wiki_project_id: meeting.wiki_project_id,
    wiki_source_key: meeting.wiki_source_key,
    wiki_job_id: meeting.wiki_job_id,
    wiki_analysis_hash: meeting.wiki_analysis_hash,
    wiki_raw_hash: meeting.wiki_raw_hash,
    wiki_published_at: meeting.wiki_published_at,
    wiki_ingest_status: meeting.wiki_ingest_status,
    wiki_librarian_status: meeting.wiki_librarian_status,
  };
}

function resolveDestination(tenantId: string, client: string, project: string) {
  const clientId = slugifyWikiId(client);
  const projectId = slugifyWikiId(project);
  return {
    tenantId: tenantId.trim(),
    clientId,
    projectId,
    ready: Boolean(tenantId.trim() && isValidWikiId(clientId) && isValidWikiId(projectId)),
  };
}
