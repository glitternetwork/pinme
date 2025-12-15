import axios, { AxiosInstance } from 'axios';
import chalk from 'chalk';
import { getAuthHeaders } from './auth';

const DEFAULT_BASE = process.env.PINME_API_BASE || 'http://ipfs-proxy.opena.chat/api/v4';

function createClient(): AxiosInstance {
  const headers = getAuthHeaders();
  return axios.create({
    baseURL: DEFAULT_BASE,
    timeout: 20000,
    headers: {
      ...headers,
      Accept: '*/*',
      'Content-Type': 'application/json',
      'User-Agent': 'Pinme-CLI',
      Connection: 'keep-alive',
    },
  });
}

export async function bindAnonymousDevice(anonymousUid: string): Promise<boolean> {
  try {
    const client = createClient();
    const { data } = await client.post('/bind_anonymous', {
      anonymous_uid: anonymousUid,
    });
    return data?.code === 200;
  } catch (e: any) {
    console.log(chalk.yellow(`Failed to trigger anonymous binding: ${e?.message || e}`));
    return false;
  }
}

export interface CheckDomainResult {
  is_valid: boolean;
  error?: string;
}

export async function checkDomainAvailable(domainName: string): Promise<CheckDomainResult> {
  const client = createClient();
  // Endpoint may not be fixed, prioritize environment variable, then try two common paths
  const configured = process.env.PINME_CHECK_DOMAIN_PATH || '/check_domain';
  const fallbacks = [configured, '/check_domain_available'];

  for (const p of fallbacks) {
    try {
      const { data } = await client.post(p, { domain_name: domainName });
      if (typeof data?.is_valid === 'boolean') {
        return { is_valid: data.is_valid, error: data?.error };
      }
      if (data?.data && typeof data.data.is_valid === 'boolean') {
        return { is_valid: data.data.is_valid, error: data.data?.error };
      }
      // Unexpected structure, continue trying next path
    } catch (e: any) {
      // 404/405/500 etc., continue trying next path
    }
  }
  // If all attempts fail, return unknown state, let subsequent bind return error message
  return { is_valid: true };
}

export async function bindPinmeDomain(domainName: string, hash: string): Promise<boolean> {
  const client = createClient();
  const { data } = await client.post('/bind_pinme_domain', {
    domain_name: domainName,
    hash,
  });
  return data?.code === 200;
}

export interface MyDomainItem {
  domain_name: string;
  domain_type: number;
  bind_time: number;
  expire_time: number;
}

export async function getMyDomains(): Promise<MyDomainItem[]> {
  const client = createClient();
  const { data } = await client.get('/my_domains');
  if (data?.code === 200) {
    if (Array.isArray(data?.data)) {
      // v4: data is array
      return data.data as MyDomainItem[];
    }
    if (data?.data?.list && Array.isArray(data.data.list)) {
      // fallback: sometimes wrapped in { list: [] }
      return data.data.list as MyDomainItem[];
    }
  }
  return [];
}


