import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import FormData from 'form-data';
import ora from 'ora';
import * as crypto from 'crypto';
import {
  checkFileSizeLimit,
  checkDirectorySizeLimit,
  formatSize,
} from './uploadLimits';
import { saveUploadHistory } from './history';
import { getUid } from './getDeviceId';
import { getAuthHeaders } from './webLogin';
import { APP_CONFIG } from './config';

// Configuration constants
const IPFS_API_URL = APP_CONFIG.ipfsApiUrl;
const MAX_RETRIES = APP_CONFIG.upload.maxRetries;
const RETRY_DELAY = APP_CONFIG.upload.retryDelayMs;
const TIMEOUT = APP_CONFIG.upload.timeoutMs;
const MAX_POLL_TIME = APP_CONFIG.upload.maxPollTimeMs;
const POLL_INTERVAL = APP_CONFIG.upload.pollIntervalMs;
const PROGRESS_UPDATE_INTERVAL = 200; // ms
const EXPECTED_UPLOAD_TIME = 60000; // 60 seconds
const MAX_PROGRESS = 0.9; // 90%

// Type definitions
interface ChunkSessionResponse {
  code: number;
  msg: string;
  data: {
    session_id: string;
    total_chunks: number;
    chunk_size: number;
  };
}

interface ChunkUploadResponse {
  code: number;
  msg: string;
  data: {
    chunk_index: number;
    chunk_size: number;
  };
}

interface ChunkCompleteResponse {
  code: number;
  msg: string;
  data: {
    trace_id: string;
  };
}

interface ChunkStatusResponse {
  code: number;
  msg: string;
  data: {
    is_ready: boolean;
    upload_rst: {
      Bytes: number;
      Name: string;
      Size: number;
      Hash?: string;
      ShortUrl?: string;
      pinme_domain?: string;
      dns_domain?: string;
    };
    domain?: string;
  };
}

interface UploadResult {
  hash: string;
  shortUrl?: string;
  pinmeUrl?: string;
  dnsUrl?: string;
}

interface UploadExecutionOptions {
  importAsCar?: boolean;
  projectName?: string;
  uid?: string;
}

function extractAxiosErrorMessage(error: any): string {
  const responseData = error?.response?.data;

  if (typeof responseData === 'string' && responseData.trim()) {
    return responseData.trim();
  }

  const message =
    responseData?.msg ||
    responseData?.message ||
    responseData?.error ||
    responseData?.data?.msg ||
    responseData?.data?.message ||
    responseData?.data?.error;

  if (typeof message === 'string' && message.trim()) {
    return message.trim();
  }

  return error?.message || 'Unknown network error';
}

function formatAxiosError(prefix: string, error: any): Error {
  const status = error?.response?.status;
  const message = extractAxiosErrorMessage(error);

  if (status) {
    return new Error(`${prefix}: ${message} (status: ${status})`);
  }

  return new Error(`${prefix}: ${message}`);
}

function logAxiosErrorDetails(prefix: string, error: any): void {
  const status = error?.response?.status;
  const responseData = error?.response?.data;

  console.error(`[pinme upload] ${prefix}`);
  console.error(`[pinme upload] status: ${status ?? 'unknown'}`);

  if (responseData === undefined) {
    console.error('[pinme upload] response: <empty>');
    return;
  }

  try {
    console.error(`[pinme upload] response: ${JSON.stringify(responseData)}`);
  } catch {
    console.error(`[pinme upload] response: ${String(responseData)}`);
  }
}

function isStorageLimitError(error: any): boolean {
  const message = extractAxiosErrorMessage(error).toLowerCase();
  return (
    message.includes('storage space limit') ||
    message.includes('space limit reached') ||
    message.includes('storage limit reached') ||
    message.includes('quota exceeded') ||
    message.includes('insufficient storage')
  );
}

// Enhanced progress bar with better UX
class StepProgressBar {
  private readonly spinner: ora.Ora;
  private readonly fileName: string;
  private readonly startTime: number;
  private currentStep: number = 0;
  private stepStartTime: number = 0;
  private progressInterval: NodeJS.Timeout | null = null;
  private isSimulatingProgress: boolean = false;
  private simulationStartTime: number = 0;

  constructor(fileName: string, isDirectory: boolean = false) {
    this.fileName = fileName;
    this.spinner = ora(`Preparing to upload ${fileName}...`).start();
    this.startTime = Date.now();
    this.stepStartTime = Date.now();

    this.startProgress();
  }

  startStep(stepIndex: number, stepName?: string): void {
    this.currentStep = stepIndex;
    this.stepStartTime = Date.now();
  }

