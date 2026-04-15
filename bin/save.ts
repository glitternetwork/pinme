import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import { execSync } from 'child_process';
import { getAuthHeaders } from './utils/webLogin';
import { installProjectDependencies } from './utils/installProjectDependencies';
import {
  createApiError,
  createCommandError,
  createConfigError,
  printCliError,
} from './utils/cliError';
import { getPinmeApiUrl } from './utils/config';
import { uploadPath } from './services/uploadService';

const PROJECT_DIR = process.cwd();
interface SaveOptions {
  projectName?: string;
  name?: string;
}

// ============ 工具函数 ============

function loadConfig() {
  const configPath = path.join(PROJECT_DIR, 'pinme.toml');
  if (!fs.existsSync(configPath)) {
    throw createConfigError('`pinme.toml` not found in the current directory.', [
      'Run this command from the Pinme project root.',
      'If the project has not been initialized yet, create or restore `pinme.toml` first.',
    ]);
  }

  const configContent = fs.readFileSync(configPath, 'utf-8');
  const projectNameMatch = configContent.match(/project_name\s*=\s*"([^"]+)"/);

  return {
    project_name: projectNameMatch?.[1] || '',
  };
}
// ============ 后端部署 ============

function getMetadata() {
  const metadataPath = path.join(PROJECT_DIR, 'backend', 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    console.log(chalk.yellow('   Warning: metadata.json not found, using empty metadata'));
    return {};
  }
  return fs.readJsonSync(metadataPath);
}

function buildWorker() {
  console.log(chalk.blue('Building worker...'));
  try {
    execSync('npm run build:worker', {
      cwd: PROJECT_DIR,
      stdio: 'inherit',
    });
    console.log(chalk.green('Worker built'));
  } catch (error: any) {
    throw createCommandError('worker build', 'npm run build:worker', error, [
      'Fix the build error shown above, then rerun `pinme save`.',
    ]);
  }
}

// ============ 安装依赖 ============

function installDependencies() {
  console.log(chalk.blue('Installing dependencies...'));

  // 安装根目录依赖

  // The project template uses npm workspaces. Installing from the root
  // keeps frontend/backend versions in sync and avoids redundant installs.
  try {
    installProjectDependencies(PROJECT_DIR);
    console.log(chalk.green('Project dependencies installed'));
  } catch (error: any) {
    const errorMsg = error.message || '';
    
    // Check for common permission errors
    if (errorMsg.includes('EACCES') || errorMsg.includes('EPERM') || errorMsg.includes('permission denied')) {
      throw createCommandError('project dependency install', 'npm install', error, [
        'Permission error detected. Here are some solutions:',
        '',
        'Option 1: Fix npm permissions (Recommended)',
        '  mkdir -p ~/.npm-global',
        '  npm config set prefix ~/.npm-global',
        '  Then add ~/.npm-global/bin to your PATH in ~/.bashrc or ~/.zshrc',
        '',
        'Option 2: Use npx to avoid global installs',
        '  npx npm install',
        '',
        'Option 3: Check if you have write permissions',
        '  ls -la ' + PROJECT_DIR,
        '',
        'For more help: https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally',
      ]);
    }
    
    // Check for network errors
    if (errorMsg.includes('ENOTFOUND') || errorMsg.includes('ETIMEDOUT') || errorMsg.includes('network')) {
      throw createCommandError('project dependency install', 'npm install', error, [
        'Network error detected. Please check:',
        '  1. Internet connection is available',
        '  2. npm registry is accessible (https://registry.npmjs.org)',
        '  3. Try using a mirror: npm config set registry https://registry.npmmirror.com',
      ]);
    }
    
    // Generic error
    throw createCommandError('project dependency install', 'npm install', error, [
      'Dependency installation failed.',
      'Check network connectivity and npm registry availability.',
      'If `package-lock.json` is stale or conflicted, resolve that before retrying.',
      '',
      'If this is a permission issue, try:',
      '  sudo chown -R $(whoami) ~/.npm',
      '  sudo chown -R $(whoami) ' + PROJECT_DIR + '/node_modules',
    ]);
  }
}

