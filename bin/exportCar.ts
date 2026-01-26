import path from 'path';
import os from 'os';
import chalk from 'chalk';
import inquirer from 'inquirer';
import figlet from 'figlet';
import fs from 'fs';
import axios from 'axios';
import ora from 'ora';
import { requestCarExport, checkCarExportStatus } from './utils/pinmeApi';
import { getUid } from './utils/getDeviceId';
import { checkNodeVersion } from './utils/checkNodeVersion';

checkNodeVersion();

// Polling configuration
const POLL_INTERVAL = 5000; // 5 seconds
const MAX_POLL_TIME = 30 * 60 * 1000; // 30 minutes

// Poll export status until completion
async function pollExportStatus(
  taskId: string,
  cid: string,
  spinner: ora.Ora,
  startTime: number,
): Promise<string | null> {
  while (Date.now() - startTime < MAX_POLL_TIME) {
    try {
      const status = await checkCarExportStatus(taskId);
      
      if (status.status === 'completed' && status.download_url) {
        spinner.succeed(`Export completed for CID: ${cid}`);
        return status.download_url;
      } else if (status.status === 'failed') {
        spinner.fail(`Export failed for CID: ${cid}`);
        return null;
      } else if (status.status === 'processing') {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        spinner.text = `Exporting CAR file... (${minutes}m ${seconds}s)`;
      }
    } catch (error: any) {
      console.log(chalk.yellow(`Polling error: ${error.message}`));
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }

  const maxPollTimeMinutes = Math.floor(MAX_POLL_TIME / (60 * 1000));
  spinner.fail(`Export timeout after ${maxPollTimeMinutes} minutes`);
  return null;
}

// Download CAR file from URL
async function downloadCarFile(
  downloadUrl: string,
  outputPath: string,
): Promise<boolean> {
  try {
    const spinner = ora(`Downloading CAR file to ${outputPath}...`).start();
    
    const response = await axios({
      method: 'GET',
      url: downloadUrl,
      responseType: 'stream',
      timeout: 1800000, // 30 minutes timeout
    });

    const writer = fs.createWriteStream(outputPath);
    let downloadedBytes = 0;
    const totalBytes = parseInt(response.headers['content-length'] || '0', 10);

    response.data.on('data', (chunk: Buffer) => {
      downloadedBytes += chunk.length;
      if (totalBytes > 0) {
        const progress = (downloadedBytes / totalBytes) * 100;
        spinner.text = `Downloading CAR file... ${progress.toFixed(1)}%`;
      }
    });

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        spinner.succeed(`CAR file downloaded successfully: ${outputPath}`);
        resolve(true);
      });
      writer.on('error', (error) => {
        spinner.fail(`Download failed: ${error.message}`);
        reject(error);
      });
    });
  } catch (error: any) {
    console.error(chalk.red(`Download error: ${error.message}`));
    return false;
  }
}

// Validate CID format (basic check)
function isValidCID(cid: string): boolean {
  // Basic CID validation - should start with 'Qm' (CIDv0) or 'bafy' (CIDv1)
  return /^(Qm|bafy|bafk|bafz)/.test(cid);
}

// Get CID from command line arguments
function getCidFromArgs(): string | null {
  const args = process.argv.slice(2);
  const cidIdx = args.findIndex((a) => a === 'export') + 1;
  if (cidIdx > 0 && args[cidIdx] && !args[cidIdx].startsWith('-')) {
    return args[cidIdx].trim();
  }
  return null;
}

// Get current working directory
function getCurrentDirectory(): string {
  return process.cwd();
}

// Get output path from command line arguments
function getOutputPathFromArgs(): string | null {
  const args = process.argv.slice(2);
  const outputIdx = args.findIndex((a) => a === '--output' || a === '-o');
  if (outputIdx >= 0 && args[outputIdx + 1] && !args[outputIdx + 1].startsWith('-')) {
    return String(args[outputIdx + 1]).trim();
  }
  return null;
}