  updateProgress(progress: number, total: number): void {
    // Chunk progress update handled by auto progress
  }

  completeStep(): void {
    // Step completed, let auto progress continue
  }

  // Start simulating progress to continue display after 90%
  startSimulatingProgress(): void {
    this.isSimulatingProgress = true;
    this.simulationStartTime = Date.now();
  }

  // Stop simulating progress
  stopSimulatingProgress(): void {
    this.isSimulatingProgress = false;
  }

  failStep(error: string): void {
    this.stopProgress();
    this.spinner.fail(`Upload failed: ${error}`);
  }

  complete(): void {
    this.stopProgress();
    const totalTime = Math.floor((Date.now() - this.startTime) / 1000);
    const progressBar = this.createProgressBar(1);
    this.spinner.succeed(
      `Upload completed ${progressBar} 100% (${totalTime}s)`,
    );
  }

  fail(error: string): void {
    this.stopProgress();
    const totalTime = Math.floor((Date.now() - this.startTime) / 1000);
    this.spinner.fail(`Upload failed: ${error} (${totalTime}s)`);
  }

  private startProgress(): void {
    this.progressInterval = setInterval(() => {
      const elapsed = Date.now() - this.startTime;
      let progress: number;

      if (this.isSimulatingProgress) {
        // Simulate progress after 90%, gradually grow from 90% to 99%
        const simulationElapsed = Date.now() - this.simulationStartTime;
        const simulationProgress = Math.min(simulationElapsed / 60000, 1); // From 90% to 99% within 60 seconds
        progress = 0.9 + simulationProgress * 0.09; // 90% + 9% = 99%
      } else {
        progress = this.calculateProgress(elapsed);
      }

      const duration = this.formatDuration(Math.floor(elapsed / 1000));
      const progressBar = this.createProgressBar(progress);
      this.spinner.text = `Uploading ${
        this.fileName
      }... ${progressBar} ${Math.round(progress * 100)}% (${duration})`;
    }, PROGRESS_UPDATE_INTERVAL);
  }

  private stopProgress(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  private calculateProgress(elapsed: number): number {
    return Math.min(
      (elapsed / EXPECTED_UPLOAD_TIME) * MAX_PROGRESS,
      MAX_PROGRESS,
    );
  }

  private createProgressBar(progress: number, width: number = 20): string {
    const percentage = Math.min(progress, 1);
    const filledWidth = Math.round(width * percentage);
    const emptyWidth = width - filledWidth;

    return `[${'█'.repeat(filledWidth)}${'░'.repeat(emptyWidth)}]`;
  }

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

// Utility functions
async function calculateMD5(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);

    stream.on('data', hash.update.bind(hash));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function compressDirectory(sourcePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Use system temp directory instead of project directory to avoid recursive inclusion
    const tempDir = require('os').tmpdir();
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const outputPath = path.join(
      tempDir,
      `pinme_${path.basename(sourcePath)}_${Date.now()}.zip`,
    );
    const output = fs.createWriteStream(outputPath);

    const zlib = require('zlib');
    const gzip = zlib.createGzip({ level: 9 });

    output.on('close', () => resolve(outputPath));
    gzip.on('error', reject);
    gzip.pipe(output);

    const stats = fs.statSync(sourcePath);
    if (stats.isDirectory()) {
      const archive = require('archiver');
      const archiveStream = archive('zip', { zlib: { level: 9 } });

      archiveStream.on('error', reject);
      archiveStream.pipe(output);
      archiveStream.directory(sourcePath, false);
      archiveStream.finalize();
    } else {
      const fileStream = fs.createReadStream(sourcePath);
      fileStream.pipe(gzip);
    }
  });
}

// API functions with better error handling
async function initChunkSession(
  filePath: string,
  deviceId: string,
  options: UploadExecutionOptions = {},
  isDirectory: boolean = false,
): Promise<ChunkSessionResponse['data']> {
  const stats = fs.statSync(filePath);
  const fileName = path.basename(filePath);
  const fileSize = stats.size;
  const md5 = await calculateMD5(filePath);

  try {
    const projectName = options.projectName?.trim();
    let authHeaders: Record<string, string> = {};
    const requestBody: any = {
      file_name: fileName,
      file_size: fileSize,
      md5: md5,
      is_directory: isDirectory,
      uid: deviceId,
    };

    if (projectName) {
      requestBody.project_name = projectName;
      authHeaders = getAuthHeaders();
    }

    const response = await axios.post<ChunkSessionResponse>(
      `${IPFS_API_URL}/chunk/init`,
      requestBody,
      {
        timeout: TIMEOUT,
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
      },
    );

    const { code, msg, data } = response.data;
    if (code === 200 && data) {
      return data;
    }
    throw new Error(`Session initialization failed: ${msg} (code: ${code})`);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logAxiosErrorDetails('chunk/init failed', error);
      throw formatAxiosError('Session initialization failed', error);
    }
    throw error;
  }
}

