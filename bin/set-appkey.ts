import chalk from 'chalk';
import inquirer from 'inquirer';
import { setAuthToken } from './utils/auth';
import { getDeviceId } from './utils/getDeviceId';
import { bindAnonymousDevice } from './utils/pinmeApi';

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
  } catch (e: any) {
    console.log(chalk.red(`Failed to set AppKey: ${e?.message || e}`));
  }
}

