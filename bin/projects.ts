/**
 * pinme projects
 * Lists all Cloudflare Worker projects for the current account.
 */

import chalk from 'chalk';
import { listWorkerProjects, WorkerApiError } from './utils/worker-api';
import { getAuthConfig } from './utils/auth';

function fmtBytes(bytes: number): string {
  if (bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function projectsCmd(): Promise<void> {
  const auth = getAuthConfig();
  if (!auth) {
    console.log(chalk.red('Not logged in. Run: pinme login'));
    process.exit(1);
  }

  try {
    const { projects } = await listWorkerProjects();

    if (projects.length === 0) {
      console.log(chalk.gray('No worker projects found. Run: pinme worker deploy'));
      return;
    }

    console.log(chalk.green(`${projects.length} project${projects.length !== 1 ? 's' : ''}`));
    console.log('');

    for (const p of projects) {
      const limit = p.usage.requests_limit;
      const used = p.usage.requests_month;
      const usageStr = limit > 0
        ? `${used.toLocaleString()} / ${limit.toLocaleString()} requests`
        : `${used.toLocaleString()} requests (unlimited)`;

      console.log(`  ${chalk.bold(p.project_id)}`);
      console.log(`    URL:    ${p.url}`);
      console.log(`    Tier:   ${p.tier}`);
      console.log(`    Usage:  ${usageStr}`);
      console.log(`    Size:   Worker ${fmtBytes(p.resources.worker_size_bytes)}  DB ${fmtBytes(p.resources.db_size_bytes)}`);
      if (p.last_deployed) {
        console.log(`    Deployed: ${new Date(p.last_deployed).toLocaleDateString()}`);
      }
      console.log('');
    }

    console.log(chalk.gray('Dashboard: https://pinme.pro/dashboard'));
  } catch (e: any) {
    if (e instanceof WorkerApiError) {
      console.log(chalk.red(`Failed: ${e.message}`));
    } else {
      console.log(chalk.red(`Error: ${e.message}`));
    }
    process.exit(1);
  }
}
