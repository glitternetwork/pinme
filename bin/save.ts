import chalk from 'chalk';
import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';

interface SaveOptions {
  projectName?: string;
  name?: string;
}

/**
 * Save and deploy the project (frontend + backend)
 * Runs: npm run deploy
 */
export default async function saveCmd(options: SaveOptions): Promise<void> {
  try {
    const projectName = options.projectName || options.name || 'template';
    const projectDir = path.join(process.cwd(), projectName);

    // Check if project directory exists
    if (!fs.existsSync(projectDir)) {
      console.log(chalk.yellow(`\nProject "${projectName}" not found.`));
      console.log(chalk.gray(`Please run: pinme create`));
      process.exit(1);
    }

    // Check if package.json exists
    const packageJsonPath = path.join(projectDir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      console.log(chalk.red(`\nError: package.json not found in ${projectDir}`));
      process.exit(1);
    }

    console.log(chalk.blue(`Deploying project: ${projectName}...\n`));

    // Install dependencies if node_modules doesn't exist
    const nodeModulesPath = path.join(projectDir, 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
      console.log(chalk.blue('Installing dependencies...'));
      execSync('npm install', { cwd: projectDir, stdio: 'inherit' });
    }

    // Deploy frontend and backend
    console.log(chalk.blue('\nDeploying frontend and backend...'));
    execSync('npm run deploy', { cwd: projectDir, stdio: 'inherit' });

    console.log(chalk.green('\n✅ Deployment completed successfully!'));

    process.exit(0);
  } catch (error: any) {
    console.error(chalk.red(`\nDeployment failed: ${error.message || error}`));
    process.exit(1);
  }
}
