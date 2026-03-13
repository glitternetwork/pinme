import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import { execSync } from 'child_process';
import { getAuthHeaders } from './utils/webLogin';

const PROJECT_DIR = process.cwd();
const API_BASE = process.env.PINME_API_BASE || 'https://pinme.benny1996.win/api/v4';

interface SaveOptions {
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
    throw new Error(`Worker build failed: ${error.message}`);
  }
}

// ============ 安装依赖 ============

function installDependencies() {
  console.log(chalk.blue('Installing dependencies...'));
  
  // 安装根目录依赖
  try {
    execSync('npm install', {
      cwd: PROJECT_DIR,
      stdio: 'inherit',
    });
    console.log(chalk.green('Root dependencies installed'));
  } catch (error: any) {
    throw new Error(`Root dependencies install failed: ${error.message}`);
  }
  
  // 安装后端依赖
  const backendDir = path.join(PROJECT_DIR, 'backend');
  if (fs.existsSync(path.join(backendDir, 'package.json'))) {
    try {
      execSync('npm install', {
        cwd: backendDir,
        stdio: 'inherit',
      });
      console.log(chalk.green('Backend dependencies installed'));
    } catch (error: any) {
      throw new Error(`Backend dependencies install failed: ${error.message}`);
    }
  }
  
  // 安装前端依赖
  const frontendDir = path.join(PROJECT_DIR, 'frontend');
  if (fs.existsSync(path.join(frontendDir, 'package.json'))) {
    try {
      execSync('npm install', {
        cwd: frontendDir,
        stdio: 'inherit',
      });
      console.log(chalk.green('Frontend dependencies installed'));
    } catch (error: any) {
      throw new Error(`Frontend dependencies install failed: ${error.message}`);
    }
  }
}

function getBuiltWorker(): { workerJsPath: string; modulePaths: string[] } {
  const distWorkerDir = path.join(PROJECT_DIR, 'dist-worker');

  if (!fs.existsSync(distWorkerDir)) {
    throw new Error('Dist worker not found. Run "npm run build:worker" first.');
  }

  const workerJsPath = path.join(distWorkerDir, 'worker.js');
  if (!fs.existsSync(workerJsPath)) {
    throw new Error('worker.js not found in dist-worker');
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
  const apiUrl = `${API_BASE}/save_worker?project_name=${encodeURIComponent(projectName)}`;
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
      throw new Error(response.data?.errors?.[0]?.message || 'Failed to save worker');
    }
  } catch (error: any) {
    console.log(chalk.red(`   Response status: ${error.response?.status}`));
    console.log(chalk.red(`   Response data: ${JSON.stringify(error.response?.data)}`));
    const errorMsg = error.response?.data?.errors?.[0]?.message
      || error.response?.data?.error
      || error.message
      || 'Failed to save worker';
    throw new Error(errorMsg);
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
 * Save and deploy: build + upload worker + deploy frontend to IPFS
 */
export default async function saveCmd(options: SaveOptions): Promise<void> {
  try {
    // Check if user is logged in
    const headers = getAuthHeaders();
    if (!headers['authentication-tokens'] || !headers['token-address']) {
      console.log(chalk.yellow('\n⚠️  You are not logged in.'));
      console.log(chalk.gray('Please run: pinme login'));
      process.exit(1);
    }

    // Copy token to project directory for sub-commands
    const projectDir = options.projectName || options.name ? path.join(PROJECT_DIR, options.projectName || options.name!) : PROJECT_DIR;
    const tokenFileSrc = path.join(PROJECT_DIR, '.token.json');
    const tokenFileDst = path.join(projectDir, '.token.json');
    if (fs.existsSync(tokenFileSrc) && !fs.existsSync(tokenFileDst)) {
      fs.copySync(tokenFileSrc, tokenFileDst);
    }

    console.log(chalk.blue('🚀 Deploying to platform...\n'));

    console.log(chalk.gray(`Project dir: ${PROJECT_DIR}`));

    const config = loadConfig();
    const projectName = config.project_name;

    if (!projectName) {
      throw new Error('project_name not found in pinme.toml');
    }

    console.log(chalk.gray(`Project: ${projectName}`));

    const apiUrl = `${API_BASE}/save_worker?project_name=${encodeURIComponent(projectName)}`;
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
    deployFrontend();

    console.log(chalk.green('\n✅ Deployment complete!'));
    process.exit(0);
  } catch (error: any) {
    console.error(chalk.red(`\n❌ Error: ${error.message}`));
    process.exit(1);
  }
}