async function uploadChunkWithAbort(
  sessionId: string,
  chunkIndex: number,
  chunkData: Buffer,
  deviceId: string,
  signal: AbortSignal,
  retryCount: number = 0,
): Promise<ChunkUploadResponse['data']> {
  try {
    if (signal.aborted) {
      throw new Error('Request cancelled');
    }

    const form = new FormData();
    form.append('session_id', sessionId);
    form.append('chunk_index', chunkIndex.toString());
    form.append('uid', deviceId);
    form.append('chunk', chunkData, {
      filename: `chunk_${chunkIndex}`,
      contentType: 'application/octet-stream',
    });

    const response = await axios.post<ChunkUploadResponse>(
      `${IPFS_API_URL}/chunk/upload`,
      form,
      {
        headers: { ...form.getHeaders() },
        timeout: TIMEOUT,
        signal,
      },
    );

    const { code, msg, data } = response.data;
    if (code === 200 && data) {
      return data;
    }
    throw new Error(`Chunk upload failed: ${msg} (code: ${code})`);
  } catch (error: any) {
    if (error.name === 'CanceledError' || signal.aborted) {
      throw new Error('Request cancelled');
    }

    if (axios.isAxiosError(error) && isStorageLimitError(error)) {
      logAxiosErrorDetails('chunk/upload failed', error);
      throw formatAxiosError('Chunk upload failed', error);
    }

    if (retryCount < MAX_RETRIES) {
      await delayWithAbortCheck(RETRY_DELAY, signal);
      return uploadChunkWithAbort(
        sessionId,
        chunkIndex,
        chunkData,
        deviceId,
        signal,
        retryCount + 1,
      );
    }

    if (axios.isAxiosError(error)) {
      logAxiosErrorDetails('chunk/upload failed', error);
      throw formatAxiosError('Chunk upload failed', error);
    }

    throw new Error(
      `Chunk ${chunkIndex + 1} upload failed after ${MAX_RETRIES} retries: ${
        error.message
      }`,
    );
  }
}

async function delayWithAbortCheck(
  delay: number,
  signal: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      if (signal.aborted) {
        reject(new Error('Request cancelled'));
      } else {
        resolve();
      }
    }, delay);

    if (signal.aborted) {
      clearTimeout(timeoutId);
      reject(new Error('Request cancelled'));
      return;
    }

    const checkInterval = setInterval(() => {
      if (signal.aborted) {
        clearTimeout(timeoutId);
        clearInterval(checkInterval);
        reject(new Error('Request cancelled'));
      }
    }, 50);
  });
}

async function uploadFileChunks(
  filePath: string,
  sessionId: string,
  totalChunks: number,
  chunkSize: number,
  deviceId: string,
  progressBar: StepProgressBar,
): Promise<void> {
  const fileData = fs.readFileSync(filePath);
  const abortController = new AbortController();
  let completedCount = 0;
  let hasFatalError = false;
  let fatalError: string | null = null;

  const uploadTasks = Array.from({ length: totalChunks }, (_, chunkIndex) => {
    const start = chunkIndex * chunkSize;
    const end = Math.min(start + chunkSize, fileData.length);
    const chunkData = fileData.slice(start, end);

    return async () => {
      if (abortController.signal.aborted) return;

      try {
        await uploadChunkWithAbort(
          sessionId,
          chunkIndex,
          chunkData,
          deviceId,
          abortController.signal,
        );

        if (abortController.signal.aborted) return;

        completedCount++;
        progressBar.updateProgress(completedCount, totalChunks);
      } catch (error: any) {
        if (error.name === 'AbortError' || abortController.signal.aborted) {
          return;
        }

        hasFatalError = true;
        fatalError = `Chunk ${chunkIndex + 1}/${totalChunks} upload failed: ${
          error.message
        }`;
        abortController.abort();
        throw new Error(fatalError);
      }
    };
  });

  try {
    const results = await Promise.allSettled(uploadTasks.map((task) => task()));
    const failedResults = results.filter(
      (result) => result.status === 'rejected',
    );

    if (failedResults.length > 0) {
      const firstFailure = failedResults[0] as PromiseRejectedResult;
      throw new Error(
        firstFailure.reason.message || 'Error occurred during upload',
      );
    }

    if (hasFatalError) {
      throw new Error(fatalError || 'Unknown error occurred during upload');
    }
  } catch (error: any) {
    throw fatalError ? new Error(fatalError) : error;
  }
}

