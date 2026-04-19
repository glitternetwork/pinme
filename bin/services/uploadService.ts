import CryptoJS from 'crypto-js';
import { getUid } from '../utils/getDeviceId';
import uploadToIpfsSplit from '../utils/uploadToIpfsSplit';
import { APP_CONFIG } from '../utils/config';

export interface UploadServiceOptions {
  importAsCar?: boolean;
  projectName?: string;
  uid?: string;
}

export interface UploadServiceResult {
  contentHash: string;
  shortUrl?: string;
  publicUrl: string;
  managementUrl: string;
}

function encryptHash(
  contentHash: string,
  key: string | undefined,
  uid?: string,
): string {
  if (!key) {
    return contentHash;
  }

  const combined = uid ? `${contentHash}-${uid}` : contentHash;
  const encrypted = CryptoJS.RC4.encrypt(combined, key).toString();
  return encrypted.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function formatShortUrl(shortUrl?: string): string | undefined {
  if (!shortUrl) {
    return undefined;
  }

  const normalized = shortUrl.trim();
  if (!normalized) {
    return undefined;
  }
  if (/^https?:\/\//.test(normalized)) {
    return normalized;
  }
  if (normalized.includes('.')) {
    return `https://${normalized}`;
  }
  return `https://${normalized}.pinit.eth.limo`;
}

export function resolveUploadUrls(
  contentHash: string,
  shortUrl?: string,
  uid?: string,
): { publicUrl: string; managementUrl: string } {
  const resolvedUid = uid?.trim() || getUid();
  const encryptedCID = encryptHash(contentHash, APP_CONFIG.secretKey, resolvedUid);
  const managementUrl = `${APP_CONFIG.ipfsPreviewUrl}${encryptedCID}`;
  const publicUrl = formatShortUrl(shortUrl) || managementUrl;

  return {
    publicUrl,
    managementUrl,
  };
}

export async function uploadPath(
  targetPath: string,
  options: UploadServiceOptions = {},
): Promise<UploadServiceResult> {
  const result = await uploadToIpfsSplit(targetPath, {
    importAsCar: options.importAsCar,
    projectName: options.projectName,
    uid: options.uid,
  });

  if (!result?.contentHash) {
    throw new Error('Upload failed: no content hash returned');
  }

  const urls = resolveUploadUrls(result.contentHash, result.shortUrl, options.uid);
  return {
    contentHash: result.contentHash,
    shortUrl: result.shortUrl,
    publicUrl: urls.publicUrl,
    managementUrl: urls.managementUrl,
  };
}
