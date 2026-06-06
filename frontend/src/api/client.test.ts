// frontend/src/api/client.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AxiosAdapter, AxiosResponse } from 'axios'

import client from './client'

/**
 * Drives the REAL axios interceptor in client.ts via a stubbed adapter, so we
 * exercise the 401 → refresh → retry logic that store-level mocks bypass.
 *
 * Each entry maps a URL substring to the response (or rejection) the adapter
 * should produce for a request to that URL.
 */
type Outcome =
  | { status: number; data?: unknown }
  | { reject: { status: number } }

function installAdapter(routes: Array<{ match: string; outcome: Outcome }>) {
  const calls: string[] = []
  const adapter: AxiosAdapter = async (config) => {
    const url = `${config.baseURL ?? ''}${config.url ?? ''}`
    calls.push(url)
    const route = routes.find((r) => url.includes(r.match))
    if (!route) throw new Error(`No stubbed route for ${url}`)

    const response: AxiosResponse = {
      data: 'data' in route.outcome ? route.outcome.data : undefined,
      status: 'status' in route.outcome ? route.outcome.status : route.outcome.reject.status,
      statusText: '',
      headers: {},
      config,
    }

    if ('reject' in route.outcome) {
      // Shape matches what axios throws: an error with a `.response` and `.config`.
      return Promise.reject(
        Object.assign(new Error(`Request failed with status ${route.outcome.reject.status}`), {
          config,
          response,
          isAxiosError: true,
        }),
      )
    }
    return response
  }
  client.defaults.adapter = adapter
  return { calls }
}

describe('client interceptor — 401 handling', () => {
  let originalLocation: Location

  beforeEach(() => {
    localStorage.clear()
    // jsdom throws on real navigation; replace location with a writable stub.
    originalLocation = window.location
    delete (window as { location?: Location }).location
    // @ts-expect-error minimal stub for the redirect assertion
    window.location = { href: '' } as Location
  })

  afterEach(() => {
    // @ts-expect-error restore
    window.location = originalLocation
    delete client.defaults.adapter
  })

  it('rejects (does not hang) and clears tokens when refresh also returns 401', async () => {
    localStorage.setItem('access_token', 'stale_at')
    localStorage.setItem('refresh_token', 'stale_rt')

    installAdapter([
      { match: '/users/me', outcome: { reject: { status: 401 } } },
      { match: '/auth/token/refresh', outcome: { reject: { status: 401 } } },
    ])

    // The boot request. Must SETTLE (reject) — the bug is that it hangs forever.
    await expect(client.get('/users/me')).rejects.toBeDefined()

    expect(localStorage.getItem('access_token')).toBeNull()
    expect(localStorage.getItem('refresh_token')).toBeNull()
    expect(window.location.href).toBe('/login')
  }, 2000) // short timeout: if it hangs, fail fast instead of waiting the default 5s
})
