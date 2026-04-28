import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { createApiError } from './cliError';
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

function hasBusinessCode(data: any): boolean {
  return Boolean(data) && typeof data === 'object' && 'code' in data;
}

function isSuccessfulBusinessCode(code: unknown): boolean {
  return String(code) === '200';
}

function getRequestDescriptor(config?: AxiosRequestConfig): string | undefined {
  if (!config?.url) {
    return undefined;
  }

  const method = (config.method || 'GET').toUpperCase();
  return `${method} ${config.url}`;
}

function buildErrorContext(config?: AxiosRequestConfig): string[] {
  const descriptor = getRequestDescriptor(config);
  return descriptor ? [`Request: ${descriptor}`] : [];
}

function normalizeBusinessError(response: AxiosResponse): never {
  throw createApiError(
    'API request',
    { response, config: response.config },
    buildErrorContext(response.config),
  );
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
    (response) => {
      if (
        hasBusinessCode(response.data)
        && !isSuccessfulBusinessCode(response.data.code)
      ) {
        normalizeBusinessError(response);
      }

      return response;
    },
    (error) => Promise.reject(
      createApiError(
        'API request',
        error,
        buildErrorContext(error?.config),
      ),
    ),
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