async function completeChunkUpload(
  sessionId: string,
  deviceId: string,
  options: UploadExecutionOptions = {},
): Promise<string> {
  try {
    const requestBody: any = { session_id: sessionId, uid: deviceId };
    const projectName = options.projectName?.trim();
    let authHeaders: Record<string, string> = {};
    if (options.importAsCar) {
      requestBody.import_as_car = true;
    }
    if (projectName) {
      requestBody.project_name = projectName;
      authHeaders = getAuthHeaders();
    }
    const response = await axios.post<ChunkCompleteResponse>(
      `${IPFS_API_URL}/chunk/complete`,
      requestBody,
      {
        timeout: TIMEOUT,
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
      },
    );

    const { code, msg, data } = response.data;
    if (code === 200 && data) {
      return data.trace_id;
    }
    throw new Error(`Complete upload failed: ${msg} (code: ${code})`);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logAxiosErrorDetails('chunk/complete failed', error);
      throw formatAxiosError('Complete upload failed', error);
    }
    throw error;
  }
}

async function getChunkStatus(
  sessionId: string,
  deviceId: string,
  options: UploadExecutionOptions = {},
): Promise<ChunkStatusResponse['data']> {
  try {
    const projectName = options.projectName?.trim();
    const queryParams = new URLSearchParams({
      trace_id: sessionId,
      uid: deviceId,
    });
    if (projectName) {
      queryParams.append('project_name', projectName);
    }

    const response = await axios.get<ChunkStatusResponse>(
      `${IPFS_API_URL}/up_status?${queryParams.toString()}`,
      {
        timeout: TIMEOUT,
        headers: { 'Content-Type': 'application/json' },
      },
    );

    const { code, msg, data } = response.data;
    if (code === 200) {
      return data;
    }
    throw new Error(`Server returned error: ${msg} (code: ${code})`);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      logAxiosErrorDetails('up_status failed', error);
      throw formatAxiosError('Upload status check failed', error);
    }
    throw error;
  }
}

