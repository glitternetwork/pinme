import axios, { AxiosInstance } from 'axios';
import { getAuthHeaders } from './webLogin';
import { APP_CONFIG } from './config';

interface CreateApiClientOptions {
  baseURL?: string;
  includeAuth?: boolean;
  timeout?: number;
  headers?: Record<string, string>;
}

function safeGetAuthHeaders(): Record<string, string> {
  try {
    return getAuthHeaders();
  } catch (error) {
    return {};
  }
}

export function createApiClient(
  options: CreateApiClientOptions = {},
): AxiosInstance {
  const {
    baseURL = APP_CONFIG.pinmeApiBase,
    includeAuth = true,
    timeout = 20000,
    headers = {},
  } = options;

  const client = axios.create({
    baseURL,
    timeout,
    headers: {
      ...(includeAuth ? safeGetAuthHeaders() : {}),
      Accept: '*/*',
      'Content-Type': 'application/json',
      'User-Agent': 'Pinme-CLI',
      Connection: 'keep-alive',
      ...headers,
    },
  });

  client.interceptors.response.use(
    (response) => response,
    (error) => Promise.reject(error),
  );

  return client;
}

export function createPinmeApiClient(
  options: Omit<CreateApiClientOptions, 'baseURL'> = {},
): AxiosInstance {
  return createApiClient({
    ...options,
    baseURL: APP_CONFIG.pinmeApiBase,
  });
}

export function createCarApiClient(
  options: Omit<CreateApiClientOptions, 'baseURL'> = {},
): AxiosInstance {
  return createApiClient({
    ...options,
    baseURL: APP_CONFIG.carApiBase,
  });
}
