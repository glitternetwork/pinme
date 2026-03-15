import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import { getAuthHeaders } from './utils/webLogin';

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
    throw new Error('pinme.toml not found');
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
    throw new Error('SQL directory not found: db');
  }

  const files = fs.readdirSync(sqlDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    throw new Error('No SQL files found in db');
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
        throw new Error('Total SQL files size exceeds 10MB limit');
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
          console.log(chalk.green(`   ✓ ${result.filename}: ${result.num_queries} queries, ${result.duration}ms`));
          if (result.changes !== undefined) {
            console.log(chalk.gray(`     Changes: ${result.changes}, Read: ${result.rows_read}, Written: ${result.rows_written}`));
          }
        } else if (result.status === 'error') {
          console.log(chalk.red(`   ✗ ${result.filename}: ${result.error}`));
        }
      }
    } else {
      // Handle partial failure or other errors
      const errorMsg = response.data.msg || response.data.error || 'Failed to import SQL files';
      throw new Error(errorMsg);
    }
  } catch (error: any) {
    if (error.response) {
      console.log(chalk.red(`   Response status: ${error.response?.status}`));
      console.log(chalk.red(`   Response data: ${JSON.stringify(error.response?.data)}`));
    } else {
      console.log(chalk.red('No Response'))
    }
    const errorMsg = error.response?.data?.errors?.[0]?.message
      || error.response?.data?.error
      || error.response?.data?.msg
      || error.message
      || 'Failed to import SQL files';
    throw new Error(errorMsg);
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

    console.log(chalk.blue('🚀 Importing SQL to database...\n'));

    console.log(chalk.gray(`Project dir: ${PROJECT_DIR}`));

    const config = loadConfig();
    const projectName = config.project_name;

    if (!projectName) {
      throw new Error('project_name not found in pinme.toml');
    }

    console.log(chalk.gray(`Project: ${projectName}`));

    // Get SQL files from db directory
    const sqlFiles = getSqlFiles();
    console.log(chalk.gray(`Found ${sqlFiles.length} SQL file(s) in db`));

    await updateDb(sqlFiles, projectName);

    console.log(chalk.green('\n✅ Database update complete!'));
    process.exit(0);
  } catch (error: any) {
    console.error(chalk.red(`\n❌ Error: ${error.message}`));
    process.exit(1);
  }
}
