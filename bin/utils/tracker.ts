import os from 'os';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { version } from '../../package.json';
import { getUid } from './getDeviceId';

export interface TrackData {
  [key: string]: string | number | boolean | null | undefined;
}

const REQUEST_TIMEOUT_MS = 1500;
const DEFAULT_GATEWAY = 'https://pinme.dev';
const DEFAULT_PRODUCT = 'pinme-cli';

const ACTION_OVERRIDES: Record<string, string> = {
  cli_login_success: 'success',
  cli_login_failed: 'fail',
  appkey_set_success: 'success',
  appkey_set_failed: 'fail',
  appkey_shown_success: 'view',
  appkey_shown_failed: 'fail',
  my_domains_success: 'view',
  my_domains_failed: 'fail',
  wallet_balance_success: 'view',
  wallet_balance_failed: 'fail',
  upload_history_viewed: 'view',
  upload_history_cleared: 'click',
  upload_history_failed: 'fail',
};

const TRACK_CHILD_SCRIPT = `
const rawUrl = process.argv[1];
if (!rawUrl) process.exit(0);
try {
  const transport = rawUrl.startsWith('https:') ? require('https') : require('http');
  const req = transport.get(rawUrl, {
    headers: {
      'User-Agent': 'Pinme-CLI-Tracker'
    }
  }, (res) => {
    res.resume();
    res.on('end', () => process.exit(0));
  });
  req.setTimeout(${REQUEST_TIMEOUT_MS}, () => req.destroy());
  req.on('error', () => process.exit(0));
  req.on('close', () => process.exit(0));
} catch (_) {
  process.exit(0);
}
`;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function shouldDisableTracking(): boolean {
  return (
    process.env.PINME_TRACKING_DISABLED === '1' ||
    process.env.DO_NOT_TRACK === '1'
  );
}

function sanitizeTrackValue(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return String(value).trim().slice(0, 200);
}

export function getTrackErrorReason(error: unknown): string {
  const candidate =
    (error as any)?.response?.data?.msg ||
    (error as any)?.response?.data?.message ||
    (error as any)?.message ||
    (error as any)?.toString?.() ||
    'unknown_error';

  return sanitizeTrackValue(candidate) || 'unknown_error';
}

function resolveTrackAction(event: string, data: TrackData = {}): string {
  const explicitAction = data.a;
  if (typeof explicitAction === 'string' && explicitAction.trim()) {
    return explicitAction.trim();
  }

  if (ACTION_OVERRIDES[event]) {
    return ACTION_OVERRIDES[event];
  }

  if (event.endsWith('_success')) {
    return 'success';
  }

  if (event.endsWith('_failed') || event.endsWith('_fail')) {
    return 'fail';
  }

  if (event.includes('click') || event.includes('copied')) {
    return 'click';
  }

  if (event.includes('exposure')) {
    return 'exposure';
  }

  if (event.includes('view')) {
    return 'view';
  }

  if (event.endsWith('_started') || event.endsWith('_submit')) {
    return 'submit';
  }

  return 'view';
}

interface ProjectContext {
  projectName?: string;
  projectDir?: string;
}

let cachedProjectContext: ProjectContext | null = null;
let cachedProjectContextCwd: string | null = null;

function resolveProjectContext(): ProjectContext {
  const cwd = process.cwd();
  if (cachedProjectContext && cachedProjectContextCwd === cwd) {
    return cachedProjectContext;
  }

  const context: ProjectContext = {};
  const configPath = path.join(cwd, 'pinme.toml');

  if (fs.existsSync(configPath)) {
    try {
      const configContent = fs.readFileSync(configPath, 'utf8');
      const projectNameMatch = configContent.match(
        /project_name\s*=\s*"([^"]+)"/,
      );

      context.projectName =
        sanitizeTrackValue(projectNameMatch?.[1]) ||
        sanitizeTrackValue(process.env.PINME_PROJECT_NAME);
      context.projectDir = sanitizeTrackValue(path.basename(cwd));
    } catch (_) {
      context.projectName = sanitizeTrackValue(process.env.PINME_PROJECT_NAME);
    }
  } else {
    context.projectName = sanitizeTrackValue(process.env.PINME_PROJECT_NAME);
  }

  cachedProjectContext = context;
  cachedProjectContextCwd = cwd;
  return context;
}

export function getPathKind(pathValue: string): string {
  try {
    const stat = fs.statSync(pathValue);
    if (stat.isDirectory()) {
      return 'directory';
    }
    if (stat.isFile()) {
      return 'file';
    }
  } catch (_) {
    return 'unknown';
  }

  return 'unknown';
}

class Tracker {
  private static instance: Tracker;
  private readonly gateway: string;
  private readonly product: string;
  private readonly source: string | undefined;
  private readonly disabled: boolean;

  private constructor(gateway?: string, product?: string) {
    this.gateway = trimTrailingSlash(
      gateway || process.env.PINME_TRACKER_GATEWAY || DEFAULT_GATEWAY,
    );
    this.product = product || DEFAULT_PRODUCT;
    this.source = sanitizeTrackValue(process.env.PINME_TRACK_SOURCE);
    this.disabled = shouldDisableTracking();
  }

  public static getInstance(gateway?: string, product?: string): Tracker {
    if (!Tracker.instance) {
      Tracker.instance = new Tracker(gateway, product);
    }
    return Tracker.instance;
  }

  public trackEvent(
    event: string,
    page: string,
    data: TrackData = {},
  ): Promise<void> {
    if (this.disabled || !this.gateway) {
      return Promise.resolve();
    }

    try {
      const payload = this.buildPayload(event, page, data);
      const params = new URLSearchParams(payload).toString();
      const url = `${this.gateway}/track.gif?${params}`;
      this.dispatch(url);
    } catch (_) {
      // Tracking is best-effort and must never interrupt CLI flows.
    }

    return Promise.resolve();
  }

  private buildPayload(
    event: string,
    page: string,
    data: TrackData,
  ): Record<string, string> {
    const projectContext = resolveProjectContext();
    const action = resolveTrackAction(event, data);
    const payload: TrackData = {
      ...data,
      u: getUid(),
      s: this.source,
      pd: this.product,
      p: page,
      a: action,
      ev: event,
      event,
      project_name: projectContext.projectName,
      project_dir: projectContext.projectDir,
      cli_version: version,
      node_version: process.version,
      os: os.platform(),
      arch: os.arch(),
    };

    const filtered: Record<string, string> = {};
    for (const [key, value] of Object.entries(payload)) {
      const normalized = sanitizeTrackValue(value);
      if (normalized) {
        filtered[key] = normalized;
      }
    }

    return filtered;
  }

  private dispatch(url: string): void {
    const child = spawn(process.execPath, ['-e', TRACK_CHILD_SCRIPT, url], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  }
}

const tracker = Tracker.getInstance();

export default tracker;
