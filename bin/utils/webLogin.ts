import crypto from 'crypto';
import http from 'http';
import { URL } from 'url';
import chalk from 'chalk';
import { exec } from 'child_process';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';

// Cross-platform browser opener
function openBrowser(url: string): void {
  const platform = process.platform;
  let command: string;

  if (platform === 'darwin') {
    command = `open "${url}"`;
  } else if (platform === 'win32') {
    command = `start "" "${url}"`;
  } else {
    // linux
    command = `xdg-open "${url}"`;
  }

  exec(command, (err) => {
    if (err) {
      console.log(chalk.yellow(`Unable to open browser automatically. Please visit manually: ${url}`));
    }
  });
}

const CONFIG_DIR = path.join(os.homedir(), '.pinme');
const AUTH_FILE = path.join(CONFIG_DIR, 'auth.json');

export interface AuthConfig {
  address: string;
  token: string;
  expires_at?: number;
  user_id?: string;
  email?: string;
}

export interface LoginOptions {
  apiBaseUrl?: string;
  webBaseUrl?: string;
  callbackPort?: number;
  callbackPath?: string;
}

const DEFAULT_OPTIONS: Required<LoginOptions> = {
  apiBaseUrl: process.env.PINME_API_BASE || 'http://ipfs-proxy.opena.chat/api/v4',
  webBaseUrl: process.env.PINME_WEB_URL || 'http://localhost:5173',
  callbackPort: 3000,
  callbackPath: '/cli/callback',
};

export class WebLoginManager {
  private config: Required<LoginOptions>;
  private server: http.Server | null = null;
  private resolvePromise: ((value: string) => void) | null = null;
  private rejectPromise: ((reason: Error) => void) | null = null;
  private loginToken: string = '';

  constructor(options: LoginOptions = {}) {
    this.config = { ...DEFAULT_OPTIONS, ...options };
  }

  async login(): Promise<AuthConfig> {
    console.log(chalk.blue('Starting login flow...\n'));

    // 1. Generate temporary login token
    this.loginToken = this.generateLoginToken();

    // 2. Start local server to wait for callback
    console.log(chalk.blue('Starting local callback server...'));
    await this.startCallbackServer();

    try {
      // 3. Build login URL and open browser
      const loginUrl = this.buildLoginUrl();
      console.log(chalk.blue('Opening browser...'));
      console.log(chalk.white('If browser does not open automatically, please visit manually:'));
      console.log(chalk.cyan(`   ${loginUrl}\n`));

      openBrowser(loginUrl);

      console.log(chalk.yellow('Please complete login in browser...'));
      console.log(chalk.gray('Browser will close automatically after successful login.\n'));

      // 4. Wait for user to complete login
      const authToken = await this.waitForCallback();

      // 5. Parse token
      const authConfig = this.parseAuthToken(authToken);

      // 6. Save auth config
      this.saveAuthConfig(authConfig);

      console.log(chalk.green('\nLogin successful!'));
      if (authConfig.email) {
        console.log(chalk.green(`Welcome, ${authConfig.email}`));
      }
      console.log(chalk.gray(`Address: ${authConfig.address}`));

      return authConfig;
    } catch (error: any) {
      console.error(chalk.red(`\nLogin failed: ${error.message}`));
      throw error;
    } finally {
      this.closeServer();
    }
  }

