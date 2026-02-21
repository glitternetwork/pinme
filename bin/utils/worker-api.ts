/**
 * HTTP client for api.pinme.pro (Worker control plane).
 * Uses pinme auth headers (X-Pinme-Address + X-Pinme-Token).
 */

import { getAuthConfig } from './auth';

export const WORKER_API_BASE =
  process.env.PINME_WORKER_API_URL ?? 'https://api.pinme.pro';

export const IPFS_PROXY_BASE =
  process.env.PINME_API_BASE ?? 'https://ipfs-proxy.opena.chat';

export class WorkerApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'WorkerApiError';
  }
}

function getWorkerAuthHeaders(): Record<string, string> {
  const conf = getAuthConfig();
  if (!conf) {
    throw new WorkerApiError(
      'UNAUTHENTICATED',
      'Not logged in. Run: pinme login',
      401,
    );
  }
  return {
    'X-Pinme-Address': conf.address,
    'X-Pinme-Token': conf.token,
  };
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...getWorkerAuthHeaders(),
    ...(options.headers as Record<string, string> ?? {}),
  };

  if (!(options.body instanceof FormData) && options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const resp = await fetch(`${WORKER_API_BASE}${path}`, {
    ...options,
    headers,
  });

  const ct = resp.headers.get('content-type') ?? '';
  let body: unknown;
  if (ct.includes('application/json')) {
    body = await resp.json();
  } else {
    body = await resp.text();
  }

  if (!resp.ok) {
    const errBody = body as { error?: { code?: string; message?: string } };
    const code = errBody.error?.code ?? 'UNKNOWN_ERROR';
    const message =
      errBody.error?.message ?? `Request failed with status ${resp.status}`;
    throw new WorkerApiError(code, message, resp.status);
  }

  return body as T;
}

// ── Email login (ipfs-proxy) ──────────────────────────────────────────────────

export async function sendEmailCode(email: string): Promise<void> {
  const resp = await fetch(`${IPFS_PROXY_BASE}/api/v4/email/send-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (!resp.ok) {
    let msg = `Failed to send verification code (${resp.status})`;
    try {
      const b = (await resp.json()) as { msg?: string; message?: string };
      msg = b.msg ?? b.message ?? msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
}

export async function verifyEmailCode(
  email: string,
  code: string,
): Promise<{ token: string; address: string }> {
  const resp = await fetch(`${IPFS_PROXY_BASE}/api/v4/email/verify-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });

  if (!resp.ok) {
    let msg = `Verification failed (${resp.status})`;
    try {
      const b = (await resp.json()) as { msg?: string; message?: string };
      msg = b.msg ?? b.message ?? msg;
    } catch { /* ignore */ }
    throw new Error(msg);
  }

  const data = (await resp.json()) as { token?: string; address?: string; data?: { token?: string; address?: string } };
  // ipfs-proxy may wrap in { code, data: { token, address } }
  const token = data.token ?? data.data?.token;
  const address = data.address ?? data.data?.address ?? email;

  if (!token) throw new Error('No token in verification response.');
  return { token, address };
}

// ── Deploy ────────────────────────────────────────────────────────────────────

export interface DeployOptions {
  config: object;
  workerCode: string;
  migrations?: Array<{ filename: string; sql: string }>;
  message?: string;
  projectId?: string;
}

export interface DeployResponse {
  project_id: string;
  url: string;
  version: number;
  migrations_applied: string[];
  tier: string;
  limits?: {
    requests_month: number;
    secrets: number;
    db_mb: number;
    worker_kb: number;
  };
  usage?: {
    requests_used: number;
    requests_limit: number;
  };
}

export async function deployWorker(opts: DeployOptions): Promise<DeployResponse> {
  const form = new FormData();
  form.append('config', JSON.stringify(opts.config));
  form.append(
    'worker',
    new Blob([opts.workerCode], { type: 'application/javascript' }),
    'worker.js',
  );

  for (const m of opts.migrations ?? []) {
    form.append(
      'migrations[]',
      new Blob([m.sql], { type: 'text/plain' }),
      m.filename,
    );
  }

  if (opts.message) form.append('message', opts.message);
  if (opts.projectId) form.append('project_id', opts.projectId);

  return request<DeployResponse>('/v1/deploy', { method: 'POST', body: form });
}

// ── Status ────────────────────────────────────────────────────────────────────

export interface StatusResponse {
  project_id: string;
  status: string;
  url: string;
  tier: string;
  version: number;
  last_deployed: string | null;
  usage: {
    requests_month: number;
    requests_limit: number;
    resets_at: string;
  };
  resources: {
    db_size_bytes: number;
    worker_size_bytes: number;
    secret_count: number;
    secret_names: string[];
  };
  migrations: Array<{ filename: string; applied_at: string }>;
}

export async function getWorkerStatus(projectId: string): Promise<StatusResponse> {
  return request<StatusResponse>(`/v1/status/${projectId}`);
}

// ── Destroy ───────────────────────────────────────────────────────────────────

export async function destroyWorker(
  projectId: string,
): Promise<{ destroyed: boolean; project_id: string }> {
  return request(`/v1/destroy/${projectId}`, {
    method: 'POST',
    body: JSON.stringify({ confirm: true }),
  });
}

// ── Secrets ───────────────────────────────────────────────────────────────────

export async function setWorkerSecrets(
  projectId: string,
  secrets: Record<string, string>,
): Promise<{ set: string[]; total: number; limit: number }> {
  return request(`/v1/secrets/${projectId}`, {
    method: 'PUT',
    body: JSON.stringify({ secrets }),
  });
}

export async function deleteWorkerSecret(
  projectId: string,
  name: string,
): Promise<{ deleted: string; remaining: number }> {
  return request(`/v1/secrets/${projectId}/${name}`, { method: 'DELETE' });
}

// ── DB ────────────────────────────────────────────────────────────────────────

export async function runDbMigrations(
  projectId: string,
  migrations: Array<{ filename: string; sql: string; checksum: string }>,
): Promise<{ applied: string[]; skipped: string[]; total_applied: number }> {
  return request(`/v1/db/migrate/${projectId}`, {
    method: 'POST',
    body: JSON.stringify({ migrations }),
  });
}

export async function queryDb(
  projectId: string,
  sql: string,
): Promise<{ results: unknown[]; meta: { rows_read: number; duration_ms: number } }> {
  return request(`/v1/db/query/${projectId}`, {
    method: 'POST',
    body: JSON.stringify({ sql, params: [] }),
  });
}

// ── Projects ──────────────────────────────────────────────────────────────────

export interface ProjectSummary {
  project_id: string;
  name: string;
  url: string;
  status: string;
  tier: string;
  usage: { requests_month: number; requests_limit: number };
  resources: { worker_size_bytes: number; db_size_bytes: number };
  last_deployed: string | null;
}

export async function listWorkerProjects(): Promise<{ projects: ProjectSummary[] }> {
  return request<{ projects: ProjectSummary[] }>('/v1/projects');
}

// ── Whoami ────────────────────────────────────────────────────────────────────

export interface WhoamiResponse {
  uid: string;
  tier: 'free' | 'premium';
  project_count: number;
  member_since: string;
}

export async function getWhoami(): Promise<WhoamiResponse> {
  return request<WhoamiResponse>('/v1/whoami');
}
