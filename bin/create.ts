import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import inquirer from 'inquirer';
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
import { APP_CONFIG, getPinmeApiUrl } from './utils/config';
import { uploadPath } from './services/uploadService';
import { printHighlightedUrl } from './utils/urlDisplay';

// Template directory - relative to bin folder (works both in dev and npm)
const PROJECT_DIR = process.cwd();
const TEMPLATE_BRANCH = process.env.PINME_TEMPLATE_BRANCH || 'main';

// 模板仓库地址 (使用 HTTPS 下载 zip)
const TEMPLATE_REPO = 'glitternetwork/pinme-worker-template';
const TEMPLATE_REPO_NAME = TEMPLATE_REPO.split('/').pop() || 'pinme-worker-template';

function getTemplateZipUrl(branch: string): string {
  return `https://github.com/${TEMPLATE_REPO}/archive/refs/heads/${encodeURIComponent(branch)}.zip`;
}

interface CreateOptions {
  name?: string;
  force?: boolean;
}

interface CreateWorkerResponse {
  api_domain: string;
  metadata: string;
  project_name: string;
  uuid: string;
  api_key?: string;
  public_client_config?: Record<string, any>;
}

function buildPublicClientConfigExport(publicClientConfig: Record<string, any>): string {
  return `export const public_client_config = ${JSON.stringify(publicClientConfig, null, 2)};\n`;
}

function injectPublicClientConfigIntoFile(fileContent: string, publicClientConfig: Record<string, any>): string {
  const configExport = buildPublicClientConfigExport(publicClientConfig).trimEnd();
  const configPattern = /export\s+const\s+public_client_config\s*=\s*\{[\s\S]*?\};?/m;

  if (configPattern.test(fileContent)) {
    return fileContent.replace(configPattern, configExport);
  }

  const trimmed = fileContent.trimEnd();
  if (!trimmed) {
    return `${configExport}\n`;
  }

  return `${trimmed}\n\n${configExport}\n`;
}

