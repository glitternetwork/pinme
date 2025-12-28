import chalk from 'chalk';
import inquirer from 'inquirer';
import { clearAuthToken, getAuthConfig } from './utils/auth';

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
    console.log(chalk.green('Successfully logged out.'));
    console.log(chalk.gray(`Address ${auth.address} has been removed from local storage.`));
  } catch (e: any) {
    console.log(chalk.red(`Failed to logout: ${e?.message || e}`));
  }
}
