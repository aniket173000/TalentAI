import axios from 'axios'

// Vite proxy routes /api → http://localhost:8000
const api = axios.create({
  baseURL: '/api',
  timeout: 90_000, // 90s — AI screening can take a moment
})

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
