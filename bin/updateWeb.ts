import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import { getAuthHeaders } from './utils/webLogin';
import {
  createCommandError,
  createConfigError,
  printCliError,
} from './utils/cliError';
import { uploadPath } from './services/uploadService';

const PROJECT_DIR = process.cwd();

interface UpdateWebOptions {
  projectName?: string;
  name?: string;
}

// ============ 工具函数 ============

function loadConfig() {
  const configPath = path.join(PROJECT_DIR, 'pinme.toml');
  if (!fs.existsSync(configPath)) {
    throw createConfigError('`pinme.toml` not found in the current directory.', [
      'Run this command from the Pinme project root.',
    ]);
  }

  const configContent = fs.readFileSync(configPath, 'utf-8');
  const projectNameMatch = configContent.match(/project_name\s*=\s*"([^"]+)"/);

  return {
    project_name: projectNameMatch?.[1] || '',
  };
}

// ============ 前端构建和部署 ============

function buildFrontend() {
  console.log(chalk.blue('Building frontend...'));
  try {
    execSync('npm run build:frontend', {
      cwd: PROJECT_DIR,
      stdio: 'inherit',
    });
    console.log(chalk.green('Frontend built'));
  } catch (error: any) {
    throw createCommandError('frontend build', 'npm run build:frontend', error, [
      'Fix the frontend build error shown above, then rerun `pinme update-web`.',
    ]);
  }
}

async function deployFrontend(projectName: string): Promise<void> {
  console.log(chalk.blue('Deploying frontend to IPFS...'));
  try {
    const headers = getAuthHeaders();
    const uploadResult = await uploadPath(path.join(PROJECT_DIR, 'frontend', 'dist'), {
      projectName,
      uid: headers['token-address'],
    });
    console.log(chalk.green(`Frontend deployed to IPFS: ${uploadResult.publicUrl}`));
  } catch (error: any) {
    throw createCommandError('frontend deploy', 'upload frontend/dist', error, [
      'Make sure `frontend/dist` exists and the upload API is reachable.',
    ]);
  }
}

// ============ 主函数 ============

/**
 * Update web: build + upload frontend only (no worker, no SQL)
 */
export default async function updateWebCmd(options?: UpdateWebOptions): Promise<void> {
  try {
    // Check if user is logged in
    const headers = getAuthHeaders();
    if (!headers['authentication-tokens'] || !headers['token-address']) {
      throw createConfigError('No valid local login session was found.', [
        'Run `pinme login` and retry.',
      ]);
    }

    // Copy token to project directory for sub-commands
    const projectDir = options?.projectName || options?.name ? path.join(PROJECT_DIR, options.projectName || options.name!) : PROJECT_DIR;
    const tokenFileSrc = path.join(PROJECT_DIR, '.token.json');
    const tokenFileDst = path.join(projectDir, '.token.json');
    if (fs.existsSync(tokenFileSrc) && !fs.existsSync(tokenFileDst)) {
      fs.copySync(tokenFileSrc, tokenFileDst);
    }

    console.log(chalk.blue('Updating web (frontend)...\n'));

    console.log(chalk.gray(`Project dir: ${PROJECT_DIR}`));

    const config = loadConfig();
    const projectName = config.project_name;

    if (!projectName) {
      throw createConfigError('`project_name` is missing in `pinme.toml`.', [
        'Set `project_name = "your-project-name"` in `pinme.toml`.',
      ]);
    }

    console.log(chalk.gray(`Project: ${projectName}`));

    // Frontend: build + deploy
    console.log(chalk.blue('\n--- Frontend Update ---'));
    buildFrontend();
    await deployFrontend(projectName);

    console.log(chalk.green('\nWeb update complete.'));
    process.exit(0);
  } catch (error: any) {
    printCliError(error, 'Web update failed.');
    process.exit(1);
  }
}
