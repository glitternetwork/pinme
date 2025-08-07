import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import FormData from 'form-data';
import ora from 'ora';
import chalk from 'chalk';
import {
  checkFileSizeLimit,
  checkDirectorySizeLimit,
  formatSize,
} from './uploadLimits';
import { saveUploadHistory } from './history';
import { getDeviceId } from './getDeviceId';

const ipfsApiUrl =
  process.env.IPFS_API_URL || 'https://ipfs.glitterprotocol.dev/api/v2';

// Polling configuration
const maxPollTime =
  parseInt(process.env.MAX_POLL_TIME_MINUTES || '5') * 60 * 1000; // Default 5 minutes

const pollInterval = parseInt(process.env.POLL_INTERVAL_SECONDS || '2') * 1000; // Default 2 seconds

const pollTimeout = parseInt(process.env.POLL_TIMEOUT_SECONDS || '10') * 1000; // Default 10 seconds

interface FileInfo {
  name: string;
  path: string;
}

// Legacy interface for backward compatibility
interface IpfsResponse {
  data: {
    data: Array<{
      Name: string;
      Hash: string;
      Size: string;
      ShortUrl?: string;
    }>;
  };
}

// New interface for trace_id response
interface TraceIdResponse {
  data: {
    trace_id: string;
  };
}

// New interface for upload status response
interface UploadStatusResponse {
  code: number;
  msg: string;
  data: {
    trace_id: string;
    upload_rst: {
      Bytes: number;
      Hash: string;
      Name: string;
      Size: string;
      ShortUrl: string;
    };
    is_ready: boolean;
  };
}

