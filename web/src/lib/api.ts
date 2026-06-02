/**
 * Thin fetch wrapper. The Supabase JWT is held by `useAuth` and read from
 * sessionStorage; we attach it as Bearer on every call. Idempotency-Key is
 * passed for mutating endpoints.
 */
import { v4 as uuidv4 } from 'uuid';

const BASE = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000';

const getToken = (): string | null => {
  return sessionStorage.getItem('tn:jwt');
};

interface CallOpts {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
  formData?: FormData;
}

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(formatApiError(status, body));
  }
}

function formatApiError(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    // NestJS validation errors: { kind: 'validation_error', issues: [...] }
    if (b['kind'] === 'validation_error' && Array.isArray(b['issues'])) {
      const msgs = (b['issues'] as Array<{ path?: unknown; message?: string }>)
        .map((i) => `${(i.path as string[] | undefined)?.join('.') ?? ''}: ${i.message ?? ''}`)
        .join('; ');
      return `HTTP ${status} — ${msgs}`;
    }
    if (typeof b['message'] === 'string') return `HTTP ${status} — ${b['message']}`;
    if (typeof b['error'] === 'string') return `HTTP ${status} — ${b['error']}`;
  }
  return `HTTP ${status}`;
}

export async function api<T>(path: string, opts: CallOpts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const tok = getToken();
  if (tok) headers['Authorization'] = `Bearer ${tok}`;

  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  const method = opts.method ?? (opts.body || opts.formData ? 'POST' : 'GET');
  if (method !== 'GET') {
    headers['Idempotency-Key'] = opts.idempotencyKey ?? uuidv4();
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(body !== undefined && { body }),
  });
  if (!res.ok) {
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, payload);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
