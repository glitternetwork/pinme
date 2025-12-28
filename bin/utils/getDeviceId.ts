import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { getAuthConfig } from './auth';

export function getDeviceId(): string {
  const configDir = path.join(os.homedir(), '.pinme');
  const configFile = path.join(configDir, 'device-id');

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  if (fs.existsSync(configFile)) {
    return fs.readFileSync(configFile, 'utf8').trim();
  }

  const deviceId = uuidv4();
  fs.writeFileSync(configFile, deviceId);
  return deviceId;
}
// Get uid: use address from auth if logged in, otherwise use deviceId
export function getUid(): string {
  const auth = getAuthConfig();
  if (auth?.address) {
    return auth.address;
  }
  return getDeviceId();
}
