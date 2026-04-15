function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function readNumberEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const DEFAULT_PINME_WEB_URL = 'http://localhost:5173';

export const APP_CONFIG = {
  pinmeApiBase: trimTrailingSlash(process.env.PINME_API_BASE || ''),
  ipfsApiUrl: trimTrailingSlash(process.env.IPFS_API_URL || ''),
  carApiBase: trimTrailingSlash(
    process.env.CAR_API_BASE
      || process.env.IPFS_API_URL
      || 'http://ipfs-proxy.opena.chat/api/v3',
  ),
  pinmeWebUrl: trimTrailingSlash(
    process.env.PINME_WEB_URL || DEFAULT_PINME_WEB_URL,
  ),
  pinmeCheckDomainPath: process.env.PINME_CHECK_DOMAIN_PATH || '/check_domain',
  ipfsPreviewUrl: process.env.IPFS_PREVIEW_URL || '',
  secretKey: process.env.SECRET_KEY,
  pinmeProjectName: process.env.PINME_PROJECT_NAME?.trim(),
  upload: {
    maxRetries: readNumberEnv('MAX_RETRIES', 2),
    retryDelayMs: readNumberEnv('RETRY_DELAY_MS', 1000),
    timeoutMs: readNumberEnv('TIMEOUT_MS', 600000),
    maxPollTimeMs: readNumberEnv('MAX_POLL_TIME_MINUTES', 5) * 60 * 1000,
    pollIntervalMs: readNumberEnv('POLL_INTERVAL_SECONDS', 2) * 1000,
    pollTimeoutMs: readNumberEnv('POLL_TIMEOUT_SECONDS', 10) * 1000,
  },
};

export function getPinmeApiUrl(pathname: string): string {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${APP_CONFIG.pinmeApiBase}${normalizedPath}`;
}

export function getIpfsApiUrl(pathname: string): string {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${APP_CONFIG.ipfsApiUrl}${normalizedPath}`;
}

export function getCarApiUrl(pathname: string): string {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${APP_CONFIG.carApiBase}${normalizedPath}`;
}
