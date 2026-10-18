/**
 * Centralized API client helper for TextShare.
 * Safely parses JSON responses and provides clear, actionable error messages
 * even when receiving empty bodies, HTML 404/405/500 pages, or network errors.
 */

export const API_BASE = import.meta.env.VITE_API_URL || '';

export async function safeFetchJson<T = any>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

  let res: Response;
  try {
    res = await fetch(url, options);
  } catch (err: any) {
    throw new Error(`Network error: Unable to connect to server (${err?.message || 'Check your internet connection'})`);
  }

  // Read response as text first to avoid "Unexpected end of JSON input" on empty bodies
  const rawText = await res.text();
  let data: any = null;

  if (rawText && rawText.trim().length > 0) {
    try {
      data = JSON.parse(rawText);
    } catch {
      // Body is not JSON (e.g. HTML error page or plain text)
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('API endpoint not found (404). Check server deployment.');
        }
        if (res.status === 405) {
          throw new Error('Request method not allowed (405).');
        }
        throw new Error(`Server returned status ${res.status}: ${rawText.slice(0, 120)}`);
      }
      throw new Error('Received non-JSON response from server');
    }
  }

  if (!res.ok) {
    const errorMsg =
      data?.error ||
      data?.message ||
      (res.status === 404
        ? 'API endpoint not found (404)'
        : res.status === 405
        ? 'Method not allowed (405)'
        : `Request failed with HTTP ${res.status}`);
    throw new Error(errorMsg);
  }

  if (data === null || data === undefined) {
    throw new Error('Server returned an empty response');
  }

  return data as T;
}
