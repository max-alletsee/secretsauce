import axios from 'axios'

const client = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// Auth token interceptor (skeleton — active after Phase 1)
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 401 refresh interceptor (skeleton — active after Phase 1)
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    // TODO Phase 1: attempt token refresh, retry, or redirect to /login
    return Promise.reject(error)
  },
)

export default client
