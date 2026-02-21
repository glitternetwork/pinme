/**
 * pinme whoami
 * Shows current account identity and tier information.
 */

import chalk from 'chalk';
import { getWhoami, WorkerApiError } from './utils/worker-api';
import { getAuthConfig } from './utils/auth';

export default async function whoamiCmd(): Promise<void> {
  const auth = getAuthConfig();
  if (!auth) {
    console.log(chalk.red('Not logged in. Run: pinme login'));
    process.exit(1);
  }

  try {
    const info = await getWhoami();

    console.log(chalk.green(info.uid));
    console.log('');
    console.log(`  Tier:      ${info.tier === 'premium' ? chalk.yellow('premium') : 'free'}`);
    console.log(`  Workers:   ${info.project_count}`);
    console.log(`  Since:     ${new Date(info.member_since).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })}`);
    console.log('');
  } catch (e: any) {
    if (e instanceof WorkerApiError) {
      console.log(chalk.red(`Failed: ${e.message}`));
    } else {
      console.log(chalk.red(`Error: ${e.message}`));
    }
    process.exit(1);
  }
}
