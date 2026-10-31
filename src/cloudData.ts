const API_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_BASE || 'https://api.ozoonotes.com')

export type CloudDataRecord = { key: string; value: string | null; deleted: boolean; updatedAt: number }

export async function cloudDataRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...init.headers } })
  const result = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(result.error || `Cloud save failed (${response.status})`)
  return result
}

export async function readCloudData(key: string): Promise<CloudDataRecord | null> {
  const result = await cloudDataRequest<{ entries: CloudDataRecord[] }>(`/api/me/data?key=${encodeURIComponent(key)}`)
  return result.entries[0] ?? null
}

export async function writeCloudData(key: string, value: string | null): Promise<CloudDataRecord | null> {
  const result = await cloudDataRequest<{ entries: CloudDataRecord[] }>('/api/me/data', { method: 'PUT', body: JSON.stringify({ entries: [{ key, value }] }) })
  return result.entries[0] ?? null
}
