/**
 * pinme secret <subcommand>
 *
 *   pinme secret set <KEY> [value]   — set a secret (prompts if value omitted)
 *   pinme secret list                — list secret names (not values)
 *   pinme secret delete <KEY>        — delete a secret
 *   pinme secret import <file>       — import secrets from a .env file
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import { readProjectData } from './utils/worker-config';
import { setWorkerSecrets, deleteWorkerSecret, getWorkerStatus, WorkerApiError } from './utils/worker-api';
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

function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}

export async function secretSet(): Promise<void> {
  const { projectId } = requireProject();

  // pinme secret set <KEY> [value]
  const key = process.argv[4];
  let value = process.argv[5];

  if (!key) {
    console.log(chalk.red('Usage: pinme secret set <KEY> [value]'));
    process.exit(1);
  }

  if (!value) {
    const ans = await inquirer.prompt([
      { type: 'password', name: 'value', message: `${key}:`, mask: '*' },
    ]);
    value = ans.value;
  }

  if (!value) {
    console.log(chalk.red('Secret value cannot be empty.'));
    process.exit(1);
  }

  try {
    const result = await setWorkerSecrets(projectId, { [key]: value });
    console.log(chalk.green(`Secret "${key}" set (${result.total}/${result.limit} used)`));
  } catch (e: any) {
    console.log(chalk.red(`Failed: ${e.message}`));
    process.exit(1);
  }
}

export async function secretList(): Promise<void> {
  const { projectId } = requireProject();

  try {
    const status = await getWorkerStatus(projectId);
    const names = status.resources.secret_names;
    if (names.length === 0) {
      console.log(chalk.gray('No secrets set.'));
    } else {
      for (const name of names) console.log(`  ${name}`);
    }
  } catch (e: any) {
    console.log(chalk.red(`Failed: ${e.message}`));
    process.exit(1);
  }
}

export async function secretDelete(): Promise<void> {
  const { projectId } = requireProject();
  const key = process.argv[4];

  if (!key) {
    console.log(chalk.red('Usage: pinme secret delete <KEY>'));
    process.exit(1);
  }

  try {
    const result = await deleteWorkerSecret(projectId, key);
    console.log(chalk.green(`Secret "${result.deleted}" deleted (${result.remaining} remaining)`));
  } catch (e: any) {
    console.log(chalk.red(`Failed: ${e.message}`));
    process.exit(1);
  }
}

export async function secretImport(): Promise<void> {
  const { projectId } = requireProject();
  const file = process.argv[4];

  if (!file) {
    console.log(chalk.red('Usage: pinme secret import <file>'));
    process.exit(1);
  }

  if (!fs.existsSync(file)) {
    console.log(chalk.red(`File not found: ${file}`));
    process.exit(1);
  }

  const secrets = parseEnvFile(fs.readFileSync(file, 'utf-8'));
  const count = Object.keys(secrets).length;

  if (count === 0) {
    console.log(chalk.yellow('No KEY=VALUE pairs found in file.'));
    return;
  }

  process.stdout.write(chalk.cyan(`Importing ${count} secret${count > 1 ? 's' : ''}... `));

  try {
    const result = await setWorkerSecrets(projectId, secrets);
    console.log(chalk.green(`${result.set.length} imported`));
  } catch (e: any) {
    console.log(chalk.red(`\nFailed: ${e.message}`));
    process.exit(1);
  }
}
