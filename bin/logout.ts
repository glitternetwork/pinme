import chalk from 'chalk';
import inquirer from 'inquirer';
import { clearAuthToken, getAuthConfig } from './utils/webLogin';
import tracker, { getTrackErrorReason } from './utils/tracker';
import {
  TRACK_EVENTS,
  TRACK_PAGES,
  resolveTrackAction,
} from './utils/trackerEvents';

export default async function logoutCmd(): Promise<void> {
  try {
    // Check if user is logged in
    const auth = getAuthConfig();
    if (!auth) {
      console.log(chalk.yellow('No active session found. You are already logged out.'));
      return;
    }

    // Confirm logout
    const answer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Are you sure you want to log out? (Current address: ${auth.address})`,
        default: false,
      },
    ]);

    if (!answer.confirm) {
      console.log(chalk.blue('Logout cancelled.'));
      return;
    }

    // Clear auth token
    clearAuthToken();
    void tracker.trackEvent(TRACK_EVENTS.logoutSuccess, TRACK_PAGES.auth, {
      a: resolveTrackAction(TRACK_EVENTS.logoutSuccess),
      had_session: true,
    });
    console.log(chalk.green('Successfully logged out.'));
    console.log(chalk.gray(`Address ${auth.address} has been removed from local storage.`));
  } catch (e: any) {
    void tracker.trackEvent(TRACK_EVENTS.logoutFailed, TRACK_PAGES.auth, {
      a: resolveTrackAction(TRACK_EVENTS.logoutFailed),
      reason: getTrackErrorReason(e),
    });
    console.log(chalk.red(`Failed to logout: ${e?.message || e}`));
  }
}
