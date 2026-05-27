import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import chalk from 'chalk';
import { spawnSync } from 'child_process';

export class DependencyInstallError extends Error {
  command: string;

  constructor(command: string, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`${command} failed: ${reason}`);
    this.name = 'DependencyInstallError';
    this.command = command;
    this.cause = cause;
  }
}

function makeTempCacheDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pinme-npm-cache-'));
}

function getNpmCommand(): string {
  // On Windows, npm is often installed as npm.cmd
  if (process.platform === 'win32') {
    return 'npm.cmd';
  }
  return 'npm';
}

function hasPackageLock(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, 'package-lock.json'));
}

function getInstallScript(cwd: string): 'ci' | 'install' {
  return hasPackageLock(cwd) ? 'ci' : 'install';
}

function formatInstallCommand(script: 'ci' | 'install'): string {
  return `npm ${script} --cache <isolated npm cache> --no-audit --no-fund`;
}

function runInstall(cwd: string, cacheDir: string, script: 'ci' | 'install'): void {
  const npm = getNpmCommand();
  const result = spawnSync(npm, [script, '--cache', cacheDir, '--no-audit', '--no-fund'], {
    cwd,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      npm_config_cache: cacheDir,
      npm_config_audit: 'false',
      npm_config_fund: 'false',
    },
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`npm ${script} failed with exit code ${result.status}`);
  }
}

export function installProjectDependencies(cwd: string): void {
  const script = getInstallScript(cwd);
  const command = formatInstallCommand(script);
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const cacheDir = makeTempCacheDir();

    try {
      if (attempt > 1) {
        console.log(chalk.yellow('   Retrying dependency install with a fresh npm cache...'));
      }

      if (attempt === 1 && script === 'ci') {
        console.log(chalk.gray('   package-lock.json found; using npm ci for a reproducible install.'));
      }

      runInstall(cwd, cacheDir, script);
      return;
    } catch (error) {
      lastError = error;
    } finally {
      fs.removeSync(cacheDir);
    }
  }

  throw new DependencyInstallError(command, lastError);
}