// Poll upload status until completion
async function pollUploadStatus(
  traceId: string,
  deviceId: string,
  smartProgress: SmartProgressBar,
  startTime: number,
): Promise<UploadStatusResponse['data'] | null> {
  let consecutiveErrors = 0;
  let stopProgressUpdates = false;

  while (Date.now() - startTime < maxPollTime) {
    try {
      const response = await axios.get<UploadStatusResponse>(
        `${ipfsApiUrl}/up_status?trace_id=${traceId}&uid=${deviceId}`,
        {
          timeout: pollTimeout,
          headers: {
            'User-Agent': 'Pinme-CLI/1.0.0',
            Accept: '*/*',
            Host: new URL(ipfsApiUrl).host,
            Connection: 'keep-alive',
          },
        },
      );

      const { code, msg, data } = response.data;

      if (code === 200) {
        // Reset error counter on successful response
        consecutiveErrors = 0;
        stopProgressUpdates = false; // Re-enable progress updates on success

        if (data.is_ready) {
          // Only complete when actually ready
          smartProgress.complete(traceId);
          return data;
        } else {
          // Keep updating progress but it will be capped at 95% in calculateProgress()
          smartProgress.updateDisplay();
        }
      } else {
        console.log(chalk.yellow(`Warning: ${msg}`));
        // Don't update progress on warnings, just log them
      }
    } catch (error: any) {
      consecutiveErrors++;
      console.log(chalk.yellow(`Polling error: ${error.message}`));

      // Always update time display, even on errors
      if (stopProgressUpdates) {
        smartProgress.updateTimeOnly();
      }
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  const maxPollTimeMinutes = Math.floor(maxPollTime / (60 * 1000));
  smartProgress.fail(
    `Upload timeout after ${maxPollTimeMinutes} minutes`,
    traceId,
  );
  return null;
}

// Error diagnosis utility function
function diagnoseDirectoryUploadError(
  directoryName: string,
  resData: any,
  expectedName: string,
): string {
  const issues: string[] = [];

  // Check directory name length
  if (directoryName.length > 100) {
    issues.push(
      `Directory name too long (${directoryName.length} characters, recommended under 100 characters)`,
    );
  }

  // Check available names in response
  const availableName = resData.Name;
  issues.push(`Name returned by IPFS: ${availableName}`);
  issues.push(`Expected directory name: ${expectedName}`);

  // Check encoding issues
  const encodedName = encodeURIComponent(directoryName);
  if (encodedName !== directoryName) {
    issues.push(`Directory name after encoding: ${encodedName}`);
  }

  return issues.join('\n  - ');
}

// Handle multipart errors specifically
function handleMultipartError(error: any, context: string): string {
  if (error.message && error.message.includes('multipart: NextPart: EOF')) {
    return `Multipart form data error: ${context}. This usually indicates:
  - Empty directory or no valid files
  - File access permissions issue
  - Network interruption during upload
  - Server-side multipart parsing error`;
  }

  if (error.message && error.message.includes('ENOENT')) {
    return `File not found error: ${context}. Please check:
  - File path is correct
  - File exists and is accessible
  - No permission issues`;
  }

  if (error.message && error.message.includes('EACCES')) {
    return `Permission denied error: ${context}. Please check:
  - File read permissions
  - Directory access permissions
  - User has sufficient privileges`;
  }

  return `Upload error: ${error.message}`;
}

// error code
const ERROR_CODES = {
  '30001': `File too large, single file max size: ${process.env.FILE_SIZE_LIMIT}MB,single folder max size: ${process.env.DIRECTORY_SIZE_LIMIT}MB`,
  '30002': `Max storage quorum ${Number(process.env.STORAGE_SIZE_LIMIT) / 1000
    } GB reached`,
};

function loadFilesToArrRecursively(
  directoryPath: string,
  dist: string,
  basePath?: string,
): FileInfo[] {
  const filesArr: FileInfo[] = [];
  const sep = path.sep;

  // Calculate the base path - we want to keep the full directory structure
  // Use the parent directory of the uploaded directory as base path
  // If basePath is not provided, calculate it from the current directory
  if (!basePath) {
    const parentDir = path.dirname(directoryPath);
    basePath = parentDir.endsWith(sep) ? parentDir : parentDir + sep;
  }

  // check if it is a directory
  if (fs.statSync(directoryPath).isDirectory()) {
    const files = fs.readdirSync(directoryPath);

    files.forEach((file) => {
      const filePath = path.join(directoryPath, file);
      if (fs.statSync(filePath).isFile()) {
        // check the file size
        const sizeCheck = checkFileSizeLimit(filePath);
        if (sizeCheck.exceeds) {
          throw new Error(
            `File ${file} exceeds size limit of ${formatSize(
              sizeCheck.limit,
            )} (size: ${formatSize(sizeCheck.size)})`,
          );
        }

        // Get relative path from the base path to keep full structure
        // This preserves the complete directory structure including the uploaded directory
        const relativePath = filePath.replace(basePath, '');
        const encodedPath = relativePath.replaceAll(sep, '%2F');

        filesArr.push({
          name: encodedPath,
          path: filePath,
        });
      } else if (fs.statSync(filePath).isDirectory()) {
        // Pass the same basePath to recursive calls to maintain consistency
        const recursiveFiles = loadFilesToArrRecursively(
          filePath,
          dist,
          basePath,
        );
        filesArr.push(...recursiveFiles);
      }
    });
  } else {
    console.error('Error: path must be a directory');
  }

  return filesArr;
}

function countFilesInDirectory(directoryPath: string): number {
  let count = 0;
  const files = fs.readdirSync(directoryPath);

  for (const file of files) {
    const filePath = path.join(directoryPath, file);
    const stats = fs.statSync(filePath);

    if (stats.isFile()) {
      count++;
    } else if (stats.isDirectory()) {
      count += countFilesInDirectory(filePath);
    }
  }

  return count;
}

// upload directory to ipfs
async function uploadDirectory(
  directoryPath: string,
  deviceId: string,
): Promise<{ hash: string; shortUrl?: string } | null> {
  // check the size of all files in the directory
  const sizeCheck = checkDirectorySizeLimit(directoryPath);

  // check the size limit of single file
  if (sizeCheck.exceeds) {
    throw new Error(
      `Directory ${directoryPath} exceeds size limit of ${formatSize(
        sizeCheck.limit,
      )} (size: ${formatSize(sizeCheck.size)})`,
    );
  }

  const formData = new FormData();

  // redundant check for directoryPath, ensure directoryPath ends with no separator
  if (directoryPath.endsWith(path.sep))
    directoryPath = directoryPath.slice(0, -1);

  // get the last layer directory, as the ipfs directory name
  const dist = directoryPath.split(path.sep).pop() || '';

  // recursively get all files
  const files = loadFilesToArrRecursively(directoryPath, dist);
  const totalFiles = files.length;

  // Validate that we have files to upload
  if (totalFiles === 0) {
    throw new Error(
      `Directory ${directoryPath} is empty or contains no valid files`,
    );
  }

  files.forEach((file) => {
    // Validate file exists before adding to FormData
    if (!fs.existsSync(file.path)) {
      throw new Error(`File not found: ${file.path}`);
    }

    const fileStats = fs.statSync(file.path);
    if (!fileStats.isFile()) {
      throw new Error(`Path is not a file: ${file.path}`);
    }

    formData.append('file', fs.createReadStream(file.path), {
      filename: file.name,
    });
  });

  // Create smart progress bar
  const startTime = Date.now();
  const spinner = ora(`Preparing upload...`).start();

  // Calculate total size for progress bar
  let totalSize = 0;
  files.forEach((file) => {
    try {
      const stats = fs.statSync(file.path);
      totalSize += stats.size;
    } catch (error) {
      // Skip files that can't be read
    }
  });

  const smartProgress = new SmartProgressBar(
    dist,
    totalFiles,
    totalSize,
    spinner,
  );

  // Timer to update time display every second
  const timeInterval = setInterval(() => {
    smartProgress.updateTime();
  }, 1000); // Update time every 1 second

  // Timer to update progress bar
  const progressInterval = setInterval(() => {
    smartProgress.updateProgress();
  }, 200); // Update progress every 200ms for smooth animation

  try {
    // Start upload phase
    smartProgress.startUpload();

    const response = await axios.post<TraceIdResponse>(
      `${ipfsApiUrl}/add?uid=${deviceId}&cidV=1`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
        timeout: 1800000, // 30 minutes timeout
      },
    );

    clearInterval(progressInterval);
    smartProgress.startPolling();

    const { trace_id } = response.data.data;
    if (!trace_id) {
      smartProgress.fail('No request id received from server');
      clearInterval(timeInterval);
      return null;
    }

    // Second stage: Poll for upload status
    smartProgress.updateDisplay(); // Update to show polling status

    const uploadResult = await pollUploadStatus(
      trace_id,
      deviceId,
      smartProgress,
      startTime,
    );
    if (!uploadResult) {
      clearInterval(timeInterval);
      return null;
    }

    // Find the directory item in upload results
    const directoryItem = uploadResult.upload_rst;
    if (directoryItem) {
      const fileCount = countFilesInDirectory(directoryPath);
      const uploadData = {
        path: directoryPath,
        filename: path.basename(directoryPath),
        contentHash: directoryItem.Hash,
        previewHash: null,
        size: sizeCheck.size,
        fileCount: fileCount,
        isDirectory: true,
        shortUrl: directoryItem.ShortUrl || null,
      };
      saveUploadHistory(uploadData);

      clearInterval(timeInterval);
      return {
        hash: directoryItem.Hash,
        shortUrl: directoryItem.ShortUrl,
      };
    }

    // Provide detailed error diagnosis information
    const diagnosticInfo = diagnoseDirectoryUploadError(
      dist,
      uploadResult.upload_rst,
      dist,
    );

    smartProgress.fail('Directory hash not found in response');
    console.log(
      chalk.red(
        `\n❌ Directory upload failed: Directory hash not found in response`,
      ),
    );
    console.log(chalk.yellow(`\n📋 Error diagnosis information:`));
    console.log(chalk.gray(`  - ${diagnosticInfo}`));

    console.log(chalk.blue(`\n🔧 Solutions:`));
    console.log(
      chalk.gray(`  1. Ensure directory is not empty and contains valid files`),
    );
    console.log(chalk.gray(`  2. Check network connection stability`));
    console.log(
      chalk.gray(`  3. Try uploading a smaller directory for testing`),
    );

    clearInterval(timeInterval);
    return null;
  } catch (error: any) {
    clearInterval(progressInterval);
    clearInterval(timeInterval);

    // Handle multipart errors specifically
    if (error.message && error.message.includes('multipart')) {
      const errorMessage = handleMultipartError(
        error,
        `Directory upload: ${dist}`,
      );
      smartProgress.fail(errorMessage);
      console.log(chalk.red(`\n❌ ${errorMessage}`));
      return null;
    }

    // Handle specific error codes
    if (error.response && error.response.data && error.response.data.code) {
      const errorCode = error.response.data.code.toString();
      if (ERROR_CODES[errorCode]) {
        smartProgress.fail(
          `Error: ${ERROR_CODES[errorCode]} (Code: ${errorCode})`,
        );
        console.log(
          chalk.red(`Error: ${ERROR_CODES[errorCode]} (Code: ${errorCode})`),
        );
        return null;
      }
    }

    smartProgress.fail(`Error: ${error.message}`);
    console.log(chalk.red(`Error: ${error.message}`));
    return null;
  }
}

// upload file to ipfs
async function uploadFile(
  filePath: string,
  deviceId: string,
): Promise<{ hash: string; shortUrl?: string } | null> {
  const sizeCheck = checkFileSizeLimit(filePath);
  if (sizeCheck.exceeds) {
    throw new Error(
      `File ${filePath} exceeds size limit of ${formatSize(
        sizeCheck.limit,
      )} (size: ${formatSize(sizeCheck.size)})`,
    );
  }

  const fileName = filePath.split(path.sep).pop() || '';

  // Validate file exists and is accessible
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const fileStats = fs.statSync(filePath);
  if (!fileStats.isFile()) {
    throw new Error(`Path is not a file: ${filePath}`);
  }

  console.log(chalk.blue('\n📄 File Upload Analysis:'));
  console.log(chalk.gray(`  File path: ${filePath}`));
  console.log(chalk.gray(`  File name: ${fileName}`));
  console.log(chalk.gray(`  File size: ${formatSize(fileStats.size)}`));
  console.log(chalk.gray(`  File exists: ${fs.existsSync(filePath)}`));
  console.log(chalk.gray(`  Is file: ${fileStats.isFile()}\n`));

  // Create smart progress bar
  const startTime = Date.now();
  const spinner = ora(`Preparing upload...`).start();

  // Get file size for progress bar
  let totalSize = 0;
  try {
    const stats = fs.statSync(filePath);
    totalSize = stats.size;
  } catch (error) {
    // Use 0 if can't read file size
  }

  const smartProgress = new SmartProgressBar(fileName, 1, totalSize, spinner);

  // Timer to update time display every second
  const timeInterval = setInterval(() => {
    smartProgress.updateTime();
  }, 1000); // Update time every 1 second

  // Timer to update progress bar
  const progressInterval = setInterval(() => {
    smartProgress.updateProgress();
  }, 200); // Update progress every 200ms for smooth animation

  try {
    // Start upload phase
    smartProgress.startUpload();

    const formData = new FormData();
    const encodedFileName = encodeURIComponent(fileName);

    formData.append('file', fs.createReadStream(filePath), {
      filename: encodedFileName,
    });

    const response = await axios.post<TraceIdResponse>(
      `${ipfsApiUrl}/add?uid=${deviceId}&cidV=1`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
        timeout: 1800000, // 30 minutes timeout
      },
    );

    clearInterval(progressInterval);
    smartProgress.startPolling();

    const trace_id = response.data.data.trace_id;
    if (!trace_id) {
      smartProgress.fail('No request id received from server');
      clearInterval(timeInterval);
      return null;
    }

    smartProgress.updateDisplay(); // Update to show polling status

    const uploadResult = await pollUploadStatus(
      trace_id,
      deviceId,
      smartProgress,
      startTime,
    );
    if (!uploadResult) {
      clearInterval(timeInterval);
      return null;
    }

    const fileItem = uploadResult.upload_rst;
    if (fileItem) {
      const uploadData = {
        path: filePath,
        filename: fileName,
        contentHash: fileItem.Hash,
        previewHash: null,
        size: sizeCheck.size,
        fileCount: 1,
        isDirectory: false,
        shortUrl: fileItem.ShortUrl || null,
      };
      saveUploadHistory(uploadData);

      smartProgress.complete(trace_id);
      clearInterval(timeInterval);

      return {
        hash: fileItem.Hash,
        shortUrl: fileItem.ShortUrl,
      };
    }

    // Provide detailed file upload error diagnosis information
    smartProgress.fail('File hash not found in response');
    console.log(
      chalk.red(`\n❌ File upload failed: File hash not found in response`),
    );
    console.log(chalk.yellow(`\n📋 Error diagnosis information:`));
    console.log(chalk.gray(`  - File name: ${fileName}`));
    console.log(
      chalk.gray(`  - Name returned by IPFS: ${uploadResult.upload_rst.Name}`),
    );

    console.log(chalk.blue(`\n🔧 Solutions:`));
    console.log(chalk.gray(`  1. Check if file is corrupted or unreadable`));
    console.log(chalk.gray(`  2. Check network connection stability`));
    console.log(chalk.gray(`  3. Try uploading a smaller file for testing`));

    clearInterval(timeInterval);
    return null;
  } catch (error: any) {
    clearInterval(progressInterval);
    clearInterval(timeInterval);

    // Handle multipart errors specifically
    if (error.message && error.message.includes('multipart')) {
      const errorMessage = handleMultipartError(
        error,
        `File upload: ${fileName}`,
      );
      smartProgress.fail(errorMessage);
      console.log(chalk.red(`\n❌ ${errorMessage}`));
      return null;
    }

    // Handle specific error codes
    if (error.response && error.response.data && error.response.data.code) {
      const errorCode = error.response.data.code.toString();
      if (ERROR_CODES[errorCode]) {
        smartProgress.fail(
          `Error: ${ERROR_CODES[errorCode]} (Code: ${errorCode})`,
        );
        console.log(
          chalk.red(`Error: ${ERROR_CODES[errorCode]} (Code: ${errorCode})`),
        );
        return null;
      }
    }

    smartProgress.fail(`Error: ${error.message}`);
    console.log(chalk.red(`Error: ${error.message}`));
    return null;
  }
}

