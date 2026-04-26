import CryptoJS from 'crypto-js';
import { getUid } from '../utils/getDeviceId';
import uploadToIpfsSplit from '../utils/uploadToIpfsSplit';
import { APP_CONFIG } from '../utils/config';
import { getRootDomain } from '../utils/pinmeApi';
import { getAuthConfig } from '../utils/webLogin';

export interface UploadServiceOptions {
  importAsCar?: boolean;
  projectName?: string;
  uid?: string;
}

export interface UploadServiceResult {
  contentHash: string;
  shortUrl?: string;
  pinmeUrl?: string;
  dnsUrl?: string;
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

async function formatShortUrl(shortUrl?: string): Promise<string | undefined> {
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
  const rootDomain = await getRootDomain();
  return `https://${normalized}.${rootDomain}`;
}

async function formatPreferredUrl(
  value?: string,
  options?: { appendRootDomain?: boolean },
): Promise<string | undefined> {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  const withProtocol = /^https?:\/\//.test(normalized)
    ? normalized
    : `https://${normalized}`;

  try {
    const url = new URL(withProtocol);
    if (!options?.appendRootDomain || url.hostname.includes('.')) {
      return url.toString().replace(/\/$/, '');
    }

    const rootDomain = await getRootDomain();
    url.hostname = `${url.hostname}.${rootDomain}`;
    return url.toString().replace(/\/$/, '');
  } catch {
    return withProtocol.replace(/\/$/, '');
  }
}

export async function resolveUploadUrls(
  contentHash: string,
  urls?: {
    dnsUrl?: string;
    pinmeUrl?: string;
    shortUrl?: string;
  },
  projectName?: string,
  uid?: string,
): Promise<{ publicUrl: string; managementUrl: string }> {
  const resolvedUid = uid?.trim() || getUid();
  const encryptedCID = encryptHash(contentHash, APP_CONFIG.secretKey, resolvedUid);
  const normalizedProjectName = projectName?.trim();
  const managementUrl = normalizedProjectName
    ? `${APP_CONFIG.projectPeviewUrl}${normalizedProjectName}`
    : `${APP_CONFIG.ipfsPreviewUrl}${encryptedCID}`;
  const publicUrl =
    (await formatPreferredUrl(urls?.dnsUrl)) ||
    (await formatPreferredUrl(urls?.pinmeUrl, { appendRootDomain: true })) ||
    (await formatShortUrl(urls?.shortUrl)) ||
    managementUrl;

  return {
    publicUrl,
    managementUrl,
  };
}

export async function uploadPath(
  targetPath: string,
  options: UploadServiceOptions = {},
): Promise<UploadServiceResult> {
  const authConfig = getAuthConfig();
  if (!authConfig) {
    throw new Error('Please login first. Run: pinme login');
  }

  const result = await uploadToIpfsSplit(targetPath, {
    importAsCar: options.importAsCar,
    projectName: options.projectName,
    uid: options.uid || authConfig.address,
  });

  if (!result?.contentHash) {
    throw new Error('Upload failed: no content hash returned');
  }

  const urls = await resolveUploadUrls(
    result.contentHash,
    {
      dnsUrl: result.dnsUrl,
      pinmeUrl: result.pinmeUrl,
      shortUrl: result.shortUrl,
    },
    options.projectName,
    options.uid,
  );
  return {
    contentHash: result.contentHash,
    shortUrl: result.shortUrl,
    pinmeUrl: result.pinmeUrl,
    dnsUrl: result.dnsUrl,
    publicUrl: urls.publicUrl,
    managementUrl: urls.managementUrl,
  };
}
