/**
 * Minimal typed fetch client for the Beancount Studio API.
 * All requests go through the same-origin `/api` prefix (proxied to the Python service),
 * so the session cookie travels automatically.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Query = Record<string, string | number | boolean | undefined | null | Array<string | number>>;

export function buildQuery(params?: Query): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item));
    } else {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

async function parseError(response: Response): Promise<ApiError> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    /* non-JSON error body */
  }
  const error = (payload as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | null)?.error;
  return new ApiError(
    response.status,
    error?.code ?? `http_${response.status}`,
    error?.message ?? response.statusText ?? "Request failed",
    error?.details ?? {},
  );
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  query?: Query;
  body?: unknown;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { query, body, headers, ...rest } = options;
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const response = await fetch(`/api${path}${buildQuery(query)}`, {
    credentials: "same-origin",
    ...rest,
    headers: {
      Accept: "application/json",
      ...(body !== undefined && !isForm ? { "Content-Type": "application/json" } : {}),
      ...(headers ?? {}),
    },
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });
  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return (await response.text()) as unknown as T;
  return (await response.json()) as T;
}

export const apiGet = <T>(path: string, query?: Query) => api<T>(path, { query });
export const apiPost = <T>(path: string, body?: unknown, query?: Query) => api<T>(path, { method: "POST", body, query });
export const apiPut = <T>(path: string, body?: unknown) => api<T>(path, { method: "PUT", body });
export const apiPatch = <T>(path: string, body?: unknown) => api<T>(path, { method: "PATCH", body });
export const apiDelete = <T>(path: string, body?: unknown) => api<T>(path, { method: "DELETE", body });

export function isApiError(error: unknown, status?: number): error is ApiError {
  return error instanceof ApiError && (status === undefined || error.status === status);
}

export function errorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}