// Smart progress bar based on exponential decay model
class SmartProgressBar {
  private timeConstant: number;
  private startTime: number;
  private uploadStartTime: number;
  private isUploading: boolean;
  private isPolling: boolean;
  private fileCount: number;
  private totalSize: number;
  private spinner: ora.Ora;
  private fileName: string;
  private isCompleted: boolean; // Add completion flag

  constructor(
    fileName: string,
    fileCount: number,
    totalSize: number,
    spinner: ora.Ora,
  ) {
    this.fileName = fileName;
    this.fileCount = fileCount;
    this.totalSize = totalSize;
    this.spinner = spinner;
    this.timeConstant = this.calcTimeConstant(fileCount, totalSize);
    this.startTime = Date.now();
    this.uploadStartTime = 0;
    this.isUploading = false;
    this.isPolling = false;
    this.isCompleted = false; // Initialize completion flag
  }

  // Calculate time constant based on file count and total size
  private calcTimeConstant(fileCount: number, totalSize: number): number {
    // Base coefficient (higher value = slower progress)
    // Increased base value for more realistic timing
    const base = 8000; // Increased from 2500 to 8000

    // File count influence weight (30%)
    const countFactor = 0.3 * Math.log(1 + fileCount);

    // File size influence weight (70%) - convert bytes to MB
    const sizeFactor = 0.7 * Math.log(1 + totalSize / 1024 / 1024);

    // Add minimum time constant to ensure progress doesn't go too fast
    const minTimeConstant = 15000; // 15 seconds minimum
    const calculatedTimeConstant = base * (1 + countFactor + sizeFactor);

    return Math.max(calculatedTimeConstant, minTimeConstant);
  }

