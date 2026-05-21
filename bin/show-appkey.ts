import chalk from 'chalk';
import { getAuthConfig } from './utils/webLogin';
import tracker, { getTrackErrorReason } from './utils/tracker';
import {
  TRACK_EVENTS,
  TRACK_PAGES,
  resolveTrackAction,
} from './utils/trackerEvents';

export default function showAppKeyCmd(): void {
  try {
    const auth = getAuthConfig();
    if (!auth) {
      void tracker.trackEvent(TRACK_EVENTS.appKeyShownFailed, TRACK_PAGES.auth, {
        a: resolveTrackAction(TRACK_EVENTS.appKeyShownFailed),
        reason: 'no_appkey_found',
      });
      console.log(chalk.yellow('No AppKey found. Please set your AppKey first.'));
      console.log(chalk.gray('Run: pinme set-appkey <AppKey>'));
      return;
    }

    // Display address (safe to show)
    console.log(chalk.green('Current AppKey Information:'));
    console.log(chalk.cyan(`  Address: ${auth.address}`));
    
    // Show token with masking (show first 8 chars and last 4 chars)
    const token = auth.token;
    if (token.length > 12) {
      const maskedToken = `${token.substring(0, 8)}${'*'.repeat(token.length - 12)}${token.substring(token.length - 4)}`;
      console.log(chalk.cyan(`  Token: ${maskedToken}`));
    } else {
      // If token is too short, just show asterisks
      console.log(chalk.cyan(`  Token: ${'*'.repeat(token.length)}`));
    }

    // Show full combined format (AppKey)
    const combined = `${auth.address}-${auth.token}`;
    if (combined.length > 20) {
      const maskedAppKey = `${combined.substring(0, 12)}${'*'.repeat(combined.length - 16)}${combined.substring(combined.length - 4)}`;
      console.log(chalk.cyan(`  AppKey: ${maskedAppKey}`));
    } else {
      console.log(chalk.cyan(`  AppKey: ${'*'.repeat(combined.length)}`));
    }
    void tracker.trackEvent(TRACK_EVENTS.appKeyShownSuccess, TRACK_PAGES.auth, {
      a: resolveTrackAction(TRACK_EVENTS.appKeyShownSuccess),
      has_token_address: Boolean(auth.address),
    });
  } catch (e: any) {
    void tracker.trackEvent(TRACK_EVENTS.appKeyShownFailed, TRACK_PAGES.auth, {
      a: resolveTrackAction(TRACK_EVENTS.appKeyShownFailed),
      reason: getTrackErrorReason(e),
    });
    console.log(chalk.red(`Failed to show AppKey: ${e?.message || e}`));
  }
}
