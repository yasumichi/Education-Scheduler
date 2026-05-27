import { signal } from '@preact/signals';
import { User } from '../types';

export const userSignal = signal<User | null>(null);
export const showLoginModalSignal = signal<boolean>(false);
export const expiresAtSignal = signal<number | null>(null);

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

type RequestConfig = RequestInit & {
  retry?: boolean;
};

interface PendingRequest {
  url: string;
  config: RequestConfig;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
}

let pendingRequests: PendingRequest[] = [];

export async function apiFetch(url: string, config: RequestConfig = {}): Promise<Response> {
  const fullUrl = url.startsWith('http') ? url : `${BACKEND_URL}${url}`;
  
  // Default credentials to include for HttpOnly cookies
  if (config.credentials === undefined) {
    config.credentials = 'include';
  }

  const response = await fetch(fullUrl, config);

  if (response.status === 401) {
    // Don't intercept 401 for login or session check
    if (fullUrl.endsWith('/auth/login') || fullUrl.endsWith('/auth/me')) {
      return response;
    }

    // Show login modal
    showLoginModalSignal.value = true;

    // Queue the request
    return new Promise((resolve, reject) => {
      pendingRequests.push({ url, config, resolve, reject });
    });
  }

  return response;
}

export async function retryPendingRequests() {
  const requests = [...pendingRequests];
  pendingRequests = [];

  for (const { url, config, resolve, reject } of requests) {
    try {
      const response = await apiFetch(url, config);
      resolve(response);
    } catch (error) {
      reject(error);
    }
  }
}

export function clearPendingRequests() {
  pendingRequests = [];
}