  // Calculate progress using exponential decay model with upper limit
  private calculateProgress(): number {
    const elapsed = Date.now() - this.startTime;

    // Use exponential decay: progress = 1 - exp(-time / timeConstant)
    const rawProgress = 1 - Math.exp(-elapsed / this.timeConstant);

    // Cap progress at 95% until actually complete
    // This prevents showing 100% while still processing
    const maxProgress = this.isPolling ? 0.95 : 0.9;

    return Math.min(rawProgress, maxProgress);
  }

  // Start upload phase
  startUpload(): void {
    this.isUploading = true;
    this.uploadStartTime = Date.now();
  }

  // Start polling phase
  startPolling(): void {
    this.isPolling = true;
    this.isUploading = false;
  }

  // Update progress display
  update(): void {
    if (this.isCompleted) {
      return; // Don't update if already completed
    }

    const progress = this.calculateProgress();
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const progressBar = this.createProgressBar(progress);
    const duration = this.formatDuration(elapsed);

    let status = '';
    if (this.isUploading) {
      status = 'uploading';
    } else if (this.isPolling) {
      status = 'processing';
    } else {
      status = 'preparing';
    }

    const fileInfo =
      this.fileCount > 1
        ? `${this.fileName} (${this.fileCount} files)`
        : this.fileName;

    this.spinner.text = `Uploading ${fileInfo} ${progressBar} ${duration} (${status})`;
  }

