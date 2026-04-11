import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpClient } from '../../src/transport/http-client.js'
import {
  GSCAuthError,
  GSCPermissionError,
  GSCNotFoundError,
  GSCValidationError,
  GSCServerError,
  GSCNetworkError,
  GSCRateLimitError,
} from '../../src/errors.js'

const BASE = 'https://searchconsole.googleapis.com/v1'

function mockFetch(responses: Array<Response | Error>): typeof fetch {
  const fn = vi.fn()
  for (const r of responses) {
    if (r instanceof Error) fn.mockRejectedValueOnce(r)
    else fn.mockResolvedValueOnce(r)
  }
  return fn as unknown as typeof fetch
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', 'x-request-id': 'req-xyz' },
    ...init,
  })
}

describe('HttpClient', () => {
  let getToken: () => Promise<string>

  beforeEach(() => {
    getToken = vi.fn().mockResolvedValue('fake-token')
  })

  it('GETs with auth header and parses JSON', async () => {
    const fetchFn = mockFetch([jsonResponse({ siteEntry: [{ siteUrl: 'https://a/' }] })])
    const client = new HttpClient({ baseUrl: BASE, fetch: fetchFn, getToken, refreshToken: vi.fn() })

    const result = await client.request<{ siteEntry: Array<{ siteUrl: string }> }>({
      method: 'GET',
      path: '/sites',
    })

    expect(result.siteEntry[0]?.siteUrl).toBe('https://a/')
    const mockFn = fetchFn as ReturnType<typeof vi.fn>
    expect(mockFn).toHaveBeenCalledOnce()
    const [url, init] = mockFn.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/sites`)
    expect(init.method).toBe('GET')
    const headers = new Headers(init.headers)
    expect(headers.get('authorization')).toBe('Bearer fake-token')
    expect(headers.get('accept')).toBe('application/json')
  })

  it('POSTs JSON body with content-type header', async () => {
    const fetchFn = mockFetch([jsonResponse({ ok: true })])
    const client = new HttpClient({ baseUrl: BASE, fetch: fetchFn, getToken, refreshToken: vi.fn() })

    await client.request({
      method: 'POST',
      path: '/sites/x/searchAnalytics/query',
      body: { startDate: '2026-01-01' },
    })

    const mockFn = fetchFn as ReturnType<typeof vi.fn>
    const [, init] = mockFn.mock.calls[0] as [string, RequestInit]
    const headers = new Headers(init.headers)
    expect(headers.get('content-type')).toBe('application/json')
    expect(init.body).toBe(JSON.stringify({ startDate: '2026-01-01' }))
  })

  it('maps 401 to GSCAuthError after refresh attempt fails', async () => {
    const refreshToken = vi.fn().mockRejectedValue(new Error('refresh failed'))
    const fetchFn = mockFetch([jsonResponse({ error: { message: 'expired' } }, { status: 401 })])
    const client = new HttpClient({ baseUrl: BASE, fetch: fetchFn, getToken, refreshToken })

    await expect(client.request({ method: 'GET', path: '/sites' })).rejects.toBeInstanceOf(
      GSCAuthError,
    )
    expect(refreshToken).toHaveBeenCalledOnce()
  })

  it('on 401 refreshes once and retries successfully', async () => {
    const refreshToken = vi.fn().mockResolvedValue(undefined)
    const fetchFn = mockFetch([
      jsonResponse({ error: { message: 'expired' } }, { status: 401 }),
      jsonResponse({ siteEntry: [] }),
    ])
    const client = new HttpClient({ baseUrl: BASE, fetch: fetchFn, getToken, refreshToken })

    const out = await client.request<{ siteEntry: unknown[] }>({ method: 'GET', path: '/sites' })
    expect(out.siteEntry).toEqual([])
    expect(refreshToken).toHaveBeenCalledOnce()
    const mockFn = fetchFn as ReturnType<typeof vi.fn>
    expect(mockFn).toHaveBeenCalledTimes(2)
  })

  it.each([
    [403, GSCPermissionError],
    [404, GSCNotFoundError],
    [400, GSCValidationError],
    [500, GSCServerError],
  ])('maps %d to the right error type', async (status, Expected) => {
    const fetchFn = mockFetch([jsonResponse({ error: { message: 'oops' } }, { status })])
    const client = new HttpClient({
      baseUrl: BASE,
      fetch: fetchFn,
      getToken,
      refreshToken: vi.fn(),
      retry: { maxAttempts: 1 },
    })
    await expect(client.request({ method: 'GET', path: '/sites' })).rejects.toBeInstanceOf(Expected)
  })

  it('wraps fetch failures in GSCNetworkError', async () => {
    const fetchFn = mockFetch([new TypeError('network down')])
    const client = new HttpClient({
      baseUrl: BASE,
      fetch: fetchFn,
      getToken,
      refreshToken: vi.fn(),
      retry: { maxAttempts: 1 },
    })
    await expect(client.request({ method: 'GET', path: '/sites' })).rejects.toBeInstanceOf(
      GSCNetworkError,
    )
  })

  it('maps 429 to GSCRateLimitError with retryAfterMs', async () => {
    const fetchFn = mockFetch([
      new Response('{}', { status: 429, headers: { 'retry-after': '5', 'x-request-id': 'r1' } }),
    ])
    const client = new HttpClient({
      baseUrl: BASE,
      fetch: fetchFn,
      getToken,
      refreshToken: vi.fn(),
      retry: { maxAttempts: 1 },
    })
    const err = await client.request({ method: 'GET', path: '/sites' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GSCRateLimitError)
    expect((err as GSCRateLimitError).retryAfterMs).toBe(5000)
    expect((err as GSCRateLimitError).requestId).toBe('r1')
  })

  it('captures x-request-id into thrown error', async () => {
    const fetchFn = mockFetch([
      new Response('{"error":{"message":"bad"}}', {
        status: 403,
        headers: { 'x-request-id': 'req-abc' },
      }),
    ])
    const client = new HttpClient({
      baseUrl: BASE,
      fetch: fetchFn,
      getToken,
      refreshToken: vi.fn(),
      retry: { maxAttempts: 1 },
    })
    const err = await client.request({ method: 'GET', path: '/sites' }).catch((e: unknown) => e)
    expect((err as GSCPermissionError).requestId).toBe('req-abc')
  })

  it('retries 429 up to maxAttempts, honoring Retry-After', async () => {
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (fn: any) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        fn()
        return 0 as unknown as ReturnType<typeof setTimeout>
      },
    )

    const fetchFn = mockFetch([
      new Response('{}', { status: 429, headers: { 'retry-after': '0' } }),
      new Response('{}', { status: 429, headers: { 'retry-after': '0' } }),
      jsonResponse({ ok: true }),
    ])
    const client = new HttpClient({
      baseUrl: BASE,
      fetch: fetchFn,
      getToken,
      refreshToken: vi.fn(),
      retry: { maxAttempts: 5 },
    })
    const out = await client.request<{ ok: boolean }>({ method: 'GET', path: '/sites' })
    expect(out.ok).toBe(true)
    const mockFn = fetchFn as ReturnType<typeof vi.fn>
    expect(mockFn).toHaveBeenCalledTimes(3)

    vi.restoreAllMocks()
  })

  it('retries 5xx then gives up as GSCServerError', async () => {
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (fn: any) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        fn()
        return 0 as unknown as ReturnType<typeof setTimeout>
      },
    )

    const fetchFn = mockFetch([
      new Response('{}', { status: 500 }),
      new Response('{}', { status: 500 }),
      new Response('{}', { status: 500 }),
    ])
    const client = new HttpClient({
      baseUrl: BASE,
      fetch: fetchFn,
      getToken,
      refreshToken: vi.fn(),
      retry: { maxAttempts: 3 },
    })
    await expect(client.request({ method: 'GET', path: '/sites' })).rejects.toBeInstanceOf(
      GSCServerError,
    )
    const mockFn = fetchFn as ReturnType<typeof vi.fn>
    expect(mockFn).toHaveBeenCalledTimes(3)

    vi.restoreAllMocks()
  })

  it('throws GSCAuthError when getToken is not provided', async () => {
    const client = new HttpClient({ baseUrl: BASE })
    await expect(client.request({ method: 'GET', path: '/sites' })).rejects.toBeInstanceOf(
      GSCAuthError,
    )
  })

  it('handles empty body by returning empty object', async () => {
    // Use 200 with empty body to simulate empty response
    const fetchFn = mockFetch([new Response('', { status: 200 })])
    const client = new HttpClient({ baseUrl: BASE, fetch: fetchFn, getToken, refreshToken: vi.fn() })
    const result = await client.request({ method: 'DELETE', path: '/sites/x' })
    expect(result).toEqual({})
  })

  it('builds URL with query params', async () => {
    const fetchFn = mockFetch([jsonResponse({})])
    const client = new HttpClient({ baseUrl: BASE, fetch: fetchFn, getToken, refreshToken: vi.fn() })
    await client.request({
      method: 'GET',
      path: '/sites',
      query: { foo: 'bar', num: 42, undef: undefined },
    })
    const mockFn = fetchFn as ReturnType<typeof vi.fn>
    const [url] = mockFn.mock.calls[0] as [string]
    expect(url).toContain('foo=bar')
    expect(url).toContain('num=42')
    expect(url).not.toContain('undef')
  })

  it('rateLimitSnapshot returns remaining=-1 when no rateLimit configured', () => {
    const client = new HttpClient({ baseUrl: BASE, getToken, refreshToken: vi.fn() })
    const snap = client.rateLimitSnapshot()
    expect(snap.remaining).toBe(-1)
    expect(snap.resetAt).toBe('')
  })

  it('rateLimitSnapshot returns real values when rateLimit is configured', async () => {
    const fetchFn = mockFetch([jsonResponse({})])
    const client = new HttpClient({
      baseUrl: BASE,
      fetch: fetchFn,
      getToken,
      refreshToken: vi.fn(),
      rateLimit: { capacity: 10, refillPerSecond: 1 },
    })
    const snap = client.rateLimitSnapshot()
    expect(snap.remaining).toBe(10)
    expect(snap.resetAt).toBeTruthy()
  })

  it('401 response carries hint to re-authenticate', async () => {
    const refreshToken = vi.fn().mockRejectedValue(new Error('failed'))
    const fetchFn = mockFetch([jsonResponse({ error: { message: 'expired' } }, { status: 401 })])
    const client = new HttpClient({ baseUrl: BASE, fetch: fetchFn, getToken, refreshToken })
    const err = await client.request({ method: 'GET', path: '/sites' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GSCAuthError)
    expect((err as GSCAuthError).hint).toContain('gsc auth login')
  })

  it('403 response carries hint about permissions', async () => {
    const fetchFn = mockFetch([
      jsonResponse({ error: { message: 'forbidden' } }, { status: 403 }),
    ])
    const client = new HttpClient({
      baseUrl: BASE,
      fetch: fetchFn,
      getToken,
      refreshToken: vi.fn(),
      retry: { maxAttempts: 1 },
    })
    const err = await client.request({ method: 'GET', path: '/sites' }).catch((e: unknown) => e)
    expect((err as GSCPermissionError).hint).toContain('Google Search Console')
  })

  it('404 response carries hint about URL path', async () => {
    const fetchFn = mockFetch([
      jsonResponse({ error: { message: 'not found' } }, { status: 404 }),
    ])
    const client = new HttpClient({
      baseUrl: BASE,
      fetch: fetchFn,
      getToken,
      refreshToken: vi.fn(),
      retry: { maxAttempts: 1 },
    })
    const err = await client.request({ method: 'GET', path: '/sites/x' }).catch((e: unknown) => e)
    expect((err as GSCNotFoundError).hint).toContain('site URL')
  })

  it('429 response carries hint to wait and retry', async () => {
    const fetchFn = mockFetch([
      new Response('{}', { status: 429, headers: { 'retry-after': '0' } }),
    ])
    const client = new HttpClient({
      baseUrl: BASE,
      fetch: fetchFn,
      getToken,
      refreshToken: vi.fn(),
      retry: { maxAttempts: 1 },
    })
    const err = await client.request({ method: 'GET', path: '/sites' }).catch((e: unknown) => e)
    expect((err as GSCRateLimitError).hint).toContain('Rate limited')
  })

  it('network error carries connectivity hint', async () => {
    const fetchFn = mockFetch([new TypeError('network down')])
    const client = new HttpClient({
      baseUrl: BASE,
      fetch: fetchFn,
      getToken,
      refreshToken: vi.fn(),
      retry: { maxAttempts: 1 },
    })
    const err = await client.request({ method: 'GET', path: '/sites' }).catch((e: unknown) => e)
    expect((err as GSCNetworkError).hint).toContain('connectivity')
  })

  it('cache hit returns cached result without second fetch', async () => {
    const fetchFn = mockFetch([
      jsonResponse({ siteEntry: [{ siteUrl: 'https://a/' }] }),
    ])
    const { MemoryCache } = await import('../../src/transport/cache.js')
    const cache = new MemoryCache({ maxEntries: 10, ttlMs: 60_000 })
    const client = new HttpClient({
      baseUrl: BASE,
      fetch: fetchFn,
      getToken,
      refreshToken: vi.fn(),
      cache,
    })
    const r1 = await client.request<{ siteEntry: unknown[] }>({ method: 'GET', path: '/sites' })
    const r2 = await client.request<{ siteEntry: unknown[] }>({ method: 'GET', path: '/sites' })
    expect(r1).toEqual(r2)
    expect(fetchFn).toHaveBeenCalledOnce()
  })

  it('PUT/DELETE requests are not cached', async () => {
    const fetchFn = mockFetch([
      jsonResponse({}),
      jsonResponse({}),
    ])
    const { MemoryCache } = await import('../../src/transport/cache.js')
    const cache = new MemoryCache({ maxEntries: 10, ttlMs: 60_000 })
    const client = new HttpClient({
      baseUrl: BASE,
      fetch: fetchFn,
      getToken,
      refreshToken: vi.fn(),
      cache,
    })
    await client.request({ method: 'PUT', path: '/sites/x' })
    await client.request({ method: 'PUT', path: '/sites/x' })
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
})