  private generateLoginToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private async startCallbackServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        try {
          const url = new URL(req.url || '', `http://localhost:${this.config.callbackPort}`);

          if (url.pathname === this.config.callbackPath) {
            const authToken = url.searchParams.get('token');
            const error = url.searchParams.get('error');
            const loginToken = url.searchParams.get('login_token');

            if (error) {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(this.getErrorHtml(error));
              if (this.rejectPromise) {
                this.rejectPromise(new Error(error));
              }
              return;
            }

            if (!authToken) {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(this.getErrorHtml('Auth token not received'));
              if (this.rejectPromise) {
                this.rejectPromise(new Error('Auth token not received'));
              }
              return;
            }

            // Verify loginToken
            if (loginToken !== this.loginToken) {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              res.end(this.getErrorHtml('Login token invalid or expired'));
              if (this.rejectPromise) {
                this.rejectPromise(new Error('Login token invalid or expired'));
              }
              return;
            }

            // Return success page
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(this.getSuccessHtml());

            // Pass token
            if (this.resolvePromise) {
              this.resolvePromise(authToken);
            }
          } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
          }
        } catch (err: any) {
          console.error('Callback error:', err);
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
        }
      });

      this.server.on('error', (err) => {
        reject(err);
      });

      this.server.listen(this.config.callbackPort, '127.0.0.1', () => {
        console.log(chalk.gray(`Local server: http://localhost:${this.config.callbackPort}`));
        resolve();
      });

      // Set timeout (10 minutes)
      setTimeout(() => {
        if (this.rejectPromise) {
          this.rejectPromise(new Error('Login timeout, please try again'));
        }
        this.closeServer();
      }, 10 * 60 * 1000);
    });
  }

  private buildLoginUrl(): string {
    const callbackUrl = `http://localhost:${this.config.callbackPort}${this.config.callbackPath}`;
    const url = `${this.config.webBaseUrl}/#/cli-login?` +
      `login_token=${this.loginToken}&` +
      `callback_url=${encodeURIComponent(callbackUrl)}`;
    return url;
  }

  private waitForCallback(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
    });
  }

  private parseAuthToken(authToken: string): AuthConfig {
    // authToken format: "<address>-<jwt>"
    const firstDash = authToken.indexOf('-');
    if (firstDash <= 0 || firstDash === authToken.length - 1) {
      throw new Error('Invalid token format');
    }
    const address = authToken.slice(0, firstDash).trim();
    const token = authToken.slice(firstDash + 1).trim();

    if (!address || !token) {
      throw new Error('Token parsing failed: address or token is empty');
    }

    return { address, token };
  }

  private saveAuthConfig(config: AuthConfig): void {
    fs.ensureDirSync(CONFIG_DIR);
    fs.writeJsonSync(AUTH_FILE, config, { spaces: 2 });
    // Set file permissions (only current user can read)
    fs.chmodSync(AUTH_FILE, 0o600);
  }

  private closeServer(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  // HTML templates
  private getSuccessHtml(): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Login Success - PinMe</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .container {
      background: white;
      padding: 3rem;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      text-align: center;
      max-width: 400px;
    }
    .success-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
    h1 {
      color: #1f2937;
      margin: 0 0 1rem 0;
    }
    p {
      color: #6b7280;
      margin: 0 0 2rem 0;
    }
    .close-btn {
      background: #3b82f6;
      color: white;
      border: none;
      padding: 0.75rem 2rem;
      border-radius: 6px;
      font-size: 1rem;
      cursor: pointer;
      transition: background 0.2s;
    }
    .close-btn:hover {
      background: #2563eb;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="success-icon">✅</div>
    <h1>Login Successful!</h1>
    <p>You have successfully logged in to PinMe CLI.</p>
    <p>You can close this window and return to the command line.</p>
    <button id="closeBtn" class="close-btn">Close Window</button>
    <p id="message" style="color: #6b7280; margin-top: 1rem;"></p>
  </div>
  <script>
    // For redirected pages, show message instead of auto-close
    document.addEventListener('DOMContentLoaded', function() {
      document.getElementById('closeBtn').addEventListener('click', function() {
        // Try to close, fallback to showing message
        try {
          window.close();
        } catch (e) {
          document.getElementById('message').textContent = 'You can close this window manually.';
        }
      });
    });
  </script>
</body>
</html>`;
  }

  private getErrorHtml(error: string): string {
    const encodedError = encodeURIComponent(error);
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Login Failed - PinMe</title>
  <style>
    body { font-family: sans-serif; padding: 2rem; text-align: center; background: #f3f4f6; }
    .container { background: white; padding: 2rem; border-radius: 12px; max-width: 400px; margin: 0 auto; }
    .error { color: #dc2626; font-size: 1.25rem; margin: 1rem 0; }
    button { padding: 0.5rem 1rem; cursor: pointer; background: #3b82f6; color: white; border: none; border-radius: 6px; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Login Failed</h2>
    <div class="error">${error}</div>
    <button onclick="window.close()">Close</button>
  </div>
</body>
</html>`;
  }
}

// Export singleton
export const webLoginManager = new WebLoginManager();

// Legacy interface
export function setAuthToken(combined: string): AuthConfig {
  const firstDash = combined.indexOf('-');
  if (firstDash <= 0 || firstDash === combined.length - 1) {
    throw new Error('Invalid token format. Expected "<address>-<jwt>".');
  }
  const address = combined.slice(0, firstDash).trim();
  const token = combined.slice(firstDash + 1).trim();
  if (!address || !token) {
    throw new Error('Invalid token content. Address or token is empty.');
  }
  const config: AuthConfig = { address, token };
  fs.ensureDirSync(CONFIG_DIR);
  fs.writeJsonSync(AUTH_FILE, config, { spaces: 2 });
  return config;
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

export function clearAuthToken(): void {
  try {
    if (fs.existsSync(AUTH_FILE)) {
      fs.removeSync(AUTH_FILE);
    }
  } catch (error) {
    console.error(`Failed to clear auth token: ${error}`);
  }
}

export function getAuthHeaders(): Record<string, string> {
  const conf = getAuthConfig();
  if (!conf) {
    throw new Error('Auth not set. Run: pinme login');
  }
  return {
    'token-address': conf.address,
    'authentication-tokens': conf.token,
  };
}

export async function login(): Promise<AuthConfig> {
  return webLoginManager.login();
}

export async function logout(): Promise<void> {
  clearAuthToken();
  console.log(chalk.green('Logged out successfully'));
}
