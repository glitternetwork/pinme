/**
 * Read/write pinme.toml (worker project config) and
 * .pinme/project (per-project ID file).
 */

import fs from 'fs-extra';
import path from 'path';
import toml from '@iarna/toml';

// ── pinme.toml ────────────────────────────────────────────────────────────────

export interface WorkerConfig {
  name: string;
  d1?: { migrations_dir: string };
  vars?: Record<string, string>;
  cors?: { origins: string[] };
  secrets?: { required?: string[]; optional?: string[] };
}

export function readWorkerConfig(cwd: string = process.cwd()): WorkerConfig {
  const configPath = path.join(cwd, 'pinme.toml');
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `No pinme.toml found in ${cwd}. Run: pinme worker init`,
    );
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  let parsed: Record<string, unknown>;
  try {
    parsed = toml.parse(raw) as Record<string, unknown>;
  } catch (e: any) {
    throw new Error(`Failed to parse pinme.toml: ${e.message}`);
  }

  if (!parsed.name || typeof parsed.name !== 'string') {
    throw new Error('pinme.toml: "name" is required and must be a string.');
  }

  const name = (parsed.name as string).trim();
  if (!/^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/.test(name) && !/^[a-z0-9]{1}$/.test(name)) {
    throw new Error(
      'pinme.toml: "name" must be lowercase alphanumeric with hyphens, 1-32 chars.',
    );
  }

  const config: WorkerConfig = { name };

  if (parsed.d1 && typeof parsed.d1 === 'object') {
    const d1 = parsed.d1 as Record<string, unknown>;
    if (d1.migrations_dir && typeof d1.migrations_dir === 'string') {
      config.d1 = { migrations_dir: d1.migrations_dir };
    }
  }

  if (parsed.vars && typeof parsed.vars === 'object') {
    config.vars = parsed.vars as Record<string, string>;
  }

  if (parsed.cors && typeof parsed.cors === 'object') {
    const cors = parsed.cors as Record<string, unknown>;
    if (Array.isArray(cors.origins)) {
      config.cors = { origins: cors.origins as string[] };
    }
  }

  if (parsed.secrets && typeof parsed.secrets === 'object') {
    const secrets = parsed.secrets as Record<string, unknown>;
    config.secrets = {};
    if (Array.isArray(secrets.required)) config.secrets.required = secrets.required as string[];
    if (Array.isArray(secrets.optional)) config.secrets.optional = secrets.optional as string[];
  }

  return config;
}

// ── .pinme/project ────────────────────────────────────────────────────────────

const LOCAL_DIR = '.pinme';
const PROJECT_FILE = 'project';

export interface ProjectData {
  project_id: string;
}

export function readProjectData(cwd: string = process.cwd()): ProjectData | null {
  const p = path.join(cwd, LOCAL_DIR, PROJECT_FILE);
  if (!fs.existsSync(p)) return null;
  try {
    return fs.readJsonSync(p) as ProjectData;
  } catch {
    return null;
  }
}

export function writeProjectData(data: ProjectData, cwd: string = process.cwd()): void {
  const dir = path.join(cwd, LOCAL_DIR);
  fs.mkdirpSync(dir);
  fs.writeJsonSync(path.join(dir, PROJECT_FILE), data, { spaces: 2 });
}

export function deleteProjectData(cwd: string = process.cwd()): void {
  const p = path.join(cwd, LOCAL_DIR, PROJECT_FILE);
  if (fs.existsSync(p)) fs.removeSync(p);
}
