import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

// --- Toast event system ---

type ToastListener = (message: string) => void;

let toastListener: ToastListener | null = null;

/**
 * Subscribe to toast events triggered by the API client (e.g., 403 responses).
 * Returns an unsubscribe function.
 */
export function onToast(listener: ToastListener): () => void {
  toastListener = listener;
  return () => {
    if (toastListener === listener) {
      toastListener = null;
    }
  };
}

function emitToast(message: string): void {
  if (toastListener) {
    toastListener(message);
  }
}

// --- Retry configuration ---

interface RetryConfig {
  retryCount: number;
  retryDelay: number;
}

const RETRY_CONFIG: RetryConfig = {
  retryCount: 3,
  retryDelay: 1000, // base delay in ms, exponential backoff: 1s, 2s, 4s
};

// --- Axios instance ---

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8080",
  timeout: 15000,
});

// --- Request interceptor: attach Authorization header ---

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem("sentinel_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// --- Response interceptor: handle 401, 403, 5xx/network errors with retry ---

interface ExtendedRequestConfig extends InternalAxiosRequestConfig {
  _retryCount?: number;
}

function isRetryableError(error: AxiosError): boolean {
  // Network errors (no response)
  if (!error.response) {
    return true;
  }
  // Server errors (5xx)
  const status = error.response.status;
  return status >= 500 && status < 600;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as ExtendedRequestConfig | undefined;

    // Handle 401: clear storage and redirect to login
    if (error.response?.status === 401) {
      localStorage.removeItem("sentinel_token");
      localStorage.removeItem("sentinel_role");
      localStorage.removeItem("sentinel_uid");
      localStorage.removeItem("sentinel_fullName");
      localStorage.removeItem("sentinel_email");
      window.location.href = "/login";
      return Promise.reject(error);
    }

    // Handle 403: trigger toast notification
    if (error.response?.status === 403) {
      emitToast("Insufficient permissions");
      return Promise.reject(error);
    }

    // Handle 5xx and network errors: retry with exponential backoff
    if (config && isRetryableError(error)) {
      const retryCount = config._retryCount ?? 0;

      if (retryCount < RETRY_CONFIG.retryCount) {
        config._retryCount = retryCount + 1;
        const backoffDelay = RETRY_CONFIG.retryDelay * Math.pow(2, retryCount);
        await delay(backoffDelay);
        return apiClient(config);
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