function getBuiltWorker(): { workerJsPath: string; modulePaths: string[] } {
  const distWorkerDir = path.join(PROJECT_DIR, 'dist-worker');

  if (!fs.existsSync(distWorkerDir)) {
    throw createConfigError('Built worker output not found: `dist-worker/`.', [
      'Make sure `npm run build:worker` completed successfully.',
    ]);
  }

  const workerJsPath = path.join(distWorkerDir, 'worker.js');
  if (!fs.existsSync(workerJsPath)) {
    throw createConfigError('Built worker entry file not found: `dist-worker/worker.js`.', [
      'Check the worker build output and bundler config.',
    ]);
  }

  const modulePaths: string[] = [];
  const files = fs.readdirSync(distWorkerDir);

  for (const file of files) {
    if (file.endsWith('.js') && file !== 'worker.js') {
      modulePaths.push(path.join(distWorkerDir, file));
    }
  }

  return { workerJsPath, modulePaths };
}

function getSqlFiles(): string[] {
  const sqlDir = path.join(PROJECT_DIR, 'db');
  if (!fs.existsSync(sqlDir)) {
    return [];
  }

  const files = fs.readdirSync(sqlDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  return files.map(f => path.join(sqlDir, f));
}

async function saveWorker(workerJsPath: string, modulePaths: string[], sqlFiles: string[], metadata: any, projectName: string) {
  console.log(chalk.blue('Saving worker to platform...'));
  console.log(chalk.gray(`Project: ${projectName}`));
  console.log(chalk.gray(`workerJsPath: ${workerJsPath}`));
  console.log(chalk.gray(`modulePaths: ${modulePaths}`));
  console.log(chalk.gray(`sqlFiles: ${sqlFiles}`));
  console.log(chalk.gray(`metadata: ${metadata}`));
  const apiUrl = `${getPinmeApiUrl('/save_worker')}?project_name=${encodeURIComponent(projectName)}`;
  const headers = getAuthHeaders();
  console.log(chalk.gray(`API URL: ${apiUrl}`));
  try {
    const FormData = (await import('formdata-node')).FormData;
    const Blob = (await import('formdata-node')).Blob;
    const formData = new FormData() as any;

    formData.append('metadata', new Blob([JSON.stringify(metadata)], {
      type: 'application/json',
    }), 'metadata.json');

    // worker.js
    const workerCode = fs.readFileSync(workerJsPath, 'utf-8');
    formData.append('worker.js', new Blob([workerCode], {
      type: 'application/javascript+module',
    }), 'worker.js');

    // Other modules
    for (const modulePath of modulePaths) {
      const filename = path.basename(modulePath);
      const content = fs.readFileSync(modulePath, 'utf-8');
      formData.append(filename, new Blob([content], {
        type: 'application/javascript+module',
      }), filename);
    }

    for (const sqlFile of sqlFiles) {
      const filename = path.basename(sqlFile);
      const content = fs.readFileSync(sqlFile, 'utf-8');
      formData.append('sql_file', new Blob([content], {
        type: 'application/sql',
      }), filename);
      console.log(chalk.gray(`   Including SQL: ${filename}`));
    }
    const response = await axios.put(apiUrl, formData, {
      headers: { ...headers },
      timeout: 120000,
    });
    console.log(chalk.gray(`   Response: ${JSON.stringify(response.data)}`));
    if (response.data) {
      console.log(chalk.green('Worker saved'));
      if (response.data?.data?.sql_results) {
        for (const result of response.data.data.sql_results) {
          console.log(chalk.gray(`   SQL ${result.filename}: ${result.status}`));
        }
      }
    } else {
      throw createApiError('worker save', { response: { data: response.data } }, [
        `Project: ${projectName}`,
        `Endpoint: ${apiUrl}`,
      ], [
        'Verify the project exists and your account has permission to update it.',
      ]);
    }
  } catch (error: any) {
    throw createApiError('worker save', error, [
      `Project: ${projectName}`,
      `Endpoint: ${apiUrl}`,
    ], [
      'Check whether backend metadata, SQL files, or worker bundle contains invalid content.',
    ]);
  }
}

// ============ 前端部署 ============

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
      'Fix the frontend build error shown above, then rerun `pinme save`.',
    ]);
  }
}

