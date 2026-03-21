import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import { execSync } from 'child_process';
import { getAuthHeaders } from './utils/webLogin';
import {
  createApiError,
  createCommandError,
  createConfigError,
  printCliError,
} from './utils/cliError';

const PROJECT_DIR = process.cwd();
const API_BASE = process.env.PINME_API_BASE || '';

interface UpdateWorkerOptions {
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

// ============ Worker 构建和部署 ============

function getMetadata() {
  const metadataPath = path.join(PROJECT_DIR, 'backend', 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    throw createConfigError('`backend/metadata.json` not found.', [
      'Create `backend/metadata.json` or restore it from the project template.',
    ]);
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
      'Fix the build error shown above, then rerun `pinme update-worker`.',
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

async function updateWorker(workerJsPath: string, modulePaths: string[], metadata: any, projectName: string) {
  console.log(chalk.blue('Updating worker on platform...'));
  console.log(chalk.gray(`Project: ${projectName}`));
  console.log(chalk.gray(`workerJsPath: ${workerJsPath}`));
  console.log(chalk.gray(`modulePaths: ${modulePaths}`));
  console.log(chalk.gray(`metadata: ${metadata}`));

  const apiUrl = `${API_BASE}/update_worker?project_name=${encodeURIComponent(projectName)}`;
  const headers = getAuthHeaders();
  console.log(chalk.gray(`API URL: ${apiUrl}`));

  try {
    const FormData = (await import('formdata-node')).FormData;
    const Blob = (await import('formdata-node')).Blob;
    const formData = new FormData() as any;

    // metadata
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

    const response = await axios.put(apiUrl, formData, {
      headers: { ...headers },
      timeout: 120000,
    });

    console.log(chalk.gray(`   Response: ${JSON.stringify(response.data)}`));

    if (response.data) {
      console.log(chalk.green('Worker updated'));

      // Display worker deployment info
      const data = response.data.data;
      if (data.worker_id) {
        console.log(chalk.gray(`   Worker ID: ${data.worker_id}`));
      }
      if (data.deployment_id) {
        console.log(chalk.gray(`   Deployment ID: ${data.deployment_id}`));
      }
      if (data.entry_point) {
        console.log(chalk.gray(`   Entry Point: ${data.entry_point}`));
      }
      if (data.created_on) {
        console.log(chalk.gray(`   Created: ${data.created_on}`));
      }
      if (data.modified_on) {
        console.log(chalk.gray(`   Modified: ${data.modified_on}`));
      }
      if (data.startup_time_ms !== undefined) {
        console.log(chalk.gray(`   Startup Time: ${data.startup_time_ms}ms`));
      }
      if (data.has_modules !== undefined) {
        console.log(chalk.gray(`   Has Modules: ${data.has_modules}`));
      }
      if (data.domain) {
        console.log(chalk.gray(`   Domain: ${data.domain}`));
      }
    } else {
      throw createApiError('worker update', { response: { data: response.data } }, [
        `Project: ${projectName}`,
        `Endpoint: ${apiUrl}`,
      ], [
        'Verify the project exists and your account has permission to update it.',
      ]);
    }
  } catch (error: any) {
    throw createApiError('worker update', error, [
      `Project: ${projectName}`,
      `Endpoint: ${apiUrl}`,
    ], [
      'Check whether `backend/metadata.json` and the built worker bundle are valid.',
    ]);
  }
}

// ============ 主函数 ============

/**
 * Update worker: build + upload worker only (no SQL, no frontend)
 * API: PUT /api/v4/update_worker?project_name={name}
 */
export default async function updateWorkerCmd(options?: UpdateWorkerOptions): Promise<void> {
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

    console.log(chalk.blue('Updating worker...\n'));

    console.log(chalk.gray(`Project dir: ${PROJECT_DIR}`));

    const config = loadConfig();
    const projectName = config.project_name;

    if (!projectName) {
      throw createConfigError('`project_name` is missing in `pinme.toml`.', [
        'Set `project_name = "your-project-name"` in `pinme.toml`.',
      ]);
    }

    console.log(chalk.gray(`Project: ${projectName}`));

    // Backend: build + update
    console.log(chalk.blue('\n--- Worker Update ---'));
    buildWorker();

    const metadata = getMetadata();
    const { workerJsPath, modulePaths } = getBuiltWorker();
    console.log(chalk.gray(`Worker JS: ${workerJsPath}`));
    console.log(chalk.gray(`Module paths: ${JSON.stringify(modulePaths)}`));

    // Note: SQL files are ignored for update_worker
    console.log(chalk.gray(`SQL files: ignored (not processed for update_worker)`));

    await updateWorker(workerJsPath, modulePaths, metadata, projectName);

    console.log(chalk.green('\nWorker update complete.'));
    process.exit(0);
  } catch (error: any) {
    printCliError(error, 'Worker update failed.');
    process.exit(1);
  }
}
