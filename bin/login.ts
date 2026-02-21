/**
 * pinme login [--email <email>]
 *
 * Authenticate via email OTP.
 * Credentials are saved to ~/.pinme/auth.json (same file used by all pinme commands).
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import { getAuthConfig, setAuthTokenDirect } from './utils/auth';
import { sendEmailCode, verifyEmailCode } from './utils/worker-api';

export default async function loginCmd(): Promise<void> {
  // Check if already logged in
  const existing = getAuthConfig();
  if (existing) {
    console.log(chalk.yellow(`Already logged in as: ${existing.address}`));
    const { reauth } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'reauth',
        message: 'Log in with a different account?',
        default: false,
      },
    ]);
    if (!reauth) return;
  }

  // Get email
  const argEmail = process.argv[3];
  let email: string = argEmail?.startsWith('--') ? '' : (argEmail ?? '');

  if (!email) {
    const ans = await inquirer.prompt([
      {
        type: 'input',
        name: 'email',
        message: 'Email address:',
        validate: (v: string) =>
          v.includes('@') ? true : 'Please enter a valid email address.',
      },
    ]);
    email = ans.email.trim();
  }

  if (!email || !email.includes('@')) {
    console.log(chalk.red('Invalid email address.'));
    process.exit(1);
  }

  // Send OTP
  process.stdout.write(chalk.cyan(`Sending verification code to ${email}... `));
  try {
    await sendEmailCode(email);
    console.log(chalk.green('Sent!'));
  } catch (e: any) {
    console.log(chalk.red(`\nFailed: ${e?.message || e}`));
    process.exit(1);
  }

  // Get code
  const { code } = await inquirer.prompt([
    {
      type: 'input',
      name: 'code',
      message: 'Enter the 6-digit code:',
      validate: (v: string) =>
        /^\d{6}$/.test(v.trim()) ? true : 'Expected a 6-digit number.',
    },
  ]);

  // Verify
  process.stdout.write(chalk.cyan('Verifying... '));
  let authData: { token: string; address: string };
  try {
    authData = await verifyEmailCode(email, code.trim());
    console.log(chalk.green('Done!'));
  } catch (e: any) {
    console.log(chalk.red(`\nVerification failed: ${e?.message || e}`));
    process.exit(1);
  }

  // Save — reuse the existing auth.json format
  setAuthTokenDirect(authData.address, authData.token);

  console.log(chalk.green(`\nLogged in as: ${authData.address}`));
  console.log(chalk.gray('Credentials saved to ~/.pinme/auth.json\n'));
}
