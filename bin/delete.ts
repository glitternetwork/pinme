import chalk from 'chalk';
import inquirer from 'inquirer';
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { getAuthHeaders } from './utils/webLogin';

const API_BASE = process.env.PINME_API_BASE || '';

interface DeleteOptions {
  name?: string;
  force?: boolean;
}

// 从 pinme.toml 获取项目名
function getProjectName(): string | null {
  const configPath = path.join(process.cwd(), 'pinme.toml');
  if (!fs.existsSync(configPath)) {
    return null;
  }
  const config = fs.readFileSync(configPath, 'utf-8');
  const match = config.match(/project_name\s*=\s*"([^"]+)"/);
  return match?.[1] || null;
}

/**
 * Delete a project: removes Worker domain binding, Worker script, D1 database
 */
export default async function deleteCmd(options: DeleteOptions): Promise<void> {
  try {
    // Check if user is logged in
    const headers = getAuthHeaders();
    if (!headers['authentication-tokens'] || !headers['token-address']) {
      console.log(chalk.yellow('\n⚠️  You are not logged in.'));
      console.log(chalk.gray('Please run: pinme login'));
      process.exit(1);
    }

    console.log(chalk.blue('Deleting project...\n'));

    // Get project name from pinme.toml or options
    let projectName = options.name || getProjectName();

    if (!projectName) {
      console.log(chalk.red('\n❌ Error: Cannot find project name.'));
      console.log(chalk.yellow('   Please make sure you are in the project directory.'));
      console.log(chalk.gray('   The project directory should contain a pinme.toml file.'));
      console.log(chalk.gray('\n   Or specify the project name:'));
      console.log(chalk.gray('   cd /path/to/your-project'));
      console.log(chalk.gray('   pinme delete'));
      process.exit(1);
    }

    console.log(chalk.gray(`Project: ${projectName}`));
    console.log(chalk.gray(`Directory: ${process.cwd()}`));

    // Confirm deletion
    if (!options.force) {
      const answers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to delete project "${projectName}"? This will remove Worker, domain binding, and D1 database.`,
          default: false,
        },
      ]);
      if (!answers.confirm) {
        console.log(chalk.gray('Cancelled.'));
        process.exit(0);
      }
    }

    // Call API to delete project
    console.log(chalk.blue('Deleting project on platform...'));
    const apiUrl = `${API_BASE}/delete_project`;
    console.log(chalk.gray(`API URL: ${apiUrl}`));
    console.log(chalk.gray(`Project name: ${projectName}`));

    const response = await axios.post(apiUrl, {
      project_name: projectName,
    }, {
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
    }).catch((error) => {
      console.log(chalk.red(`   Response status: ${error.response?.status}`));
      console.log(chalk.red(`   Response data: ${JSON.stringify(error.response?.data)}`));
      throw error;
    });

    const data = response.data;

    if (data.code === 200) {
      console.log(chalk.green('\n✅ Project deleted successfully!'));
      console.log(chalk.gray(`\nProject: ${data.data.project_name}`));
      console.log(chalk.gray(`   Domain deleted: ${data.data.domain_deleted ? '✅' : '❌'}`));
      console.log(chalk.gray(`   Worker deleted: ${data.data.worker_deleted ? '✅' : '❌'}`));
      console.log(chalk.gray(`   Database deleted: ${data.data.database_deleted ? '✅' : '❌'}`));

      console.log(chalk.gray('\nLocal files are kept unchanged.'));
    } else {
      const errorMsg = data?.msg || 'Failed to delete project';
      throw new Error(errorMsg);
    }

    process.exit(0);
  } catch (error: any) {
    console.log(chalk.red(error));
    const errorMsg = error.response?.data?.msg
      || error.message
      || 'Failed to delete project';
    console.error(chalk.red(`\n❌ Error: ${errorMsg}`));
    process.exit(1);
  }
}