export default async (): Promise<void> => {
  try {
    console.log(
      figlet.textSync('PINME EXPORT', {
        font: 'Standard',
        horizontalLayout: 'default',
        verticalLayout: 'default',
        width: 180,
        whitespaceBreak: true,
      }),
    );

    // Get CID from arguments or prompt
    let cid = getCidFromArgs();
    if (!cid) {
      const answer = await inquirer.prompt([
        {
          type: 'input',
          name: 'cid',
          message: 'Enter CID to export: ',
          validate: (input: string) => {
            if (!input.trim()) {
              return 'CID cannot be empty';
            }
            if (!isValidCID(input.trim())) {
              return 'Invalid CID format. CID should start with Qm, bafy, bafk, or bafz';
            }
            return true;
          },
        },
      ]);
      cid = answer.cid.trim();
    }

    if (!cid || !isValidCID(cid)) {
      console.log(chalk.red('Invalid CID format. CID should start with Qm, bafy, bafk, or bafz'));
      return;
    }

    // Get output directory (output parameter is always a directory, not a file)
    let outputDir = getOutputPathFromArgs();
    if (!outputDir) {
      // Default to current directory
      const currentDir = getCurrentDirectory();
      const answer = await inquirer.prompt([
        {
          type: 'input',
          name: 'output',
          message: `Output directory (default: ${currentDir}): `,
          default: currentDir,
        },
      ]);
      outputDir = answer.output.trim() || currentDir;
    }

    // Convert to absolute path
    outputDir = path.resolve(outputDir);

    // Create directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    } else if (!fs.statSync(outputDir).isDirectory()) {
      // If path exists but is not a directory, show error
      console.log(chalk.red(`Error: ${outputDir} exists but is not a directory.`));
      return;
    }

    // Final output path is always {outputDir}/{cid}.car
    const finalOutputPath = path.join(outputDir, `${cid}.car`);

    // Check if file already exists
    if (fs.existsSync(finalOutputPath)) {
      const answer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: `File ${finalOutputPath} already exists. Overwrite?`,
          default: false,
        },
      ]);
      if (!answer.overwrite) {
        console.log(chalk.blue('Export cancelled.'));
        return;
      }
    }

    // Get UID
    const uid = getUid();

    // Step 1: Request export
    const spinner = ora(`Requesting CAR export for CID: ${cid}...`).start();
    try {
      const exportResponse = await requestCarExport(cid, uid);
      spinner.succeed(`Export task created: ${exportResponse.task_id}`);
      
      // Step 2: Poll for status
      const pollSpinner = ora('Waiting for export to complete...').start();
      const startTime = Date.now();
      const downloadUrl = await pollExportStatus(
        exportResponse.task_id,
        cid,
        pollSpinner,
        startTime,
      );

      if (!downloadUrl) {
        console.log(chalk.red('Export failed or timed out.'));
        return;
      }

      // Step 3: Download CAR file
      const success = await downloadCarFile(downloadUrl, finalOutputPath);
      if (success) {
        const fileSize = fs.statSync(finalOutputPath).size;
        const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
        console.log(
          chalk.cyan(
            figlet.textSync('Successful', { horizontalLayout: 'full' }),
          ),
        );
        console.log(chalk.green(`\n🎉 Export successful!`));
        console.log(chalk.cyan(`File: ${finalOutputPath}`));
        console.log(chalk.cyan(`Size: ${fileSizeMB} MB`));
        console.log(chalk.cyan(`CID: ${cid}`));
      } else {
        console.log(chalk.red('Download failed.'));
      }
    } catch (error: any) {
      spinner.fail(`Error: ${error.message}`);
      console.error(chalk.red(`Export error: ${error.message}`));
    }
  } catch (error: any) {
    console.error(chalk.red(`error executing: ${error.message}`));
    console.error(error.stack);
  }
};