function resolveExtractedTemplateDir(extractDir: string): string {
  const entries = fs.readdirSync(extractDir, { withFileTypes: true });
  const templateDir = entries.find((entry) => (
    entry.isDirectory() && entry.name.startsWith(`${TEMPLATE_REPO_NAME}-`)
  ));

  if (!templateDir) {
    throw createConfigError('Downloaded template archive structure is invalid.', [
      `Expected a directory starting with \`${TEMPLATE_REPO_NAME}-\` inside the extracted archive.`,
      `Template branch: ${TEMPLATE_BRANCH}`,
    ]);
  }

  return path.join(extractDir, templateDir.name);
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

function getProjectManagementUrl(projectName: string): string {
  return `${APP_CONFIG.projectPeviewUrl}${projectName}`;
}

/**
 * Create a new project from template
 * 1. Check login
 * 2. Call API to create worker/D1 database
 * 3. Copy template files
 * 4. Update configuration files
 */
export default async function createCmd(options: CreateOptions): Promise<void> {
  try {
    // Check if user is logged in
    const headers = getAuthHeaders();
    if (!headers['authentication-tokens'] || !headers['token-address']) {
      throw createConfigError('No valid local login session was found.', [
        'Run `pinme login` and retry.',
      ]);
    }

    console.log(chalk.blue('Creating new project from template...\n'));

    // Get project name from options or prompt
    let projectName = options.name;
    if (!projectName) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'projectName',
          message: 'Enter project name:',
          validate: (input: string) => {
            if (!input.trim()) return 'Project name is required';
            if (!/^[a-zA-Z0-9-_]+$/.test(input)) {
              return 'Project name can only contain letters, numbers, hyphens and underscores';
            }
            return true;
          },
        },
      ]);
      projectName = answers.projectName;
    }

    const targetDir = path.join(PROJECT_DIR, projectName);

    // Check if directory exists
    if (fs.existsSync(targetDir) && !options.force) {
      console.log(chalk.yellow(`\nDirectory "${projectName}" already exists.`));
      const answers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: 'Do you want to overwrite it?',
          default: false,
        },
      ]);
      if (!answers.overwrite) {
        console.log(chalk.gray('Cancelled.'));
        process.exit(0);
      }
      fs.removeSync(targetDir);
    }

    // 1. Call API to create worker/D1
    console.log(chalk.blue('\n1. Creating worker and database...'));
    const apiUrl = getPinmeApiUrl('/create_worker');
    console.log(chalk.gray(`API URL: ${apiUrl}`));

    // Convert project name to lowercase (API requires lowercase)
    const normalizedProjectName = projectName.toLowerCase();
    console.log(chalk.gray(`Project name: ${normalizedProjectName}`));

    let workerData: CreateWorkerResponse;
    try {
      const response = await axios.post(apiUrl, {
        project_name: normalizedProjectName,
      }, {
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
      });

      const data = response.data;

      if (data.code !== 200) {
        throw createApiError('project creation', { response: { status: response.status, data } }, [
          `Project name: ${normalizedProjectName}`,
          `Endpoint: ${apiUrl}`,
        ]);
      }

      workerData = data.data;
      console.log(chalk.gray(`   API Response: ${JSON.stringify(workerData)}`));
      console.log(chalk.green(`   API Domain: ${workerData.api_domain}`));
      console.log(chalk.green(`   Project Name: ${workerData.project_name}`));
    } catch (error: any) {
      throw createApiError('project creation', error, [
        `Project name: ${normalizedProjectName}`,
        `Endpoint: ${apiUrl}`,
      ]);
    }

    // 2. Download template from repository (using HTTPS, no git required)
    console.log(chalk.blue('\n2. Downloading template from repository...'));
    const zipPath = path.join(PROJECT_DIR, 'template.zip');
    const extractDir = path.join(PROJECT_DIR, `.pinme-template-${Date.now()}`);
    const templateZipUrl = getTemplateZipUrl(TEMPLATE_BRANCH);
    let downloadSuccess = false;
    console.log(chalk.gray(`   Template branch: ${TEMPLATE_BRANCH}`));
    
    // Retry download up to 3 times
    for (let attempt = 1; attempt <= 3 && !downloadSuccess; attempt++) {
      try {
        console.log(chalk.gray(`   Download attempt ${attempt}/3...`));
        
        // Download zip file
        execSync(`curl -L --retry 3 --retry-delay 2 -o "${zipPath}" "${templateZipUrl}"`, {
          stdio: 'inherit',
        });
        
        // Check if file was downloaded successfully
        if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size < 100) {
          throw new Error('Downloaded file is too small or empty');
        }
        
        downloadSuccess = true;
      } catch (downloadError: any) {
        console.log(chalk.yellow(`   Attempt ${attempt} failed: ${downloadError.message}`));
        if (fs.existsSync(zipPath)) {
          fs.removeSync(zipPath);
        }
        if (attempt === 3) {
          throw new Error(`Failed to download template after 3 attempts: ${downloadError.message}`);
        }
      }
    }
    
    try {
      fs.ensureDirSync(extractDir);

      // Unzip to target directory
      execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, {
        stdio: 'inherit',
      });
      
      // Move files from extracted subdirectory to target directory
      const subDir = resolveExtractedTemplateDir(extractDir);
      fs.copySync(subDir, targetDir);
      
      // Clean up zip file
      fs.removeSync(zipPath);
      fs.removeSync(extractDir);
      
      // Remove any existing node_modules and package-lock.json to ensure clean install
      // This fixes issues with rollup platform-specific dependencies
      const nodeModulesPath = path.join(targetDir, 'node_modules');
      const packageLockPath = path.join(targetDir, 'package-lock.json');
      if (fs.existsSync(nodeModulesPath)) {
        console.log(chalk.gray('   Removing existing node_modules...'));
        fs.removeSync(nodeModulesPath);
      }
      if (fs.existsSync(packageLockPath)) {
        console.log(chalk.gray('   Removing existing package-lock.json...'));
        fs.removeSync(packageLockPath);
      }
      // Also clean frontend and backend subdirectories
      const frontendNodeModules = path.join(targetDir, 'frontend', 'node_modules');
      const backendNodeModules = path.join(targetDir, 'backend', 'node_modules');
      const frontendPackageLock = path.join(targetDir, 'frontend', 'package-lock.json');
      const backendPackageLock = path.join(targetDir, 'backend', 'package-lock.json');
      if (fs.existsSync(frontendNodeModules)) fs.removeSync(frontendNodeModules);
      if (fs.existsSync(backendNodeModules)) fs.removeSync(backendNodeModules);
      if (fs.existsSync(frontendPackageLock)) fs.removeSync(frontendPackageLock);
      if (fs.existsSync(backendPackageLock)) fs.removeSync(backendPackageLock);
      
      console.log(chalk.green(`   Template downloaded to: ${targetDir}`));
    } catch (error: any) {
      throw createCommandError('template extraction', `unzip -o "${zipPath}" -d "${PROJECT_DIR}"`, error, [
        'Check whether `unzip` is available and the downloaded template archive is valid.',
      ]);
    }

    // 3. Update pinme.toml with project_name
    console.log(chalk.blue('\n3. Updating configuration...'));
    const configPath = path.join(targetDir, 'pinme.toml');
    const config = fs.readFileSync(configPath, 'utf-8');

    // Update project_name
    let updatedConfig = config.replace(
      /project_name = ".*"/,
      `project_name = "${workerData.project_name}"`
    );

    fs.writeFileSync(configPath, updatedConfig);
    console.log(chalk.green(`   Updated pinme.toml`));
    console.log(chalk.gray(`   metadata: ${workerData.metadata}`));
    // 4. Save metadata to backend directory
    const backendDir = path.join(targetDir, 'backend');
    if (fs.existsSync(backendDir) && workerData.metadata) {
      // Save metadata (user needs this for D1 bindings info)
      const metadataContent = typeof workerData.metadata === 'string'
        ? workerData.metadata
        : JSON.stringify(workerData.metadata, null, 2);
      fs.writeFileSync(
        path.join(backendDir, 'metadata.json'),
        metadataContent
      );
      console.log(chalk.green(`   Saved metadata.json`));
    }

    // 4.1 Update API_KEY in backend/wrangler.toml
    const wranglerPath = path.join(backendDir, 'wrangler.toml');
    if (fs.existsSync(wranglerPath) && workerData.api_key) {
      let wranglerContent = fs.readFileSync(wranglerPath, 'utf-8');
      wranglerContent = wranglerContent.replace(
        /^name = ".*"$/m,
        `name = "${workerData.project_name}"`
      );
      fs.writeFileSync(wranglerPath, wranglerContent);
      console.log(chalk.green(`   Updated backend/wrangler.toml API_KEY`));
    }

    const frontendConfigPath = path.join(targetDir, 'frontend', 'src', 'utils', 'config.ts');
    if (workerData.public_client_config) {
      const frontendConfigContent = fs.existsSync(frontendConfigPath)
        ? fs.readFileSync(frontendConfigPath, 'utf-8')
        : '';
      fs.ensureDirSync(path.dirname(frontendConfigPath));
      fs.writeFileSync(
        frontendConfigPath,
        injectPublicClientConfigIntoFile(frontendConfigContent, workerData.public_client_config)
      );
      console.log(chalk.green(`   Updated frontend/src/utils/config.ts public_client_config`));
    }


    // 5. Create .env file from .env.example (in frontend directory)
    const envExamplePath = path.join(targetDir, 'frontend', '.env.example');
    const envPath = path.join(targetDir, 'frontend', '.env');
    if (fs.existsSync(envExamplePath)) {
      let envContent = fs.readFileSync(envExamplePath, 'utf-8');
      // Replace your-project with actual project name
      envContent = envContent.replace(/your-project/g, workerData.project_name);
      // Update API_URL - match entire line
      envContent = envContent.replace(
        /^VITE_API_URL=.*$/m,
        `VITE_API_URL=${workerData.api_domain}`
      );
      fs.writeFileSync(envPath, envContent);
      console.log(chalk.green(`   Created frontend/.env file`));
      console.log(chalk.gray(`   VITE_API_URL: ${workerData.api_domain}`));
    }
    
    // Update pinme.toml with api_url (append after project_name)
    let pinmeConfig = fs.readFileSync(configPath, 'utf-8');
    if (pinmeConfig.includes('api_url')) {
      pinmeConfig = pinmeConfig.replace(
        /api_url\s*=\s*"[^"]*"/,
        `api_url = "${workerData.api_domain}"`
      );
    } else {
      // Append api_url line after project_name
      const lines = pinmeConfig.split('\n');
      const newLines: string[] = [];
      for (const line of lines) {
        newLines.push(line);
        if (line.trim().startsWith('project_name')) {
          newLines.push(`api_url = "${workerData.api_domain}"`);
        }
      }
      pinmeConfig = newLines.join('\n');
    }
    fs.writeFileSync(configPath, pinmeConfig);
    console.log(chalk.green(`   Updated pinme.toml with api_url`));

    // 6. Install dependencies
    console.log(chalk.blue('\n4. Installing dependencies...'));

    // Install workspace dependencies from the project root.
    // The template uses npm workspaces, so a single root install is enough.
    try {
      installProjectDependencies(targetDir);
      console.log(chalk.green('   Project dependencies installed'));
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
          '  ls -la ' + targetDir,
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
        'Inspect the generated workspace `package.json` files for dependency conflicts.',
        '',
        'If this is a permission issue, try:',
        '  sudo chown -R $(whoami) ~/.npm',
        '  sudo chown -R $(whoami) ' + targetDir + '/node_modules',
      ]);
    }

    // 7. Build and deploy backend worker
    console.log(chalk.blue('\n5. Building backend worker...'));
    try {
      execSync('npm run build:worker', {
        cwd: targetDir,
        stdio: 'inherit',
      });
      console.log(chalk.green('   Worker built'));
    } catch (error: any) {
      throw createCommandError('worker build', 'npm run build:worker', error, [
        'Fix the build error shown above, then rerun `pinme create`.',
      ]);
    }

    // 8. Get built worker files and SQL files
    const distWorkerDir = path.join(targetDir, 'dist-worker');
    const workerJsPath = path.join(distWorkerDir, 'worker.js');
    
    if (!fs.existsSync(distWorkerDir) || !fs.existsSync(workerJsPath)) {
      throw createConfigError('Built worker output not found: `dist-worker/worker.js`.', [
        'Make sure `npm run build:worker` completed successfully.',
      ]);
    }

    // Get module files
    const modulePaths: string[] = [];
    const files = fs.readdirSync(distWorkerDir);
    for (const file of files) {
      if (file.endsWith('.js') && file !== 'worker.js') {
        modulePaths.push(path.join(distWorkerDir, file));
      }
    }

    // Get SQL files
    const sqlDir = path.join(targetDir, 'db');
    const sqlFiles: string[] = [];
    if (fs.existsSync(sqlDir)) {
      const sqlFileNames = fs.readdirSync(sqlDir)
        .filter(f => f.endsWith('.sql'))
        .sort();
      for (const filename of sqlFileNames) {
        sqlFiles.push(path.join(sqlDir, filename));
        console.log(chalk.gray(`   Including SQL: ${filename}`));
      }
    }

    // 9. Save worker to platform
    console.log(chalk.blue('\n6. Deploying backend worker...'));
    const saveApiUrl = `${getPinmeApiUrl('/save_worker')}?project_name=${encodeURIComponent(workerData.project_name)}`;
    console.log(chalk.gray(`   API URL: ${saveApiUrl}`));
    
    try {
      const FormData = (await import('formdata-node')).FormData;
      const Blob = (await import('formdata-node')).Blob;
      const formData = new FormData() as any;

      // Add metadata
      const metadataContent = typeof workerData.metadata === 'string'
        ? workerData.metadata
        : JSON.stringify(workerData.metadata, null, 2);
      formData.append('metadata', new Blob([metadataContent], {
        type: 'application/json',
      }), 'metadata.json');

      // Add worker.js
      const workerCode = fs.readFileSync(workerJsPath, 'utf-8');
      formData.append('worker.js', new Blob([workerCode], {
        type: 'application/javascript+module',
      }), 'worker.js');

      // Add other modules
      for (const modulePath of modulePaths) {
        const filename = path.basename(modulePath);
        const content = fs.readFileSync(modulePath, 'utf-8');
        formData.append(filename, new Blob([content], {
          type: 'application/javascript+module',
        }), filename);
      }

      // Add SQL files
      for (const sqlFile of sqlFiles) {
        const filename = path.basename(sqlFile);
        const content = fs.readFileSync(sqlFile, 'utf-8');
        formData.append('sql_file', new Blob([content], {
          type: 'application/sql',
        }), filename);
      }

      const response = await axios.put(saveApiUrl, formData, {
        headers: { ...headers },
        timeout: 120000,
      });

      if (response.data) {
        console.log(chalk.green('   Worker deployed'));
        if (response.data?.data?.sql_results) {
          for (const result of response.data.data.sql_results) {
            console.log(chalk.gray(`   SQL ${result.filename}: ${result.status}`));
          }
        }
      } else {
        throw createApiError('worker save', { response: { data: response.data } }, [
          `Project: ${workerData.project_name}`,
          `Endpoint: ${saveApiUrl}`,
        ], [
          'Verify the project exists and your account has permission to update it.',
        ]);
      }
    } catch (error: any) {
      throw createApiError('worker save', error, [
        `Project: ${workerData.project_name}`,
        `Endpoint: ${saveApiUrl}`,
      ], [
        'Check whether backend metadata, SQL files, or worker bundle contains invalid content.',
      ]);
    }

    // 10. Build and deploy frontend
    console.log(chalk.blue('\n7. Building frontend...'));
    const frontendDir = path.join(targetDir, 'frontend');
    if (fs.existsSync(frontendDir)) {
      // Build frontend
      try {
        execSync('npm run build:frontend', {
          cwd: targetDir,
          stdio: 'inherit',
        });
        console.log(chalk.green('   Frontend built'));
      } catch (error: any) {
        throw createCommandError('frontend build', 'npm run build:frontend', error, [
          'Fix the frontend build error shown above, then rerun `pinme create`.',
        ]);
      }

      // Upload to IPFS and capture the URL
      console.log(chalk.blue('   Uploading to IPFS...'));
      try {
        const uploadResult = await uploadPath(path.join(frontendDir, 'dist'), {
          projectName: workerData.project_name,
          uid: headers['token-address'],
        });
        printHighlightedUrl('Frontend URL', uploadResult.publicUrl, 'primary');
        updateFrontendUrlInConfig(
          path.join(targetDir, 'pinme.toml'),
          uploadResult.publicUrl,
        );
        console.log(chalk.green('   Updated pinme.toml with frontend URL'));
      } catch (error: any) {
        console.log(chalk.yellow('   Warning: IPFS upload failed, you can upload manually later'));
      }
    }

    console.log(chalk.green('\nProject created successfully.'));
    console.log(chalk.gray(`\nProject Details:`));
    console.log(chalk.gray(`   API Domain: ${workerData.api_domain}`));
    console.log(chalk.gray(`   Project Name: ${workerData.project_name}`));
    printHighlightedUrl(
      'Project Management URL',
      getProjectManagementUrl(workerData.project_name),
      'management',
    );
    console.log(chalk.gray(`\nNext steps:`));
    console.log(chalk.gray(`   cd ${projectName}`));
    console.log(chalk.gray(`   pinme save`));

    process.exit(0);
  } catch (error: any) {
    printCliError(error, 'Project creation failed.');
    process.exit(1);
  }
}
