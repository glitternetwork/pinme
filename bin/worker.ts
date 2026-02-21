/**
 * pinme worker <subcommand>
 *
 * Manage Cloudflare Worker backends via api.pinme.pro.
 *
 *   pinme worker init [name] [--template blank|rest-api|auth-api]
 *   pinme worker deploy [--message <msg>] [--dry-run]
 *   pinme worker status
 *   pinme worker destroy [--confirm]
 *   pinme worker logs
 *   pinme worker dev [--port <port>]
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import path from 'path';
import fs from 'fs-extra';
import { spawn } from 'child_process';
import { readWorkerConfig, readProjectData, writeProjectData, deleteProjectData } from './utils/worker-config';
import { buildWorker, formatBytes } from './utils/worker-build';
import {
  deployWorker,
  getWorkerStatus,
  destroyWorker,
  WorkerApiError,
  WORKER_API_BASE,
} from './utils/worker-api';
import { getAuthConfig } from './utils/auth';

// ── Templates ─────────────────────────────────────────────────────────────────

const BLANK_WORKER = `export interface Env {}

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    return Response.json({ message: 'Hello from pinme!' });
  },
};
`;

const BLANK_TOML = (name: string) => `name = "${name}"
`;

const REST_API_WORKER = `export interface Env {
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname, method } = url;

    try {
      if (pathname === '/api/items' && method === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM items ORDER BY created_at DESC').all();
        return Response.json(results);
      }
      if (pathname === '/api/items' && method === 'POST') {
        const body = await request.json() as { name: string; value?: string };
        if (!body.name) return Response.json({ error: 'name is required' }, { status: 400 });
        const row = await env.DB.prepare(
          'INSERT INTO items (name, value) VALUES (?, ?) RETURNING *'
        ).bind(body.name, body.value ?? null).first();
        return Response.json(row, { status: 201 });
      }
      if (pathname.startsWith('/api/items/') && method === 'DELETE') {
        const id = pathname.split('/')[3];
        await env.DB.prepare('DELETE FROM items WHERE id = ?').bind(id).run();
        return Response.json({ deleted: true });
      }
      if (pathname === '/health') return Response.json({ ok: true });
      return Response.json({ error: 'Not found' }, { status: 404 });
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 500 });
    }
  },
};
`;

const REST_API_TOML = (name: string) => `name = "${name}"

[d1]
migrations_dir = "schema"

[cors]
origins = ["*"]
`;

const REST_API_MIGRATION = `CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  value TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const GITIGNORE = `.pinme/
.env
dist/
node_modules/
`;

// ── init ──────────────────────────────────────────────────────────────────────

export async function workerInit(): Promise<void> {
  const argName = process.argv[4];
  let name: string = argName && !argName.startsWith('-') ? argName : '';

  if (!name) {
    const ans = await inquirer.prompt([
      { type: 'input', name: 'name', message: 'Project name:', validate: (v: string) =>
        /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(v.trim()) || v.trim().length === 1
          ? true
          : 'Lowercase letters, numbers and hyphens only.' },
    ]);
    name = ans.name.trim();
  }

  // Find template flag
  const tmplIdx = process.argv.indexOf('--template');
  const template = (tmplIdx !== -1 ? process.argv[tmplIdx + 1] : 'blank') as
    | 'blank'
    | 'rest-api';

  const targetDir = path.resolve(process.cwd(), name);
  if (fs.existsSync(targetDir)) {
    console.log(chalk.red(`Directory "${name}" already exists.`));
    process.exit(1);
  }

  fs.mkdirpSync(path.join(targetDir, 'src'));
  if (template === 'rest-api') {
    fs.mkdirpSync(path.join(targetDir, 'schema'));
  }

  if (template === 'rest-api') {
    fs.writeFileSync(path.join(targetDir, 'src', 'worker.ts'), REST_API_WORKER);
    fs.writeFileSync(path.join(targetDir, 'pinme.toml'), REST_API_TOML(name));
    fs.writeFileSync(path.join(targetDir, 'schema', '001_init.sql'), REST_API_MIGRATION);
    console.log(chalk.green(`Created ${name}/ with rest-api template`));
  } else {
    fs.writeFileSync(path.join(targetDir, 'src', 'worker.ts'), BLANK_WORKER);
    fs.writeFileSync(path.join(targetDir, 'pinme.toml'), BLANK_TOML(name));
    console.log(chalk.green(`Created ${name}/`));
  }

  fs.writeFileSync(path.join(targetDir, '.gitignore'), GITIGNORE);

  console.log('');
  console.log(chalk.cyan('Next steps:'));
  console.log(`  cd ${name}`);
  console.log('  pinme worker deploy');
  console.log('');
}

// ── deploy ────────────────────────────────────────────────────────────────────

export async function workerDeploy(): Promise<void> {
  const auth = getAuthConfig();
  if (!auth) {
    console.log(chalk.red('Not logged in. Run: pinme login'));
    process.exit(1);
  }

  const dryRunIdx = process.argv.indexOf('--dry-run');
  const msgIdx = process.argv.indexOf('--message');
  const message = msgIdx !== -1 ? process.argv[msgIdx + 1] : undefined;

  let config;
  try {
    config = readWorkerConfig();
  } catch (e: any) {
    console.log(chalk.red(e.message));
    process.exit(1);
  }

  if (dryRunIdx !== -1) {
    console.log(chalk.cyan(`Dry run: would deploy "${config.name}"`));
    console.log(`  Database: ${config.d1 ? 'yes' : 'no'}`);
    return;
  }

  // Build
  process.stdout.write(chalk.cyan('Building src/worker.ts... '));
  let buildResult;
  try {
    buildResult = await buildWorker();
    console.log(chalk.green(`${formatBytes(buildResult.sizeBytes)}`));
  } catch (e: any) {
    console.log(chalk.red(`\nBuild failed: ${e.message}`));
    process.exit(1);
  }

  // Collect migrations
  const migrations: Array<{ filename: string; sql: string }> = [];
  if (config.d1) {
    const migrationsDir = path.join(process.cwd(), config.d1.migrations_dir);
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir).filter((f: string) => f.endsWith('.sql')).sort();
      for (const file of files) {
        migrations.push({ filename: file, sql: fs.readFileSync(path.join(migrationsDir, file), 'utf-8') });
      }
    }
  }

  const projectData = readProjectData();
  const isNew = !projectData;

  process.stdout.write(chalk.cyan(isNew ? 'Creating project... ' : 'Deploying... '));

  try {
    const resp = await deployWorker({
      config,
      workerCode: buildResult.code,
      migrations,
      message,
      projectId: projectData?.project_id,
    });

    if (isNew) writeProjectData({ project_id: resp.project_id });

    console.log(chalk.green('Done!'));
    console.log('');
    console.log(chalk.bold(`  ${resp.url}`));
    console.log(`  Version:  v${resp.version}`);
    console.log(`  Tier:     ${resp.tier}`);

    if (resp.migrations_applied.length > 0) {
      console.log(`  Migrations: ${resp.migrations_applied.join(', ')}`);
    }
    if (resp.limits) {
      console.log(chalk.gray(`  Free tier: ${resp.limits.requests_month.toLocaleString()} requests/month`));
    }
    if (resp.usage && resp.usage.requests_limit > 0) {
      console.log(chalk.gray(`  Usage: ${resp.usage.requests_used.toLocaleString()} / ${resp.usage.requests_limit.toLocaleString()} requests this month`));
    }
    console.log('');
  } catch (e: any) {
    console.log(chalk.red('\nFailed!'));
    if (e instanceof WorkerApiError) {
      console.log(chalk.red(`  ${e.message}`));
      if (e.code === 'CONFLICT') {
        console.log(chalk.yellow('  Try a different project name in pinme.toml'));
      }
    } else {
      console.log(chalk.red(`  ${e.message}`));
    }
    process.exit(1);
  }
}

// ── status ────────────────────────────────────────────────────────────────────

export async function workerStatus(): Promise<void> {
  const auth = getAuthConfig();
  if (!auth) { console.log(chalk.red('Not logged in. Run: pinme login')); process.exit(1); }

  const projectData = readProjectData();
  if (!projectData) {
    console.log(chalk.red('No project found. Run: pinme worker deploy'));
    process.exit(1);
  }

  try {
    const s = await getWorkerStatus(projectData.project_id);
    console.log(chalk.green(s.project_id));
    console.log('');
    console.log(`  URL:         ${s.url}`);
    console.log(`  Status:      ${s.status}`);
    console.log(`  Tier:        ${s.tier}`);
    console.log(`  Version:     v${s.version}`);
    console.log(`  Last deploy: ${s.last_deployed ?? 'never'}`);
    console.log('');
    console.log('  Usage this month:');
    const limit = s.usage.requests_limit;
    const used = s.usage.requests_month;
    if (limit === 0) {
      console.log(`    Requests: ${used.toLocaleString()} (unlimited)`);
    } else {
      console.log(`    Requests: ${used.toLocaleString()} / ${limit.toLocaleString()}`);
      console.log(`    Resets:   ${new Date(s.usage.resets_at).toLocaleDateString()}`);
    }
    if (s.resources.secret_count > 0) {
      console.log('');
      console.log(`  Secrets (${s.resources.secret_count}): ${s.resources.secret_names.join(', ')}`);
    }
    if (s.migrations.length > 0) {
      console.log('');
      console.log(`  Migrations (${s.migrations.length}):`);
      for (const m of s.migrations) {
        console.log(`    ${m.filename}  ${m.applied_at}`);
      }
    }
    console.log('');
  } catch (e: any) {
    console.log(chalk.red(`Error: ${e.message}`));
    process.exit(1);
  }
}

// ── destroy ───────────────────────────────────────────────────────────────────

export async function workerDestroy(): Promise<void> {
  const auth = getAuthConfig();
  if (!auth) { console.log(chalk.red('Not logged in. Run: pinme login')); process.exit(1); }

  const projectData = readProjectData();
  if (!projectData) {
    console.log(chalk.red('No project found in current directory.'));
    process.exit(1);
  }

  const hasConfirmFlag = process.argv.includes('--confirm');

  if (!hasConfirmFlag) {
    console.log(chalk.yellow(`\nThis will permanently destroy "${projectData.project_id}" and all its data.\n`));
    const { yes } = await inquirer.prompt([
      { type: 'confirm', name: 'yes', message: 'Are you sure?', default: false },
    ]);
    if (!yes) { console.log('Cancelled.'); return; }
  }

  process.stdout.write(chalk.cyan(`Destroying ${projectData.project_id}... `));
  try {
    await destroyWorker(projectData.project_id);
    deleteProjectData();
    console.log(chalk.green('Done!'));
    console.log(chalk.gray('You are still logged in. Use "pinme worker deploy" to create a new project.\n'));
  } catch (e: any) {
    console.log(chalk.red(`\nFailed: ${e.message}`));
    process.exit(1);
  }
}

// ── logs ──────────────────────────────────────────────────────────────────────

export async function workerLogs(): Promise<void> {
  const auth = getAuthConfig();
  if (!auth) { console.log(chalk.red('Not logged in. Run: pinme login')); process.exit(1); }

  const projectData = readProjectData();
  if (!projectData) {
    console.log(chalk.red('No project found. Run: pinme worker deploy'));
    process.exit(1);
  }

  console.log(chalk.cyan('Connecting to log stream...'));

  const url = `${WORKER_API_BASE}/v1/logs/${projectData.project_id}`;

  try {
    const resp = await fetch(url, {
      headers: {
        Accept: 'text/event-stream',
        'X-Pinme-Address': auth.address,
        'X-Pinme-Token': auth.token,
      },
    });

    if (!resp.ok) {
      const body = (await resp.json()) as { error?: { message?: string } };
      console.log(chalk.red(body.error?.message ?? `Failed to connect: ${resp.status}`));
      process.exit(1);
    }

    if (!resp.body) { console.log(chalk.red('No response body.')); process.exit(1); }

    console.log(chalk.green('Connected. Press Ctrl+C to stop.\n'));

    process.on('SIGINT', () => {
      reader.cancel();
      console.log('\nDisconnected.');
      process.exit(0);
    });

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      for (const line of text.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        try {
          const parsed = JSON.parse(data) as {
            logs?: Array<{ message: string; level: string; timestamp: number }>;
            exceptions?: Array<{ name: string; message: string }>;
          };
          for (const log of parsed.logs ?? []) {
            const time = new Date(log.timestamp).toISOString().slice(11, 23);
            console.log(`  [${time}] ${log.message}`);
          }
          for (const exc of parsed.exceptions ?? []) {
            console.log(chalk.red(`  [${exc.name}] ${exc.message}`));
          }
        } catch {
          if (data !== '[DONE]') console.log(`  ${data}`);
        }
      }
    }
  } catch (e: any) {
    if ((e as NodeJS.ErrnoException).code === 'ERR_USE_AFTER_CLOSE') return;
    console.log(chalk.red(`Log stream error: ${e.message}`));
    process.exit(1);
  }
}

// ── dev ───────────────────────────────────────────────────────────────────────

export async function workerDev(): Promise<void> {
  let config;
  try {
    config = readWorkerConfig();
  } catch (e: any) {
    console.log(chalk.red(e.message));
    process.exit(1);
  }

  const portIdx = process.argv.indexOf('--port');
  const port = portIdx !== -1 ? parseInt(process.argv[portIdx + 1], 10) : 8787;

  const cwd = process.cwd();

  // Write temporary wrangler.toml
  const devDir = path.join(cwd, '.pinme');
  fs.mkdirpSync(devDir);

  const lines: string[] = [
    `name = "pinme-dev-${config.name}"`,
    `main = "src/worker.ts"`,
    `compatibility_date = "2024-12-01"`,
    `compatibility_flags = ["nodejs_compat"]`,
    '',
  ];

  if (config.vars) {
    lines.push('[vars]');
    for (const [k, v] of Object.entries(config.vars)) {
      lines.push(`${k} = "${v}"`);
    }
    lines.push('');
  }

  if (config.d1) {
    lines.push('[[d1_databases]]');
    lines.push('binding = "DB"');
    lines.push(`database_name = "pinme-dev-${config.name}"`);
    lines.push('database_id = "local-dev"');
    lines.push('');
  }

  const wranglerDevToml = path.join(devDir, 'wrangler.dev.toml');
  fs.writeFileSync(wranglerDevToml, lines.join('\n'));

  // Write .dev.vars from .env
  const envPath = path.join(cwd, '.env');
  if (fs.existsSync(envPath)) {
    fs.copyFileSync(envPath, path.join(cwd, '.dev.vars'));
  }

  console.log(chalk.green(`Starting dev server on http://localhost:${port}`));
  console.log(chalk.gray('Press Ctrl+C to stop\n'));

  // Try local wrangler first, then npx
  const localWrangler = path.join(cwd, 'node_modules', '.bin', 'wrangler');
  const useNpx = !fs.existsSync(localWrangler);

  const args = ['wrangler', 'dev', '--config', wranglerDevToml, '--port', String(port), '--local'];
  const proc = useNpx
    ? spawn('npx', args, { stdio: 'inherit', cwd, env: process.env })
    : spawn(localWrangler, args.slice(1), { stdio: 'inherit', cwd, env: process.env });

  proc.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'ENOENT') {
      console.log(chalk.red('wrangler not found. Install it: npm install wrangler'));
    } else {
      console.log(chalk.red(`Dev server error: ${err.message}`));
    }
    process.exit(1);
  });

  proc.on('exit', (code: number | null) => {
    if (code !== 0 && code !== null) process.exit(code);
  });

  process.on('SIGINT', () => proc.kill('SIGINT'));
  process.on('SIGTERM', () => proc.kill('SIGTERM'));
}