async function monitorChunkProgress(
  traceId: string,
  deviceId: string,
  options: UploadExecutionOptions = {},
  progressBar?: StepProgressBar,
): Promise<UploadResult | null> {
  let consecutiveErrors = 0;
  const startTime = Date.now();

  // Start simulating progress
  if (progressBar) {
    progressBar.startSimulatingProgress();
  }

  try {
    while (Date.now() - startTime < MAX_POLL_TIME) {
      try {
        const status = await getChunkStatus(traceId, deviceId, options);
        consecutiveErrors = 0;

        if (status.is_ready && status.upload_rst.Hash) {
          // Stop simulating progress
          if (progressBar) {
            progressBar.stopSimulatingProgress();
          }
          const shortUrl = status.upload_rst.ShortUrl;
          const pinmeDomain = status.upload_rst.pinme_domain;
          const dnsDomain = status.upload_rst.dns_domain;
          return {
            hash: status.upload_rst.Hash,
            shortUrl,
            pinmeUrl: pinmeDomain,
            dnsUrl: dnsDomain,
          };
        }
      } catch (error: any) {
        consecutiveErrors++;
        if (consecutiveErrors > 10) {
          throw new Error(`Polling failed: ${error.message}`);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
    }

    const maxPollTimeMinutes = Math.floor(MAX_POLL_TIME / (60 * 1000));
    throw new Error(`Polling timeout after ${maxPollTimeMinutes} minutes`);
  } finally {
    // Ensure simulating progress is stopped
    if (progressBar) {
      progressBar.stopSimulatingProgress();
    }
  }
}

// Main upload functions
async function uploadDirectoryInChunks(
  directoryPath: string,
  deviceId: string,
  options: UploadExecutionOptions = {},
): Promise<UploadResult | null> {
  const sizeCheck = checkDirectorySizeLimit(directoryPath);
  if (sizeCheck.exceeds) {
    throw new Error(
      `Directory ${directoryPath} exceeds size limit ${formatSize(
        sizeCheck.limit,
      )} (size: ${formatSize(sizeCheck.size)})`,
    );
  }

  const progressBar = new StepProgressBar(path.basename(directoryPath), true);

  try {
    progressBar.startStep(0, 'Preparing compression');
    const compressedPath = await compressDirectory(directoryPath);
    progressBar.completeStep();

    progressBar.startStep(1, 'Initializing session');
    const sessionInfo = await initChunkSession(
      compressedPath,
      deviceId,
      options,
      true,
    );
    progressBar.completeStep();

    progressBar.startStep(2, 'Chunk upload');
    await uploadFileChunks(
      compressedPath,
      sessionInfo.session_id,
      sessionInfo.total_chunks,
      sessionInfo.chunk_size,
      deviceId,
      progressBar,
    );
    progressBar.completeStep();

    progressBar.startStep(3, 'Completing upload');
    const traceId = await completeChunkUpload(
      sessionInfo.session_id,
      deviceId,
      options,
    );
    progressBar.completeStep();

    progressBar.startStep(4, 'Waiting for processing');
    const result = await monitorChunkProgress(
      traceId,
      deviceId,
      options,
      progressBar,
    );
    progressBar.completeStep();

    // Cleanup
    try {
      fs.unlinkSync(compressedPath);
    } catch (error) {
      // Ignore cleanup errors
    }

    // Save history
    const uploadData = {
      path: directoryPath,
      filename: path.basename(directoryPath),
      contentHash: result?.hash || 'unknown',
      size: sizeCheck.size,
      fileCount: 0,
      isDirectory: true,
      shortUrl: result?.shortUrl || null,
      pinmeUrl: result?.pinmeUrl || null,
      dnsUrl: result?.dnsUrl || null,
    };
    saveUploadHistory(uploadData);

    if (!result?.hash) {
      throw new Error('Server did not return valid hash value');
    }

    progressBar.complete();
    return result;
  } catch (error: any) {
    progressBar.fail(error.message);
    throw error;
  }
}

async function uploadFileInChunks(
  filePath: string,
  deviceId: string,
  options: UploadExecutionOptions = {},
): Promise<UploadResult | null> {
  const sizeCheck = checkFileSizeLimit(filePath);
  if (sizeCheck.exceeds) {
    throw new Error(
      `File ${filePath} exceeds size limit ${formatSize(
        sizeCheck.limit,
      )} (size: ${formatSize(sizeCheck.size)})`,
    );
  }

  const fileName = path.basename(filePath);
  const progressBar = new StepProgressBar(fileName, false);

  try {
    progressBar.startStep(0, 'Initializing session');
    const sessionInfo = await initChunkSession(
      filePath,
      deviceId,
      options,
      false,
    );
    progressBar.completeStep();

    progressBar.startStep(1, 'Chunk upload');
    await uploadFileChunks(
      filePath,
      sessionInfo.session_id,
      sessionInfo.total_chunks,
      sessionInfo.chunk_size,
      deviceId,
      progressBar,
    );
    progressBar.completeStep();

    progressBar.startStep(2, 'Completing upload');
    const traceId = await completeChunkUpload(
      sessionInfo.session_id,
      deviceId,
      options,
    );
    progressBar.completeStep();

    progressBar.startStep(3, 'Waiting for processing');
    const result = await monitorChunkProgress(
      traceId,
      deviceId,
      options,
      progressBar,
    );
    progressBar.completeStep();

    // Save history
    const uploadData = {
      path: filePath,
      filename: fileName,
      contentHash: result?.hash || 'unknown',
      previewHash: null,
      size: sizeCheck.size,
      fileCount: 1,
      isDirectory: false,
      shortUrl: result?.shortUrl || null,
      pinmeUrl: result?.pinmeUrl || null,
      dnsUrl: result?.dnsUrl || null,
    };
    saveUploadHistory(uploadData);

    if (!result?.hash) {
      throw new Error('Server did not return valid hash value');
    }

    progressBar.complete();
    return result;
  } catch (error: any) {
    progressBar.fail(error.message);
    throw error;
  }
}

// Main export function
export default async function (
  filePath: string,
  options: UploadExecutionOptions = {},
): Promise<{
  contentHash: string;
  previewHash?: string | null;
  shortUrl?: string;
  pinmeUrl?: string;
  dnsUrl?: string;
} | null> {
  const uid = options.uid?.trim() || getUid();
  if (!uid) {
    throw new Error('Upload uid not found');
  }

  try {
    const isDirectory = fs.statSync(filePath).isDirectory();
    const result = isDirectory
      ? await uploadDirectoryInChunks(filePath, uid, options)
      : await uploadFileInChunks(filePath, uid, options);

    if (result?.hash) {
      return {
        contentHash: result.hash,
        previewHash: null,
        shortUrl: result.shortUrl,
        pinmeUrl: result.pinmeUrl,
        dnsUrl: result.dnsUrl,
      };
    }
    throw new Error('Upload failed: no hash returned');
  } catch (error: any) {
    throw error;
  }
}
