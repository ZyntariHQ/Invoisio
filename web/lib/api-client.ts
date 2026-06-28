import axios, { AxiosError } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

let accessToken: string | null = null;

function getOrCreateCorrelationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `corr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const apiClient = axios.create({
  baseURL: API_URL,
});

apiClient.interceptors.request.use((config) => {
  config.headers = config.headers ?? {};
  config.headers['X-Correlation-ID'] = getOrCreateCorrelationId();

  if (accessToken != null && accessToken.length > 0) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

export function setApiAccessToken(token: string | null): void {
  accessToken = token;
}

export function extractApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const err = error as AxiosError<{ message?: string | string[] }>;
    const message = err.response?.data?.message;

    if (Array.isArray(message)) {
      return message.join(', ');
    }

    if (typeof message === 'string' && message.length > 0) {
      return message;
    }

    if (typeof err.message === 'string' && err.message.length > 0) {
      return err.message;
    }
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}