function updateFrontendUrlInConfig(configPath: string, frontendUrl: string): void {
  let config = fs.readFileSync(configPath, 'utf-8');

  if (config.includes('frontend_url')) {
    config = config.replace(
      /frontend_url\s*=\s*"[^"]*"/,
      `frontend_url = "${frontendUrl}"`,
    );
  } else {
    config = config.replace(
      /(project_name\s*=\s*"[^"]*"\n)/,
      `$1frontend_url = "${frontendUrl}"\n`,
    );
  }

  fs.writeFileSync(configPath, config);
}

async function deployFrontend(projectName: string): Promise<void> {
  console.log(chalk.blue('Deploying frontend to IPFS...'));
  try {
    const uploadResult = await uploadPath(path.join(PROJECT_DIR, 'frontend', 'dist'), {
      projectName,
    });
    console.log(chalk.green(`Frontend deployed to IPFS: ${uploadResult.publicUrl}`));
    updateFrontendUrlInConfig(path.join(PROJECT_DIR, 'pinme.toml'), uploadResult.publicUrl);
    console.log(chalk.green('Updated pinme.toml with frontend URL'));
  } catch (error: any) {
    throw createCommandError('frontend deploy', 'upload frontend/dist', error, [
      'Make sure `frontend/dist` exists and the upload API is reachable.',
    ]);
  }
}

// ============ 主函数 ============

/**
 * Save and deploy: build + upload worker + deploy frontend to IPFS
 */
export default async function saveCmd(options: SaveOptions): Promise<void> {
  try {
    // Check if user is logged in
    const headers = getAuthHeaders();
    if (!headers['authentication-tokens'] || !headers['token-address']) {
      throw createConfigError('No valid local login session was found.', [
        'Run `pinme login` and retry.',
      ]);
    }

    // Copy token to project directory for sub-commands
    const projectDir = options.projectName || options.name ? path.join(PROJECT_DIR, options.projectName || options.name!) : PROJECT_DIR;
    const tokenFileSrc = path.join(PROJECT_DIR, '.token.json');
    const tokenFileDst = path.join(projectDir, '.token.json');
    if (fs.existsSync(tokenFileSrc) && !fs.existsSync(tokenFileDst)) {
      fs.copySync(tokenFileSrc, tokenFileDst);
    }

    console.log(chalk.blue('Deploying to platform...\n'));

    console.log(chalk.gray(`Project dir: ${PROJECT_DIR}`));

    const config = loadConfig();
    const projectName = config.project_name;

    if (!projectName) {
      throw createConfigError('`project_name` is missing in `pinme.toml`.', [
        'Set `project_name = "your-project-name"` in `pinme.toml`.',
      ]);
    }

    console.log(chalk.gray(`Project: ${projectName}`));

    const apiUrl = `${getPinmeApiUrl('/save_worker')}?project_name=${encodeURIComponent(projectName)}`;
    console.log(chalk.gray(`API URL: ${apiUrl}`));

    // Backend: build + save
    console.log(chalk.blue('\n--- Backend ---'));
    installDependencies();
    buildWorker();

    const metadata = getMetadata();
    const { workerJsPath, modulePaths } = getBuiltWorker();
    console.log(chalk.gray(`Worker JS: ${workerJsPath}`));
    console.log(chalk.gray(`Module paths: ${JSON.stringify(modulePaths)}`));
    const sqlFiles = getSqlFiles();
    console.log(chalk.gray(`SQL files: ${JSON.stringify(sqlFiles)}`));
    await saveWorker(workerJsPath, modulePaths, sqlFiles, metadata, projectName);

    // Frontend: build + deploy
    console.log(chalk.blue('\n--- Frontend ---'));
    buildFrontend();
    await deployFrontend(projectName);

    console.log(chalk.green('\nDeployment complete.'));
    process.exit(0);
  } catch (error: any) {
    printCliError(error, 'Save failed.');
    process.exit(1);
  }
}
