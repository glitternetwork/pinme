import chalk from 'chalk';
import inquirer from 'inquirer';
import { setAuthToken } from './utils/webLogin';
import { getDeviceId } from './utils/getDeviceId';
import { bindAnonymousDevice } from './utils/pinmeApi';
import tracker, { getTrackErrorReason } from './utils/tracker';
import {
  TRACK_EVENTS,
  TRACK_PAGES,
  resolveTrackAction,
} from './utils/trackerEvents';

export default async function setAppKeyCmd(): Promise<void> {
  try {
    const argAppKey = process.argv[3];
    let appKey = argAppKey;
    if (!appKey) {
      const ans = await inquirer.prompt([
        {
          type: 'input',
          name: 'appKey',
          message: 'Enter AppKey: ',
        },
      ]);
      appKey = ans.appKey;
    }
    if (!appKey) {
      console.log(chalk.red('AppKey not provided.'));
      return;
    }
    const saved = setAuthToken(appKey);
    console.log(chalk.green(`Auth set for address: ${saved.address}`));

    // Auto-merge anonymous history
    const deviceId = getDeviceId();
    const ok = await bindAnonymousDevice(deviceId);
    if (ok) {
      console.log(chalk.green('Anonymous history merged to current account.'));
    } else {
      console.log(chalk.yellow('Anonymous history merge not confirmed. You may retry later.'));
    }

    void tracker.trackEvent(TRACK_EVENTS.appKeySetSuccess, TRACK_PAGES.auth, {
      a: resolveTrackAction(TRACK_EVENTS.appKeySetSuccess),
      merged_anonymous_history: ok,
      has_token_address: Boolean(saved.address),
    });
  } catch (e: any) {
    void tracker.trackEvent(TRACK_EVENTS.appKeySetFailed, TRACK_PAGES.auth, {
      a: resolveTrackAction(TRACK_EVENTS.appKeySetFailed),
      reason: getTrackErrorReason(e),
    });
    console.log(chalk.red(`Failed to set AppKey: ${e?.message || e}`));
  }
}
