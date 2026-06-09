import axios from 'axios'

// Vite proxy routes /api → http://localhost:8000
const api = axios.create({
  baseURL: '/api',
  timeout: 90_000, // 90s — AI screening can take a moment
})

export default api
