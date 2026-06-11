import axios from 'axios'

// Vite proxy routes /api → http://localhost:8000
const api = axios.create({
  baseURL: '/api',
  timeout: 90_000, // 90s — AI screening can take a moment
})

// Attach JWT from localStorage to every request — reads the active role's token
api.interceptors.request.use(config => {
  const activeRole = localStorage.getItem('active_role')
  const token = activeRole
    ? localStorage.getItem(`auth_token_${activeRole}`)
    : localStorage.getItem('auth_token') // legacy fallback
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// On 401 responses, clear stale token for active role and redirect to login
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      const activeRole = localStorage.getItem('active_role')
      if (activeRole) {
        localStorage.removeItem(`auth_token_${activeRole}`)
      }
      localStorage.removeItem('auth_token') // clean up legacy key
      localStorage.removeItem('active_role')
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`
      }
    }
    return Promise.reject(err)
  },
)

export default api