  // Update time display only (called every second)
  updateTime(): void {
    if (this.isCompleted) {
      return; // Don't update if already completed
    }

    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const duration = this.formatDuration(elapsed);

    // Get current progress and status
    const progress = this.calculateProgress();
    const progressBar = this.createProgressBar(progress);

    let status = '';
    if (this.isUploading) {
      status = 'uploading';
    } else if (this.isPolling) {
      status = 'processing';
    } else {
      status = 'preparing';
    }

    const fileInfo =
      this.fileCount > 1
        ? `${this.fileName} (${this.fileCount} files)`
        : this.fileName;

    this.spinner.text = `Uploading ${fileInfo} ${progressBar} ${duration} (${status})`;
  }

  // Update progress bar only (called every 200ms)
  updateProgress(): void {
    if (this.isCompleted) {
      return; // Don't update if already completed
    }

    const progress = this.calculateProgress();
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const progressBar = this.createProgressBar(progress);
    const duration = this.formatDuration(elapsed);

    let status = '';
    if (this.isUploading) {
      status = 'uploading';
    } else if (this.isPolling) {
      status = 'processing';
    } else {
      status = 'preparing';
    }

    const fileInfo =
      this.fileCount > 1
        ? `${this.fileName} (${this.fileCount} files)`
        : this.fileName;

    this.spinner.text = `Uploading ${fileInfo} ${progressBar} ${duration} (${status})`;
  }

