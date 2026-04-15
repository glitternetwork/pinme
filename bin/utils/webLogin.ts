import crypto from 'crypto';
import http from 'http';
import { URL } from 'url';
import chalk from 'chalk';
import { exec } from 'child_process';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { APP_CONFIG } from './config';

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
  apiBaseUrl: APP_CONFIG.pinmeApiBase,
  webBaseUrl: APP_CONFIG.pinmeWebUrl,
  callbackPort: 34567,
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
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: #000;
      overflow: hidden;
    }
    .bg {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: 
        radial-gradient(ellipse at 20% 80%, rgba(120, 0, 255, 0.3) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 20%, rgba(0, 200, 255, 0.3) 0%, transparent 50%),
        radial-gradient(ellipse at 50% 50%, rgba(255, 0, 150, 0.15) 0%, transparent 60%);
      animation: bgPulse 6s ease-in-out infinite;
    }
    @keyframes bgPulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.8; transform: scale(1.05); }
    }
    .grid {
      position: fixed;
      top: 0;
      left: 0;
      width: 200%;
      height: 200%;
      background-image: 
        linear-gradient(rgba(0, 200, 255, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0, 200, 255, 0.03) 1px, transparent 1px);
      background-size: 50px 50px;
      transform: perspective(500px) rotateX(60deg) translateY(-50%) translateZ(-200px);
      animation: gridMove 20s linear infinite;
    }
    @keyframes gridMove {
      0% { transform: perspective(500px) rotateX(60deg) translateY(0) translateZ(-200px); }
      100% { transform: perspective(500px) rotateX(60deg) translateY(50px) translateZ(-200px); }
    }
    .container {
      position: relative;
      z-index: 10;
      background: linear-gradient(135deg, rgba(20, 20, 40, 0.9) 0%, rgba(10, 10, 30, 0.95) 100%);
      padding: 3.5rem 4rem;
      border-radius: 32px;
      box-shadow: 
        0 0 60px rgba(0, 200, 255, 0.15),
        0 25px 50px rgba(0, 0, 0, 0.5),
        inset 0 1px 0 rgba(255, 255, 255, 0.1),
        inset 0 -1px 0 rgba(0, 200, 255, 0.1);
      text-align: center;
      border: 1px solid rgba(0, 200, 255, 0.2);
      max-width: 440px;
      backdrop-filter: blur(30px);
    }
    .container::before {
      content: '';
      position: absolute;
      top: -1px;
      left: -1px;
      right: -1px;
      bottom: -1px;
      border-radius: 32px;
      background: linear-gradient(135deg, rgba(0, 200, 255, 0.5), rgba(255, 0, 150, 0.5), rgba(120, 0, 255, 0.5));
      z-index: -1;
      opacity: 0.5;
      animation: borderGlow 3s ease-in-out infinite;
    }
    @keyframes borderGlow {
      0%, 100% { opacity: 0.3; }
      50% { opacity: 0.7; }
    }
    .success-icon {
      font-size: 5rem;
      margin-bottom: 1.5rem;
      animation: bounceIn 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55);
      filter: drop-shadow(0 0 20px rgba(0, 200, 255, 0.5));
    }
    @keyframes bounceIn {
      0% { transform: scale(0); opacity: 0; }
      50% { transform: scale(1.2); }
      100% { transform: scale(1); opacity: 1; }
    }
    h1 {
      color: #fff;
      font-size: 2.2rem;
      font-weight: 700;
      margin: 0 0 0.75rem 0;
      background: linear-gradient(90deg, #fff, #00d4ff);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    p {
      color: rgba(255, 255, 255, 0.6);
      font-size: 1.1rem;
      margin: 0 0 2rem 0;
      line-height: 1.6;
    }
    .highlight { color: #00d4ff; font-weight: 600; }
    .sparkle {
      position: absolute;
      width: 4px;
      height: 4px;
      background: #00d4ff;
      border-radius: 50%;
      animation: sparkle 2s ease-in-out infinite;
    }
    .sparkle:nth-child(1) { top: 20%; left: 10%; animation-delay: 0s; }
    .sparkle:nth-child(2) { top: 30%; right: 15%; animation-delay: 0.5s; }
    .sparkle:nth-child(3) { bottom: 25%; left: 20%; animation-delay: 1s; }
    .sparkle:nth-child(4) { bottom: 35%; right: 10%; animation-delay: 1.5s; }
    @keyframes sparkle {
      0%, 100% { opacity: 0; transform: scale(0); }
      50% { opacity: 1; transform: scale(1); }
    }
  </style>
</head>
<body>
  <div class="bg"></div>
  <div class="grid"></div>
  <div class="container">
    <div class="sparkle"></div>
    <div class="sparkle"></div>
    <div class="sparkle"></div>
    <div class="sparkle"></div>
    <div class="success-icon">🎉</div>
    <h1>Welcome to PinMe</h1>
    <p>You are now logged in! <span class="highlight">🚀</span><br>Return to your terminal to continue.</p>
  </div>
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
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: #000;
      overflow: hidden;
    }
    .bg {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: 
        radial-gradient(ellipse at 20% 80%, rgba(255, 50, 50, 0.2) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 20%, rgba(255, 100, 50, 0.2) 0%, transparent 50%),
        radial-gradient(ellipse at 50% 50%, rgba(100, 0, 50, 0.15) 0%, transparent 60%);
      animation: bgPulse 6s ease-in-out infinite;
    }
    @keyframes bgPulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.8; transform: scale(1.05); }
    }
    .grid {
      position: fixed;
      top: 0;
      left: 0;
      width: 200%;
      height: 200%;
      background-image: 
        linear-gradient(rgba(255, 80, 80, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 80, 80, 0.03) 1px, transparent 1px);
      background-size: 50px 50px;
      transform: perspective(500px) rotateX(60deg) translateY(-50%) translateZ(-200px);
      animation: gridMove 20s linear infinite;
    }
    @keyframes gridMove {
      0% { transform: perspective(500px) rotateX(60deg) translateY(0) translateZ(-200px); }
      100% { transform: perspective(500px) rotateX(60deg) translateY(50px) translateZ(-200px); }
    }
    .container {
      position: relative;
      z-index: 10;
      background: linear-gradient(135deg, rgba(40, 20, 20, 0.9) 0%, rgba(30, 10, 10, 0.95) 100%);
      padding: 3.5rem 4rem;
      border-radius: 32px;
      box-shadow: 
        0 0 60px rgba(255, 50, 50, 0.15),
        0 25px 50px rgba(0, 0, 0, 0.5),
        inset 0 1px 0 rgba(255, 255, 255, 0.1),
        inset 0 -1px 0 rgba(255, 50, 50, 0.1);
      text-align: center;
      border: 1px solid rgba(255, 50, 50, 0.2);
      max-width: 440px;
      backdrop-filter: blur(30px);
    }
    .container::before {
      content: '';
      position: absolute;
      top: -1px;
      left: -1px;
      right: -1px;
      bottom: -1px;
      border-radius: 32px;
      background: linear-gradient(135deg, rgba(255, 50, 50, 0.5), rgba(255, 150, 50, 0.5), rgba(150, 0, 50, 0.5));
      z-index: -1;
      opacity: 0.5;
      animation: borderGlow 3s ease-in-out infinite;
    }
    @keyframes borderGlow {
      0%, 100% { opacity: 0.3; }
      50% { opacity: 0.7; }
    }
    .error-icon {
      font-size: 5rem;
      margin-bottom: 1.5rem;
      animation: shake 0.5s ease-in-out;
      filter: drop-shadow(0 0 20px rgba(255, 50, 50, 0.5));
    }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      20% { transform: translateX(-10px) rotate(-5deg); }
      40% { transform: translateX(10px) rotate(5deg); }
      60% { transform: translateX(-10px) rotate(-5deg); }
      80% { transform: translateX(10px) rotate(5deg); }
    }
    h1 {
      color: #fff;
      font-size: 2.2rem;
      font-weight: 700;
      margin: 0 0 0.75rem 0;
      background: linear-gradient(90deg, #fff, #ff5050);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .error {
      color: #ff6b6b;
      font-size: 1rem;
      margin: 0 0 2rem 0;
      padding: 1.25rem;
      background: rgba(255, 50, 50, 0.1);
      border-radius: 16px;
      border: 1px solid rgba(255, 50, 50, 0.2);
      font-weight: 500;
      box-shadow: 0 0 20px rgba(255, 50, 50, 0.1);
    }
  </style>
</head>
<body>
  <div class="bg"></div>
  <div class="grid"></div>
  <div class="container">
    <div class="error-icon">😵</div>
    <h1>Oops!</h1>
    <div class="error">${error}</div>
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
