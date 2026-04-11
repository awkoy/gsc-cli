import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GSCClient } from '../src/client.js'
import { MemoryCache } from '../src/transport/cache.js'
import { GSCAuthError } from '../src/errors.js'

// Use vi.hoisted so refs are available before vi.mock() factory runs (factory is hoisted to top)
const mocks = vi.hoisted(() => {
  const mockGetAccessToken = vi.fn().mockResolvedValue({ token: 'mock-token' })
  const mockAuthClient = { getAccessToken: mockGetAccessToken, credentials: {} }
  const mockGetClient = vi.fn().mockResolvedValue(mockAuthClient)
  const mockGoogleAuthInstance = { getClient: mockGetClient }
  const MockGoogleAuth = vi.fn().mockImplementation(() => mockGoogleAuthInstance)
  return { mockGetAccessToken, mockAuthClient, mockGetClient, mockGoogleAuthInstance, MockGoogleAuth }
})

vi.mock('google-auth-library', () => ({
  GoogleAuth: mocks.MockGoogleAuth,
}))

function fetchOk(body: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  )
}

describe('GSCClient', () => {
  beforeEach(() => {
    // Re-establish the default mock implementations since vitest clearMocks may reset them
    mocks.mockGetAccessToken.mockResolvedValue({ token: 'mock-token' })
    mocks.mockGetClient.mockResolvedValue(mocks.mockAuthClient)
    mocks.MockGoogleAuth.mockImplementation(() => mocks.mockGoogleAuthInstance)
  })

  it('constructor wires resources correctly', () => {
    const client = new GSCClient()
    expect(client.sites).toBeDefined()
    expect(client.sitemaps).toBeDefined()
    expect(client.analytics).toBeDefined()
    expect(client.inspection).toBeDefined()
    expect(client.httpClient).toBeDefined()
  })

  it('getToken uses google-auth-library and returns the token', async () => {
    const fetchFn = fetchOk({ siteEntry: [] })
    const client = new GSCClient({ fetch: fetchFn })
    await client.sites.list()
    const [, init] = fetchFn.mock.calls[0]!
    const headers = new Headers((init as RequestInit).headers)
    expect(headers.get('authorization')).toBe('Bearer mock-token')
  })

  it('sites, sitemaps, analytics, inspection namespaces exist', () => {
    const client = new GSCClient()
    expect(typeof client.sites.list).toBe('function')
    expect(typeof client.sites.get).toBe('function')
    expect(typeof client.sites.add).toBe('function')
    expect(typeof client.sites.delete).toBe('function')
    expect(typeof client.sitemaps.list).toBe('function')
    expect(typeof client.sitemaps.get).toBe('function')
    expect(typeof client.sitemaps.submit).toBe('function')
    expect(typeof client.sitemaps.delete).toBe('function')
    expect(typeof client.analytics.query).toBe('function')
    expect(typeof client.inspection.inspect).toBe('function')
  })

  it('custom auth option is used when provided', async () => {
    const mockAccessToken = vi.fn().mockResolvedValue({ token: 'custom-token' })
    const mockAuthClientCustom = {
      getAccessToken: mockAccessToken,
      credentials: {},
    } as never
    const fetchFn = fetchOk({ siteEntry: [] })
    const client = new GSCClient({ auth: mockAuthClientCustom, fetch: fetchFn })
    await client.sites.list()
    expect(mockAccessToken).toHaveBeenCalled()
    const [, init] = fetchFn.mock.calls[0]!
    const headers = new Headers((init as RequestInit).headers)
    expect(headers.get('authorization')).toBe('Bearer custom-token')
  })

  it('throws AUTH_MISSING when getAccessToken returns null token', async () => {
    mocks.mockGetClient.mockResolvedValueOnce({
      getAccessToken: vi.fn().mockResolvedValue({ token: null }),
      credentials: {},
    })
    const client = new GSCClient({ fetch: fetchOk({}) })
    await expect(client.sites.list()).rejects.toBeInstanceOf(GSCAuthError)
  })

  it('throws AUTH_MISSING when google-auth-library fails', async () => {
    mocks.mockGetClient.mockRejectedValueOnce(new Error('no credentials found'))
    const client = new GSCClient({ fetch: fetchOk({}) })
    await expect(client.sites.list()).rejects.toBeInstanceOf(GSCAuthError)
  })

  it('fromCachedAuth creates client and eagerly validates credentials', async () => {
    const client = await GSCClient.fromCachedAuth({ fetch: fetchOk({}) })
    expect(client.sites).toBeDefined()
  })

  it('fromCachedAuth throws when google-auth-library fails', async () => {
    mocks.mockGetClient.mockRejectedValueOnce(new Error('no credentials'))
    await expect(GSCClient.fromCachedAuth({ fetch: fetchOk({}) })).rejects.toBeInstanceOf(GSCAuthError)
  })

  it('cache is set up when cache:true', () => {
    const client = new GSCClient({ cache: true })
    expect(client.httpClient.cache).toBeDefined()
  })

  it('cache is set up when a MemoryCache instance is passed', () => {
    const cache = new MemoryCache({ maxEntries: 10, ttlMs: 1000 })
    const client = new GSCClient({ cache })
    expect(client.httpClient.cache).toBe(cache)
  })

  it('rateLimitSnapshot works via httpClient', () => {
    const client = new GSCClient()
    const snapshot = client.httpClient.rateLimitSnapshot()
    expect(snapshot).toHaveProperty('remaining')
    expect(snapshot).toHaveProperty('resetAt')
  })
})
