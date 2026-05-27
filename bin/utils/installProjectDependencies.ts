import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import chalk from 'chalk';
import { execFileSync, spawnSync } from 'child_process';

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

function runInstall(cwd: string, cacheDir: string): void {
  const npm = getNpmCommand();
  const result = spawnSync(npm, ['install', '--cache', cacheDir, '--no-audit', '--no-fund'], {
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
    throw new Error(`npm install failed with exit code ${result.status}`);
  }
}

export function installProjectDependencies(cwd: string): void {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const cacheDir = makeTempCacheDir();

    try {
      if (attempt > 1) {
        console.log(chalk.yellow('   Retrying dependency install with a fresh npm cache...'));
      }

      runInstall(cwd, cacheDir);
      return;
    } catch (error) {
      lastError = error;
    } finally {
      fs.removeSync(cacheDir);
    }
  }

  throw lastError;
}
