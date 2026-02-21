/**
 * pinme db <subcommand>
 *
 *   pinme db migrate [--dry-run]      — run pending migrations against remote D1
 *   pinme db migrate:create <name>    — create a new migration file
 *   pinme db query "<sql>" [--json]   — execute SQL on remote D1
 */

import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { createHash } from 'crypto';
import { readWorkerConfig, readProjectData } from './utils/worker-config';
import { runDbMigrations, queryDb, WorkerApiError } from './utils/worker-api';
import { getAuthConfig } from './utils/auth';

function requireProject(): { projectId: string } {
  const auth = getAuthConfig();
  if (!auth) { console.log(chalk.red('Not logged in. Run: pinme login')); process.exit(1); }

  const projectData = readProjectData();
  if (!projectData) {
    console.log(chalk.red('No project found in current directory. Run: pinme worker deploy'));
    process.exit(1);
  }
  return { projectId: projectData.project_id };
}

export async function dbMigrate(): Promise<void> {
  const { projectId } = requireProject();

  let config;
  try {
    config = readWorkerConfig();
  } catch (e: any) {
    console.log(chalk.red(e.message));
    process.exit(1);
  }

  if (!config.d1) {
    console.log(chalk.red('No [d1] section in pinme.toml. Add migrations_dir to use migrations.'));
    process.exit(1);
  }

  const migrationsDir = path.join(process.cwd(), config.d1.migrations_dir);
  if (!fs.existsSync(migrationsDir)) {
    console.log(chalk.yellow(`Migrations directory not found: ${config.d1.migrations_dir}`));
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter((f: string) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log(chalk.yellow('No migration files found.'));
    return;
  }

  const isDryRun = process.argv.includes('--dry-run');
  if (isDryRun) {
    console.log(chalk.cyan('Migrations that would run:'));
    for (const f of files) console.log(`  ${f}`);
    return;
  }

  const migrations = files.map((filename: string) => {
    const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf-8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    return { filename, sql, checksum };
  });

  try {
    const result = await runDbMigrations(projectId, migrations);
    if (result.applied.length === 0) {
      console.log(chalk.green('All migrations already applied.'));
    } else {
      for (const m of result.applied) console.log(chalk.green(`  Applied: ${m}`));
    }
    if (result.skipped.length > 0) {
      console.log(chalk.gray(`  Skipped (already applied): ${result.skipped.join(', ')}`));
    }
  } catch (e: any) {
    console.log(chalk.red(`Migration failed: ${e.message}`));
    process.exit(1);
  }
}

export function dbMigrateCreate(): void {
  const nameArg = process.argv[5]; // pinme db migrate:create <name>
  if (!nameArg) {
    console.log(chalk.red('Usage: pinme db migrate:create <name>'));
    process.exit(1);
  }

  let config;
  try {
    config = readWorkerConfig();
  } catch (e: any) {
    console.log(chalk.red(e.message));
    process.exit(1);
  }

  const migrationsDir = path.join(process.cwd(), config.d1?.migrations_dir ?? 'schema');
  fs.mkdirpSync(migrationsDir);

  const existing = fs.existsSync(migrationsDir)
    ? fs.readdirSync(migrationsDir).filter((f: string) => f.endsWith('.sql')).sort()
    : [];

  let nextNum = 1;
  if (existing.length > 0) {
    const last = parseInt(existing[existing.length - 1].split('_')[0], 10);
    if (!isNaN(last)) nextNum = last + 1;
  }

  const numStr = String(nextNum).padStart(3, '0');
  const safeName = nameArg.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
  const filename = `${numStr}_${safeName}.sql`;
  const filepath = path.join(migrationsDir, filename);

  fs.writeFileSync(filepath, `-- Migration: ${filename}\n-- Created: ${new Date().toISOString()}\n\n`);

  console.log(chalk.green(`Created: ${config.d1?.migrations_dir ?? 'schema'}/${filename}`));
}

export async function dbQuery(): Promise<void> {
  const { projectId } = requireProject();

  // Find SQL arg (first non-flag after 'query')
  const queryIdx = process.argv.indexOf('query');
  const sql = queryIdx !== -1 ? process.argv[queryIdx + 1] : undefined;

  if (!sql) {
    console.log(chalk.red('Usage: pinme db query "<sql>"'));
    process.exit(1);
  }

  const isJson = process.argv.includes('--json');

  try {
    const result = await queryDb(projectId, sql);
    const rows = result.results as Record<string, unknown>[];

    if (isJson) {
      console.log(JSON.stringify(rows, null, 2));
      return;
    }

    if (rows.length === 0) {
      console.log(chalk.gray('No results.'));
      return;
    }

    const keys = Object.keys(rows[0]);
    console.log('  ' + keys.join('\t'));
    console.log('  ' + keys.map(() => '---').join('\t'));
    for (const row of rows) {
      console.log('  ' + keys.map((k) => String(row[k] ?? '')).join('\t'));
    }
    console.log('');
    console.log(chalk.gray(`${rows.length} row${rows.length === 1 ? '' : 's'} (${result.meta.duration_ms.toFixed(1)}ms)`));
  } catch (e: any) {
    if (e instanceof WorkerApiError) {
      console.log(chalk.red(`Query failed: ${e.message}`));
    } else {
      console.log(chalk.red(`Error: ${e.message}`));
    }
    process.exit(1);
  }
}
