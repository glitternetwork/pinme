import chalk from 'chalk';
import { printCliError, printRechargeUrl } from './utils/cliError';
import { getWalletRechargeUrl } from './utils/config';
import { getWalletBalance } from './utils/pinmeApi';
import { getAuthConfig } from './utils/webLogin';
import tracker, { getTrackErrorReason } from './utils/tracker';
import {
  TRACK_EVENTS,
  TRACK_PAGES,
  resolveTrackAction,
} from './utils/trackerEvents';

export default async function walletBalanceCmd(): Promise<void> {
  try {
    const auth = getAuthConfig();
    if (!auth) {
      console.log(chalk.yellow('Please login first. Run: pinme set-appkey <AppKey>'));
      return;
    }

    const result = await getWalletBalance(auth.address, auth.token);
    const balance = Number(result.data?.wallet_balance_usd ?? 0);

    if (!Number.isFinite(balance)) {
      void tracker.trackEvent(TRACK_EVENTS.walletBalanceFailed, TRACK_PAGES.wallet, {
        a: resolveTrackAction(TRACK_EVENTS.walletBalanceFailed),
        reason: 'invalid_balance_value',
      });
      console.log(chalk.red('Failed to parse wallet balance.'));
      return;
    }

    void tracker.trackEvent(TRACK_EVENTS.walletBalanceSuccess, TRACK_PAGES.wallet, {
      a: resolveTrackAction(TRACK_EVENTS.walletBalanceSuccess),
      has_balance: balance > 0,
      balance_usd: balance.toFixed(2),
    });
    console.log(chalk.cyan('Wallet balance:'));
    console.log(chalk.green(`  USD: $${balance.toFixed(2)}`));

    if (balance <= 0) {
      console.log(chalk.red('Insufficient wallet balance. Please recharge your wallet first.'));
      printRechargeUrl(getWalletRechargeUrl());
    }
  } catch (e: any) {
    void tracker.trackEvent(TRACK_EVENTS.walletBalanceFailed, TRACK_PAGES.wallet, {
      a: resolveTrackAction(TRACK_EVENTS.walletBalanceFailed),
      reason: getTrackErrorReason(e),
    });
    printCliError(e, 'Failed to fetch wallet balance.');
  }
}
