import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import inquirer from 'inquirer';
import axios from 'axios';
import { execSync } from 'child_process';
import { getAuthHeaders } from './utils/webLogin';

// Template directory - relative to bin folder (works both in dev and npm)
const PROJECT_DIR = process.cwd();
const API_BASE = process.env.PINME_API_BASE || '';

// 模板仓库地址 (使用 HTTPS 下载 zip)
const TEMPLATE_REPO = 'glitternetwork/pinme-worker-template';
const TEMPLATE_ZIP_URL = `https://github.com/${TEMPLATE_REPO}/archive/refs/heads/main.zip`;

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
      console.log(chalk.yellow('\n⚠️  You are not logged in.'));
      console.log(chalk.gray('Please run: pinme login'));
      process.exit(1);
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
    const apiUrl = `${API_BASE}/create_worker`;
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
        const errorMsg = data?.data?.error || data?.msg || 'Failed to create worker';
        throw new Error(errorMsg);
      }

      workerData = data.data;
      console.log(chalk.gray(`   API Response: ${JSON.stringify(workerData)}`));
      console.log(chalk.green(`   API Domain: ${workerData.api_domain}`));
      console.log(chalk.green(`   Project Name: ${workerData.project_name}`));
      console.log(chalk.green(`   D1 UUID: ${workerData.uuid}`));
    } catch (error: any) {
      const errorMsg = error.response?.data?.data?.error
        || error.response?.data?.msg
        || error.message
        || 'Failed to create worker';
      throw new Error(errorMsg);
    }

    // 2. Download template from repository (using HTTPS, no git required)
    console.log(chalk.blue('\n2. Downloading template from repository...'));
    const zipPath = path.join(PROJECT_DIR, 'template.zip');
    let downloadSuccess = false;
    
    // Retry download up to 3 times
    for (let attempt = 1; attempt <= 3 && !downloadSuccess; attempt++) {
      try {
        console.log(chalk.gray(`   Download attempt ${attempt}/3...`));
        
        // Download zip file
        execSync(`curl -L --retry 3 --retry-delay 2 -o "${zipPath}" "${TEMPLATE_ZIP_URL}"`, {
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
      // Unzip to target directory
      execSync(`unzip -o "${zipPath}" -d "${PROJECT_DIR}"`, {
        stdio: 'inherit',
      });
      
      // Move files from subdirectory to target directory
      const subDir = path.join(PROJECT_DIR, 'pinme-worker-template-main');
      if (fs.existsSync(subDir)) {
        fs.copySync(subDir, targetDir);
        fs.removeSync(subDir);
      }
      
      // Clean up zip file
      fs.removeSync(zipPath);
      
      console.log(chalk.green(`   Template downloaded to: ${targetDir}`));
    } catch (error: any) {
      throw new Error(`Failed to extract template: ${error.message}`);
    }

    // 3. Update pinme.toml with worker URL
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
    console.log(chalk.gray(`   VITE_API_URL: ${workerData.api_domain}`));
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
    }

    // 6. Install dependencies and build frontend
    console.log(chalk.blue('\n4. Building frontend...'));

    // Install root dependencies
    try {
      execSync('npm install', {
        cwd: targetDir,
        stdio: 'inherit',
      });
      console.log(chalk.green('   Root dependencies installed'));
    } catch (error: any) {
      console.log(chalk.yellow('   Warning: Root dependencies install failed, continuing...'));
    }

    // Install frontend dependencies
    const frontendDir = path.join(targetDir, 'frontend');
    if (fs.existsSync(frontendDir)) {
      try {
        execSync('npm install', {
          cwd: frontendDir,
          stdio: 'inherit',
        });
        console.log(chalk.green('   Frontend dependencies installed'));
      } catch (error: any) {
        console.log(chalk.yellow('   Warning: Frontend dependencies install failed, continuing...'));
      }

      // Build frontend
      try {
        execSync('npm run build', {
          cwd: frontendDir,
          stdio: 'inherit',
        });
        console.log(chalk.green('   Frontend built'));
      } catch (error: any) {
        throw new Error(`Frontend build failed: ${error.message}`);
      }

      // Upload to IPFS
      console.log(chalk.blue('   Uploading to IPFS...'));
      try {
        execSync('pinme upload ./dist', {
          cwd: frontendDir,
          stdio: 'inherit',
        });
        console.log(chalk.green('   Frontend uploaded to IPFS'));
      } catch (error: any) {
        console.log(chalk.yellow('   Warning: IPFS upload failed, you can upload manually later'));
      }
    }

    console.log(chalk.green('\n✅ Project created successfully!'));
    console.log(chalk.gray(`\nProject Details:`));
    console.log(chalk.gray(`   API Domain: ${workerData.api_domain}`));
    console.log(chalk.gray(`   Project Name: ${workerData.project_name}`));
    console.log(chalk.gray(`\nNext steps:`));
    console.log(chalk.gray(`   cd ${projectName}`));
    console.log(chalk.gray(`   pinme save  # 首次部署后端 + 前端`));

    process.exit(0);
  } catch (error: any) {
    console.error(chalk.red(`\nError: ${error.message || error}`));
    process.exit(1);
  }
}
