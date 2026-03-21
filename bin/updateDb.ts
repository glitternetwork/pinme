import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import { getAuthHeaders } from './utils/webLogin';
import {
  createApiError,
  createConfigError,
  printCliError,
} from './utils/cliError';

const PROJECT_DIR = process.cwd();
const API_BASE = process.env.PINME_API_BASE || '';

interface UpdateDbOptions {
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

function getSqlFiles(): string[] {
  const sqlDir = path.join(PROJECT_DIR, 'db');
  if (!fs.existsSync(sqlDir)) {
    throw createConfigError('SQL directory not found: `db/`.', [
      'Create a `db/` directory and add at least one `.sql` migration file.',
    ]);
  }

  const files = fs.readdirSync(sqlDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    throw createConfigError('No `.sql` files were found in `db/`.', [
      'Add one or more migration files before running `pinme update-db`.',
    ]);
  }

  return files.map(f => path.join(sqlDir, f));
}

// ============ 数据库更新 ============

async function updateDb(sqlFiles: string[], projectName: string) {
  console.log(chalk.blue('Importing SQL files to database...'));
  console.log(chalk.gray(`Project: ${projectName}`));
  console.log(chalk.gray(`SQL files: ${sqlFiles.length}`));

  const apiUrl = `${API_BASE}/update_db?project_name=${encodeURIComponent(projectName)}`;
  const headers = getAuthHeaders();
  console.log(chalk.gray(`API URL: ${apiUrl}`));

  try {
    const FormData = (await import('formdata-node')).FormData;
    const Blob = (await import('formdata-node')).Blob;
    const formData = new FormData() as any;

    // Add SQL files (can have multiple files with same field name)
    let totalSize = 0;
    for (const sqlFile of sqlFiles) {
      const filename = path.basename(sqlFile);
      const content = fs.readFileSync(sqlFile);
      totalSize += content.length;

      if (totalSize > 10 * 1024 * 1024) {
        throw createConfigError('Total SQL payload exceeds the 10MB platform limit.', [
          'Split migrations into smaller batches, then rerun `pinme update-db`.',
        ]);
      }

      formData.append('file', new Blob([content], {
        type: 'application/sql',
      }), filename);

      console.log(chalk.gray(`   Including: ${filename} (${content.length} bytes)`));
    }

    const response = await axios.post(apiUrl, formData, {
      headers: { ...headers },
      timeout: 120000,
    });

    console.log(chalk.gray(`   Response: ${JSON.stringify(response.data)}`));

    if (response.data.code === 200) {
      console.log(chalk.green('SQL files imported successfully!'));

      // Display results
      const results = response.data.data.results;
      for (const result of results) {
        if (result.status === 'complete') {
          console.log(chalk.green(`   COMPLETE ${result.filename}: ${result.num_queries} queries, ${result.duration}ms`));
          if (result.changes !== undefined) {
            console.log(chalk.gray(`     Changes: ${result.changes}, Read: ${result.rows_read}, Written: ${result.rows_written}`));
          }
        } else if (result.status === 'error') {
          console.log(chalk.red(`   ERROR ${result.filename}: ${result.error}`));
        }
      }
    } else {
      // Handle partial failure or other errors
      throw createApiError('database update', { response: { data: response.data } }, [
        `Project: ${projectName}`,
        `Endpoint: ${apiUrl}`,
      ], [
        'Inspect the SQL result list above to identify the failing migration file.',
      ]);
    }
  } catch (error: any) {
    throw createApiError('database update', error, [
      `Project: ${projectName}`,
      `Endpoint: ${apiUrl}`,
    ], [
      'Validate the SQL syntax and check whether any migration is re-applying an existing schema change.',
    ]);
  }
}

// ============ 主函数 ============

/**
 * Update database: import SQL files to project's D1 database
 * API: POST /api/v4/update_db?project_name={name}
 */
export default async function updateDbCmd(options?: UpdateDbOptions): Promise<void> {
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

    console.log(chalk.blue('Importing SQL to database...\n'));

    console.log(chalk.gray(`Project dir: ${PROJECT_DIR}`));

    const config = loadConfig();
    const projectName = config.project_name;

    if (!projectName) {
      throw createConfigError('`project_name` is missing in `pinme.toml`.', [
        'Set `project_name = "your-project-name"` in `pinme.toml`.',
      ]);
    }

    console.log(chalk.gray(`Project: ${projectName}`));

    // Get SQL files from db directory
    const sqlFiles = getSqlFiles();
    console.log(chalk.gray(`Found ${sqlFiles.length} SQL file(s) in db`));

    await updateDb(sqlFiles, projectName);

    console.log(chalk.green('\nDatabase update complete.'));
    process.exit(0);
  } catch (error: any) {
    printCliError(error, 'Database update failed.');
    process.exit(1);
  }
}
