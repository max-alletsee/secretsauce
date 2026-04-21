import axios, { type InternalAxiosRequestConfig } from 'axios'

const client = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  paramsSerializer: (params) => {
    const parts: string[] = []
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue
      if (Array.isArray(value)) {
        for (const v of value) parts.push(`${key}=${encodeURIComponent(v)}`)
      } else {
        parts.push(`${key}=${encodeURIComponent(value)}`)
      }
    }
    return parts.join('&')
  },
})

// Attach access token to every outgoing request
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// On 401: attempt one silent token refresh, retry the original request.
// If the refresh also fails, clear tokens and redirect to /login.
let isRefreshing = false
let refreshQueue: Array<(token: string) => void> = []

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    // axios v1: error.config is InternalAxiosRequestConfig, not AxiosRequestConfig
    const originalRequest: InternalAxiosRequestConfig & { _retry?: boolean } = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      if (isRefreshing) {
        // Another request already triggered a refresh — queue this one
        return new Promise((resolve) => {
          refreshQueue.push((token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`
            resolve(client(originalRequest))
          })
        })
      }

      isRefreshing = true
      const refreshToken = localStorage.getItem('refresh_token')

      if (!refreshToken) {
        isRefreshing = false
        window.location.href = '/login'
        return Promise.reject(error)
      }

      try {
        const { data } = await client.post('/auth/token/refresh', { refresh_token: refreshToken })
        const newToken = data.access_token
        localStorage.setItem('access_token', newToken)
        localStorage.setItem('refresh_token', data.refresh_token)

        refreshQueue.forEach((cb) => cb(newToken))
        refreshQueue = []

        originalRequest.headers.Authorization = `Bearer ${newToken}`
        return client(originalRequest)
      } catch {
        refreshQueue = []
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        window.location.href = '/login'
        return Promise.reject(error)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  },
)

export default client
