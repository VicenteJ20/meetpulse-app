import type { WikiConfig } from './wiki-config';

export interface WikiSummary { tenant_id: string; client_count: number; project_count: number; source_count: number; wiki_page_count: number; last_activity_at: string | null; }
export interface WikiClient { client_id: string; project_count: number; source_count: number; last_activity_at: string | null; key: string; }
export interface WikiProject { project_id: string; source_count: number; wiki_page_count: number; last_activity_at: string | null; key: string; }
export interface WikiDocument { document: string; title: string; key: string; updated_at: string | null; }
export interface WikiDocumentContent extends WikiDocument { content_markdown: string; content_type: string; }
export interface WikiIngestInput { clientId: string; projectId: string; title: string; dateTime: string; participants: string[]; markdown: string; }
export interface Paginated<T> { total: number; items: T[]; limit: number; offset: number; }
export interface WikiActivity { timestamp: string; client_id?: string; project_id?: string; [key: string]: unknown; }

export class WikiApiError extends Error {
  constructor(message: string, public readonly status?: number) { super(message); }
}

export class WikiApi {
  constructor(private readonly config: WikiConfig) {}

  private url(path: string, params?: Record<string, string | number | undefined>) {
    if (!this.config.tenantId) throw new WikiApiError('Configure a Wiki tenant before loading data.');
    const url = new URL(`/api/v1${path}`, this.config.baseUrl);
    Object.entries(params || {}).forEach(([key, value]) => { if (value !== undefined && value !== '') url.searchParams.set(key, String(value)); });
    return url.toString();
  }

  private async get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    let response: Response;
    try { response = await fetch(this.url(path, params)); }
    catch { throw new WikiApiError('Wiki API is unavailable. Check its URL and that the server is running.'); }
    if (!response.ok) {
      let detail = `Wiki API request failed (${response.status}).`;
      try { const body = await response.json(); detail = typeof body.detail === 'string' ? body.detail : detail; } catch { /* response has no JSON body */ }
      throw new WikiApiError(detail, response.status);
    }
    return response.json() as Promise<T>;
  }

  private async post<T>(path: string, body: FormData): Promise<T> {
    let response: Response;
    try { response = await fetch(this.url(path), { method: 'POST', body }); }
    catch { throw new WikiApiError('Wiki API is unavailable. Check its URL and that the server is running.'); }
    if (!response.ok) {
      let detail = `Wiki API request failed (${response.status}).`;
      try { const payload = await response.json(); detail = typeof payload.detail === 'string' ? payload.detail : detail; } catch { /* response has no JSON body */ }
      throw new WikiApiError(detail, response.status);
    }
    return response.json() as Promise<T>;
  }

  summary() { return this.get<WikiSummary>(`/dashboard/${encodeURIComponent(this.config.tenantId)}/summary`); }
  clients(limit = 50, offset = 0) { return this.get<Paginated<WikiClient>>(`/dashboard/${encodeURIComponent(this.config.tenantId)}/clients`, { limit, offset }); }
  projects(clientId: string, limit = 50, offset = 0) { return this.get<Paginated<WikiProject>>(`/dashboard/${encodeURIComponent(this.config.tenantId)}/clients/${encodeURIComponent(clientId)}/projects`, { limit, offset }); }
  activity(limit = 20) { return this.get<{ entries: WikiActivity[] }>(`/dashboard/${encodeURIComponent(this.config.tenantId)}/activity`, { limit }); }
  documents(clientId?: string, projectId?: string) { return this.get<{ items: WikiDocument[] }>(`/wiki/${encodeURIComponent(this.config.tenantId)}/documents`, { client_id: clientId, project_id: projectId }); }
  document(document: string, clientId?: string, projectId?: string) { return this.get<WikiDocumentContent>(`/wiki/${encodeURIComponent(this.config.tenantId)}/documents/${encodeURIComponent(document)}`, { client_id: clientId, project_id: projectId }); }
  ingest(input: WikiIngestInput) {
    const body = new FormData();
    body.append('tenant_id', this.config.tenantId);
    body.append('client_id', input.clientId);
    body.append('project_id', input.projectId);
    body.append('title', input.title);
    body.append('date_time', input.dateTime);
    input.participants.forEach(participant => body.append('participants', participant));
    body.append('file', new Blob([input.markdown], { type: 'text/markdown' }), 'meeting-summary.md');
    return this.post<{ source_key: string; updated_keys: string[] }>('/ingest', body);
  }
  async updateProjectContext(clientId: string, projectId: string, contentMarkdown: string) {
    let response: Response;
    try {
      response = await fetch(this.url(`/wiki/${encodeURIComponent(this.config.tenantId)}/documents/context`, { client_id: clientId, project_id: projectId }), {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content_markdown: contentMarkdown }),
      });
    } catch { throw new WikiApiError('Wiki API is unavailable. Check its URL and that the server is running.'); }
    if (!response.ok) {
      let detail = `Wiki API request failed (${response.status}).`;
      try { const payload = await response.json(); detail = typeof payload.detail === 'string' ? payload.detail : detail; } catch { /* response has no JSON body */ }
      throw new WikiApiError(detail, response.status);
    }
    return response.json() as Promise<WikiDocumentContent>;
  }
}
