import fs from 'fs-extra';
import os from 'os';
import path from 'path';

const CONFIG_DIR = path.join(os.homedir(), '.pinme');
const AUTH_FILE = path.join(CONFIG_DIR, 'auth.json');

export interface AuthConfig {
  address: string;
  token: string;
}

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function parseCombinedToken(combined: string): AuthConfig {
  // combined format: "<address>-<jwt>"
  // Split only at the first '-' to preserve '-' inside JWT if any.
  const firstDash = combined.indexOf('-');
  if (firstDash <= 0 || firstDash === combined.length - 1) {
    throw new Error('Invalid token format. Expected "<address>-<jwt>".');
  }
  const address = combined.slice(0, firstDash).trim();
  const token = combined.slice(firstDash + 1).trim();
  if (!address || !token) {
    throw new Error('Invalid token content. Address or token is empty.');
  }
  return { address, token };
}

export function setAuthToken(combined: string): AuthConfig {
  ensureConfigDir();
  const auth = parseCombinedToken(combined);
  fs.writeJsonSync(AUTH_FILE, auth, { spaces: 2 });
  return auth;
}

export function getAuthConfig(): AuthConfig | null {
  try {
    if (!fs.existsSync(AUTH_FILE)) return null;
    const data = fs.readJsonSync(AUTH_FILE) as AuthConfig;
    if (!data?.address || !data?.token) return null;
    return data;
  } catch {
    return null;
  }
}

export function getAuthHeaders(): Record<string, string> {
  const conf = getAuthConfig();
  if (!conf) {
    throw new Error('Auth not set. Run: pinme set-appkey <AppKey>');
  }
  return {
    'token-address': conf.address,
    'authentication-tokens': conf.token,
  };
}


