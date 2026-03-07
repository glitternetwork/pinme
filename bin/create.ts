import chalk from 'chalk';
import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import inquirer from 'inquirer';
import { getAuthHeaders } from './utils/webLogin';

// Template directory - relative to bin folder (works both in dev and npm)
const TEMPLATE_DIR = path.join(__dirname, '../template');
const PROJECT_DIR = process.cwd();
const API_BASE = process.env.PINME_API_BASE || 'http://ipfs-proxy.opena.chat/api/v4';

interface CreateOptions {
  name?: string;
  force?: boolean;
}

/**
 * Create a new project from template
 * 1. Get worker URL from API
 * 2. Copy template files
 * 3. Update pinme.toml with worker URL
 */
export default async function createCmd(options: CreateOptions): Promise<void> {
  try {
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

    // TODO: Get worker URL from API
    console.log(chalk.blue('\n1. Getting worker URL from API...'));
    const apiUrl = `${API_BASE}/create_worker`;
    console.log(chalk.gray(`API URL: ${apiUrl}`));

    const headers = getAuthHeaders();

    let workerUrl = '';
    // TODO: Uncomment when API is ready
    // const response = await fetch(apiUrl, {
    //   method: 'POST',
    //   headers: {
    //     ...headers,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({ project_name: projectName }),
    // });
    // if (!response.ok) {
    //   throw new Error(`Failed to create worker: ${response.status}`);
    // }
    // const data = await response.json();
    // workerUrl = data.worker_url;

    workerUrl = 'https://your-worker-{hash}.pinme.pro';
    console.log(chalk.yellow('⚠️  Using placeholder worker URL (API not implemented)'));

    // 2. Copy template files
    console.log(chalk.blue('\n2. Copying template files...'));
    fs.copySync(TEMPLATE_DIR, targetDir);
    console.log(chalk.green(`   Template copied to: ${targetDir}`));

    // 3. Update pinme.toml with worker URL
    console.log(chalk.blue('\n3. Updating configuration...'));
    const configPath = path.join(targetDir, 'pinme.toml');
    const config = fs.readFileSync(configPath, 'utf-8');
    const updatedConfig = config.replace(
      /VITE_WORKER_URL = ".*"/,
      `VITE_WORKER_URL = "${workerUrl}"`
    );
    fs.writeFileSync(configPath, updatedConfig);
    console.log(chalk.green(`   Updated VITE_WORKER_URL in pinme.toml`));

    // 4. Create .env file from .env.example
    const envExamplePath = path.join(targetDir, '.env.example');
    const envPath = path.join(targetDir, '.env');
    if (fs.existsSync(envExamplePath)) {
      let envContent = fs.readFileSync(envExamplePath, 'utf-8');
      // Replace your-project with actual project name
      envContent = envContent.replace(/your-project/g, projectName);
      fs.writeFileSync(envPath, envContent);
      console.log(chalk.green(`   Created .env file`));
    }

    console.log(chalk.green('\n✅ Project created successfully!'));
    console.log(chalk.gray(`\nNext steps:`));
    console.log(chalk.gray(`   cd ${projectName}`));
    console.log(chalk.gray(`   pinme save  # Deploy the project`));

    process.exit(0);
  } catch (error: any) {
    console.error(chalk.red(`\nError: ${error.message || error}`));
    process.exit(1);
  }
}
