import chalk from 'chalk';
import { WebLoginManager } from './utils/webLogin';
import { getDeviceId } from './utils/getDeviceId';
import { bindAnonymousDevice } from './utils/pinmeApi';
import tracker, { getTrackErrorReason } from './utils/tracker';
import {
  TRACK_EVENTS,
  TRACK_PAGES,
  resolveTrackAction,
} from './utils/trackerEvents';

export interface EnvOption {
  env?: string;
}

const ENV_URLS: Record<string, string> = {
  dev: 'http://localhost:5173',
  test: 'http://test-pinme.pinit.eth.limo',
  prod: 'https://pinme.eth.limo',
};

export default async function loginCmd(options: EnvOption = {}): Promise<void> {
  const env = (options.env || 'prod').toLowerCase();

  try {
    // Determine web base URL based on env
    let webBaseUrl: string | undefined;
    // 默认使用 prod 环境
    if (ENV_URLS[env]) {
      webBaseUrl = ENV_URLS[env];
      console.log(chalk.blue(`Using ${env} environment: ${webBaseUrl}`));
    } else {
      console.log(
        chalk.yellow(
          `Unknown environment: ${options.env}. Using default prod.`,
        ),
      );
      webBaseUrl = ENV_URLS.prod;
      console.log(chalk.blue(`Using prod environment: ${webBaseUrl}`));
    }

    // Perform login with custom webBaseUrl if specified
    const manager = new WebLoginManager({ webBaseUrl });
    await manager.login();

    // Merge anonymous history
    console.log(chalk.blue('\nMerging history...'));
    const deviceId = getDeviceId();
    const ok = await bindAnonymousDevice(deviceId);
    if (ok) {
      console.log(chalk.green('History merged to your account'));
    }

    void tracker.trackEvent(TRACK_EVENTS.cliLoginSuccess, TRACK_PAGES.login, {
      a: resolveTrackAction(TRACK_EVENTS.cliLoginSuccess),
      env,
      has_token_address: true,
      merged_anonymous_history: ok,
    });

    // Exit the process after successful login
    process.exit(0);
  } catch (e: any) {
    void tracker.trackEvent(TRACK_EVENTS.cliLoginFailed, TRACK_PAGES.login, {
      a: resolveTrackAction(TRACK_EVENTS.cliLoginFailed),
      env,
      reason: getTrackErrorReason(e),
    });
    console.log(chalk.red(`\nLogin failed: ${e?.message || e}`));
    process.exit(1);
  }
}