  // Update display (for manual updates)
  updateDisplay(): void {
    this.updateTime(); // Use updateTime to ensure time is current
  }

  // Update progress display only (no progress bar)
  updateTimeOnly(): void {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const duration = this.formatDuration(elapsed);
    this.spinner.text = `Uploading ${this.fileName} ${duration}`;
  }

  // Complete progress
  complete(traceId?: string): void {
    if (this.isCompleted) {
      return; // Prevent double completion
    }
    const progressBar = this.createProgressBar(1);
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const duration = this.formatDuration(elapsed);

    this.spinner.succeed(`Upload completed ${progressBar} ${duration}`);
    this.isCompleted = true; // Mark as completed
  }

  // Fail progress
  fail(message: string, traceId?: string): void {
    if (this.isCompleted) {
      return; // Prevent calling fail after completion
    }
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const duration = this.formatDuration(elapsed);

    this.spinner.fail(`${message} ${duration}`);
    this.isCompleted = true; // Mark as completed (failed)
  }

  // Create visual progress bar
  private createProgressBar(progress: number, width: number = 20): string {
    const percentage = Math.min(progress, 1);
    const filledWidth = Math.round(width * percentage);
    const emptyWidth = width - filledWidth;

    const filled = '█'.repeat(filledWidth);
    const empty = '░'.repeat(emptyWidth);

    return `[${filled}${empty}] ${Math.round(percentage * 100)}%`;
  }

  // Format time duration
  private formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const remainingSeconds = seconds % 60;
      return `${hours}h ${minutes}m ${remainingSeconds}s`;
    }
  }
}

export default async function (filePath: string): Promise<{
  contentHash: string;
  previewHash?: string | null;
  shortUrl?: string;
} | null> {
  // check if the file is a directory
  const deviceId = getDeviceId();
  if (!deviceId) {
    throw new Error('Device ID not found');
  }

  let contentHash = '';
  let shortUrl = '';

  if (fs.statSync(filePath).isDirectory()) {
    const result = await uploadDirectory(filePath, deviceId);
    if (result) {
      contentHash = result.hash;
      shortUrl = result.shortUrl || '';
    }
  } else {
    const result = await uploadFile(filePath, deviceId);
    if (result) {
      contentHash = result.hash;
      shortUrl = result.shortUrl || '';
    }
  }

  // Only return result  contentHash is successfully obtained
  if (contentHash) {
    return {
      contentHash,
      previewHash: null,
      shortUrl,
    };
  }

  // Return null when upload fails
  return null;
}
