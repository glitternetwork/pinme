import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import { getAuthHeaders } from './utils/webLogin';

const PROJECT_DIR = process.cwd();

interface UpdateWebOptions {
  projectName?: string;
  name?: string;
}

// ============ 工具函数 ============

function loadConfig() {
  const configPath = path.join(PROJECT_DIR, 'pinme.toml');
  if (!fs.existsSync(configPath)) {
    throw new Error('pinme.toml not found');
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
    throw new Error(`Frontend build failed: ${error.message}`);
  }
}

function deployFrontend() {
  console.log(chalk.blue('Deploying frontend to IPFS...'));
  try {
    execSync('pinme upload ./frontend/dist', {
      cwd: PROJECT_DIR,
      stdio: 'inherit',
    });
    console.log(chalk.green('Frontend deployed to IPFS'));
  } catch (error: any) {
    throw new Error(`Frontend deploy failed: ${error.message}`);
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
      console.log(chalk.yellow('\n⚠️  You are not logged in.'));
      console.log(chalk.gray('Please run: pinme login'));
      process.exit(1);
    }

    // Copy token to project directory for sub-commands
    const projectDir = options?.projectName || options?.name ? path.join(PROJECT_DIR, options.projectName || options.name!) : PROJECT_DIR;
    const tokenFileSrc = path.join(PROJECT_DIR, '.token.json');
    const tokenFileDst = path.join(projectDir, '.token.json');
    if (fs.existsSync(tokenFileSrc) && !fs.existsSync(tokenFileDst)) {
      fs.copySync(tokenFileSrc, tokenFileDst);
    }

    console.log(chalk.blue('🚀 Updating web (frontend)...\n'));

    console.log(chalk.gray(`Project dir: ${PROJECT_DIR}`));

    const config = loadConfig();
    const projectName = config.project_name;

    if (!projectName) {
      throw new Error('project_name not found in pinme.toml');
    }

    console.log(chalk.gray(`Project: ${projectName}`));

    // Frontend: build + deploy
    console.log(chalk.blue('\n--- Frontend Update ---'));
    buildFrontend();
    deployFrontend();

    console.log(chalk.green('\n✅ Web update complete!'));
    process.exit(0);
  } catch (error: any) {
    console.error(chalk.red(`\n❌ Error: ${error.message}`));
    process.exit(1);
  }
}
