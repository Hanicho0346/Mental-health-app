import { isAxiosError } from 'axios';

export function logClientInfo(scope: string, payload: Record<string, unknown>): void {
  console.log(`[CLIENT][${scope}]`, payload);
}

export function logClientError(scope: string, err: unknown, extra?: Record<string, unknown>): void {
  if (isAxiosError(err)) {
    const method = err.config?.method?.toUpperCase() ?? 'GET';
    const base = err.config?.baseURL ?? '';
    const path = err.config?.url ?? '';
    const status = err.response?.status ?? err.status;
    console.error(
      `[CLIENT][${scope}] ${method} ${base}${path} -> HTTP ${String(status)} ${err.response?.statusText ?? ''}`.trim(),
      {
        ...extra,
        axiosMessage: err.message,
        code: err.code,
        responseData: err.response?.data,
        requestSummary: err.config?.data ? tryParseJson(err.config.data as string) : undefined,
      }
    );
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error(`[CLIENT][${scope}]`, { ...extra, message, stack });
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

export function getApiErrorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    const data = err.response?.data;
    if (data && typeof data === 'object') {
      const msg = (data as { error?: unknown }).error;
      if (typeof msg === 'string') return msg;
      const detail = (data as { detail?: unknown }).detail;
      if (typeof detail === 'string') return detail;
    }
    if (err.response?.status) {
      return `Request failed (HTTP ${err.response.status}${err.response.statusText ? ` ${err.response.statusText}` : ''})`;
    }
    const net = err.code ? ` [${err.code}]` : '';
    const base = err.config?.baseURL ?? '';
    const path = err.config?.url ?? '';
    const where = base || path ? ` Tried: ${base}${path}` : '';
    return `${err.message || 'Network error'}${net}. Check EXPO_PUBLIC_API_URL and that the server is running.${where}`;
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}
