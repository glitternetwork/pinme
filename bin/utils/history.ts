import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import dayjs from 'dayjs';
import chalk from 'chalk';
import { formatSize } from './uploadLimits';
import { getRootDomain } from './pinmeApi';

// history file path
const HISTORY_DIR = path.join(os.homedir(), '.pinme');
const HISTORY_FILE = path.join(HISTORY_DIR, 'upload-history.json');

interface UploadRecord {
  timestamp: number;
  date: string;
  path: string;
  filename: string;
  contentHash: string;
  previewHash: string | null;
  size: number;
  fileCount: number;
  type: 'directory' | 'file';
  shortUrl?: string | null;
  pinmeUrl?: string | null;
  dnsUrl?: string | null;
}

interface UploadHistory {
  uploads: UploadRecord[];
}

interface UploadData {
  path: string;
  filename?: string;
  contentHash: string;
  previewHash?: string | null;
  size: number;
  fileCount?: number;
  isDirectory?: boolean;
  shortUrl?: string | null;
  pinmeUrl?: string | null;
  dnsUrl?: string | null;
}

// ensure the history directory exists
const ensureHistoryDir = (): void => {
  if (!fs.existsSync(HISTORY_DIR)) {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
  }
  if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeJsonSync(HISTORY_FILE, { uploads: [] });
  }
};

// save the upload history
const saveUploadHistory = (uploadData: UploadData): boolean => {
  try {
    ensureHistoryDir();
    
    const history = fs.readJsonSync(HISTORY_FILE) as UploadHistory;
    
    // add new upload record
    const newRecord: UploadRecord = {
      timestamp: Date.now(),
      date: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      path: uploadData.path,
      filename: uploadData.filename || path.basename(uploadData.path),
      contentHash: uploadData.contentHash,
      previewHash: uploadData.previewHash,
      size: uploadData.size,
      fileCount: uploadData.fileCount || 1,
      type: uploadData.isDirectory ? 'directory' : 'file',
      shortUrl: uploadData?.shortUrl || null,
      pinmeUrl: uploadData?.pinmeUrl || null,
      dnsUrl: uploadData?.dnsUrl || null,
    };
    
    history.uploads.unshift(newRecord); // add to the beginning
    
    // write to file
    fs.writeJsonSync(HISTORY_FILE, history, { spaces: 2 });
    return true;
  } catch (error: any) {
    console.error(chalk.red(`Error saving upload history: ${error.message}`));
    return false;
  }
};

// get the upload history
const getUploadHistory = (limit: number = 10): UploadRecord[] => {
  try {
    ensureHistoryDir();
    
    const history = fs.readJsonSync(HISTORY_FILE) as UploadHistory;
    return history.uploads.slice(0, limit);
  } catch (error: any) {
    console.error(chalk.red(`Error reading upload history: ${error.message}`));
    return [];
  }
};

async function formatHistoryUrl(
  value?: string | null,
  options?: { appendRootDomain?: boolean; rootDomain?: string | null },
): Promise<string | null> {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (/^https?:\/\//.test(normalized)) {
    if (
      options?.appendRootDomain &&
      options.rootDomain &&
      (() => {
        try {
          return !new URL(normalized).hostname.includes('.');
        } catch {
          return false;
        }
      })()
    ) {
      const url = new URL(normalized);
      url.hostname = `${url.hostname}.${options.rootDomain}`;
      return url.toString().replace(/\/$/, '');
    }
    return normalized.replace(/\/$/, '');
  }

  if (normalized.includes('.')) {
    return `https://${normalized}`;
  }

  if (options?.appendRootDomain && options.rootDomain) {
    return `https://${normalized}.${options.rootDomain}`;
  }

  return `https://${normalized}`;
}

// display the upload history
const displayUploadHistory = async (limit: number = 10): Promise<void> => {
  const history = getUploadHistory(limit);
  
  if (history.length === 0) {
    console.log(chalk.yellow('No upload history found.'));
    return;
  }
  
  console.log(chalk.cyan('Upload History:'));
  console.log(chalk.cyan('-'.repeat(80)));
  let rootDomain: string | null = null;
  try {
    rootDomain = await getRootDomain();
  } catch {
    rootDomain = null;
  }
  
  // Display recent records, up to limit records
  const recentHistory = history.slice(-limit);
  
  for (const [index, item] of recentHistory.entries()) {
    console.log(chalk.green(`${index + 1}. ${item.filename}`));
    console.log(chalk.white(`   Path: ${item.path}`));
    console.log(chalk.white(`   IPFS CID: ${item.contentHash}`));
    const preferredUrl =
      (await formatHistoryUrl(item.dnsUrl)) ||
      (await formatHistoryUrl(item.pinmeUrl, {
        appendRootDomain: true,
        rootDomain,
      })) ||
      (await formatHistoryUrl(item.shortUrl, {
        appendRootDomain: true,
        rootDomain,
      }));
    if (preferredUrl) {
      console.log(chalk.white(`   URL: ${preferredUrl}`));
    }
    console.log(chalk.white(`   Size: ${formatSize(item.size)}`));
    console.log(chalk.white(`   Files: ${item.fileCount}`));
    console.log(chalk.white(`   Type: ${item.type === 'directory' ? 'Directory' : 'File'}`));
    if (item.timestamp) {
      console.log(chalk.white(`   Date: ${new Date(item.timestamp).toLocaleString()}`));
    }
    console.log(chalk.cyan('-'.repeat(80)));
  }
  
  // display the statistics
  const totalSize = history.reduce((sum, record) => sum + record.size, 0);
  const totalFiles = history.reduce((sum, record) => sum + record.fileCount, 0);
  console.log(chalk.bold(`Total Uploads: ${history.length}`));
  console.log(chalk.bold(`Total Files: ${totalFiles}`));
  console.log(chalk.bold(`Total Size: ${formatSize(totalSize)}`));
};

// clear the upload history
const clearUploadHistory = (): boolean => {
  try {
    ensureHistoryDir();
    fs.writeJsonSync(HISTORY_FILE, { uploads: [] });
    console.log(chalk.green('Upload history cleared successfully.'));
    return true;
  } catch (error: any) {
    console.error(chalk.red(`Error clearing upload history: ${error.message}`));
    return false;
  }
};

export {
  saveUploadHistory,
  getUploadHistory,
  displayUploadHistory,
  clearUploadHistory
}; 
