import chalk from 'chalk';
import { login, getAuthConfig, WebLoginManager } from './utils/webLogin';
import { getDeviceId } from './utils/getDeviceId';
import { bindAnonymousDevice } from './utils/pinmeApi';

export interface EnvOption {
  env?: string;
}

const ENV_URLS: Record<string, string> = {
  dev: 'http://localhost:5173',
  test:"http://test-pinme.eth.limo",
  prod: 'https://pinme.eth.limo',
};

export default async function loginCmd(options: EnvOption = {}): Promise<void> {
  try {
    // Check if already logged in
    const existingAuth = getAuthConfig();
    if (existingAuth) {
      console.log(chalk.yellow('Already logged in'));
      console.log(chalk.gray(`   Address: ${existingAuth.address}`));
      console.log(chalk.gray('   To re-login, please run: pinme logout\n'));
      process.exit(0);
      return;
    }

    // Determine web base URL based on env
    let webBaseUrl: string | undefined;
    if (options.env) {
      const env = options.env.toLowerCase();
      if (ENV_URLS[env]) {
        webBaseUrl = ENV_URLS[env];
        console.log(chalk.blue(`Using ${env} environment: ${webBaseUrl}`));
      } else {
        console.log(chalk.yellow(`Unknown environment: ${options.env}. Using default.`));
      }
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

    // Exit the process after successful login
    process.exit(0);
  } catch (e: any) {
    console.log(chalk.red(`\nLogin failed: ${e?.message || e}`));
    process.exit(1);
  }
}
