import axios from 'axios'

const env = (import.meta as any).env ?? {}
export const API_BASE = env.VITE_API_URL ? `${env.VITE_API_URL}/api` : '/api'
const api = axios.create({
  baseURL: API_BASE,
  timeout: 90_000,
})

/**
 * Stream a POST response body as text chunks (used for the "Write with AI"
 * job-description generator). Uses fetch() because axios can't expose a
 * ReadableStream in the browser. `onChunk` is called with each decoded delta.
 */
export async function streamPost(
  path: string,
  body: unknown,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = localStorage.getItem('auth_token')
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) {
    let detail = ''
    try { detail = (await res.json())?.detail } catch { /* ignore */ }
    throw new Error(detail || `Request failed (${res.status})`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    onChunk(decoder.decode(value, { stream: true }))
  }
}

// Attach the single JWT to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// On 401 clear stale token and redirect to login
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('active_mode')
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`
      }
    }
    return Promise.reject(err)
  },
)

export default api
