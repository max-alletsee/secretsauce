// frontend/src/api/auth.ts
import client from './client'
import type { LoginCredentials, RegisterData, TokenResponse, User, UserUpdatePayload } from '@/types/user'

/**
 * Login — returns both access and refresh tokens.
 * Uses form-encoded body because fastapi-users expects OAuth2PasswordRequestForm.
 */
export const login = (credentials: LoginCredentials) =>
  client.post<TokenResponse>(
    '/auth/login',
    new URLSearchParams({ username: credentials.email, password: credentials.password }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )

/** Register a new account. */
export const register = (data: RegisterData) =>
  client.post<User>('/auth/register', data)

/** Refresh access token — both tokens rotate. */
export const refreshToken = (token: string) =>
  client.post<TokenResponse>('/auth/token/refresh', { refresh_token: token })

/** Get current user profile. */
export const getMe = () =>
  client.get<User>('/users/me')

/** Update current user profile. */
export const updateMe = (data: UserUpdatePayload) =>
  client.patch<User>('/users/me', data)

/** Logout — invalidates the current JWT on the server. */
export const logout = () =>
  client.post('/auth/jwt/logout')
