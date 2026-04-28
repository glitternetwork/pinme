import chalk from 'chalk';
import { printCliError } from './utils/cliError';
import { getWalletBalance } from './utils/pinmeApi';
import { getAuthConfig } from './utils/webLogin';

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
      console.log(chalk.red('Failed to parse wallet balance.'));
      return;
    }

    console.log(chalk.cyan('Wallet balance:'));
    console.log(chalk.green(`  USD: $${balance.toFixed(2)}`));
  } catch (e: any) {
    printCliError(e, 'Failed to fetch wallet balance.');
  }
}
