const DEFAULT_API_URL =
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:3001`
    : 'http://localhost:3001';
const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ?? DEFAULT_API_URL;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    'X-Requested-With': 'starspell',
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  const text = await res.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
  }

  if (!res.ok) {
    const errObj = (parsed as { error?: { code?: string; message?: string } } | undefined)?.error;
    throw new ApiError(
      res.status,
      errObj?.code ?? 'HTTP_ERROR',
      errObj?.message ?? `Request failed (${String(res.status)})`,
    );
  }

  return parsed as T;
}
