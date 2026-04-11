import { describe, expect, expectTypeOf, it, vi } from 'vitest'

const surfaceMocks = vi.hoisted(() => {
  const mockGetAccessToken = vi.fn().mockResolvedValue({ token: 'mock-token' })
  const mockAuthClient = { getAccessToken: mockGetAccessToken, credentials: {} }
  const mockGetClient = vi.fn().mockResolvedValue(mockAuthClient)
  const MockGoogleAuth = vi.fn().mockImplementation(() => ({ getClient: mockGetClient }))
  return { MockGoogleAuth }
})

vi.mock('google-auth-library', () => ({
  GoogleAuth: surfaceMocks.MockGoogleAuth,
}))

import {
  AnalyticsResource,
  GSCAuthError,
  GSCClient,
  GSCError,
  GSCNetworkError,
  GSCNotFoundError,
  GSCPermissionError,
  GSCRateLimitError,
  GSCServerError,
  GSCValidationError,
  HttpClient,
  InspectionResource,
  MemoryCache,
  SDK_VERSION,
  SitesResource,
  SitemapsResource,
  TokenBucket,
  buildCacheKey,
  computeBackoffMs,
  sleep,
  type AnalyticsQueryInput,
  type HttpRequest,
  type InspectionInput,
  type SiteEntry,
} from '../src/index.js'

describe('SDK core surface', () => {
  it('exports the public client and resource graph', () => {
    const client = new GSCClient({
      cache: true,
    })

    expect(SDK_VERSION).toBeTypeOf('string')
    expect(typeof GSCClient.fromCachedAuth).toBe('function')
    expect(client.sites).toBeInstanceOf(SitesResource)
    expect(client.sitemaps).toBeInstanceOf(SitemapsResource)
    expect(client.analytics).toBeInstanceOf(AnalyticsResource)
    expect(client.inspection).toBeInstanceOf(InspectionResource)

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
    expect(client.httpClient.cache).toBeInstanceOf(MemoryCache)
    expect(typeof client.httpClient.getToken).toBe('function')
    expect(typeof client.httpClient.refreshToken).toBe('function')
  })

  it('exports transport building blocks', () => {
    const httpClient = new HttpClient({
      baseUrl: 'https://searchconsole.googleapis.com/v1',
    })
    const cache = new MemoryCache({ maxEntries: 32, ttlMs: 60_000 })
    const bucket = new TokenBucket({ capacity: 10, refillPerSecond: 2 })

    expect(httpClient).toBeInstanceOf(HttpClient)
    expect(typeof httpClient.request).toBe('function')

    expect(cache).toBeInstanceOf(MemoryCache)
    expect(typeof cache.get).toBe('function')
    expect(typeof cache.set).toBe('function')
    expect(typeof cache.clear).toBe('function')

    expect(bucket).toBeInstanceOf(TokenBucket)
    expect(typeof bucket.acquire).toBe('function')
    expect(typeof bucket.available).toBe('function')
    expect(typeof bucket.snapshot).toBe('function')

    expect(typeof buildCacheKey).toBe('function')
    expect(typeof computeBackoffMs).toBe('function')
    expect(typeof sleep).toBe('function')
  })

  it('exports the error hierarchy', () => {
    expect(new GSCError('boom')).toBeInstanceOf(Error)
    expect(new GSCAuthError('auth')).toBeInstanceOf(GSCError)
    expect(new GSCPermissionError('permission')).toBeInstanceOf(GSCError)
    expect(new GSCNotFoundError('missing')).toBeInstanceOf(GSCError)
    expect(new GSCValidationError('bad input')).toBeInstanceOf(GSCError)
    expect(new GSCRateLimitError('rate limited')).toBeInstanceOf(GSCError)
    expect(new GSCServerError('server')).toBeInstanceOf(GSCError)
    expect(new GSCNetworkError('network')).toBeInstanceOf(GSCError)
  })

  it('exports the core types expected by the SDK surface', () => {
    const site: SiteEntry = {
      siteUrl: 'https://example.com/',
      permissionLevel: 'siteOwner',
    }
    const analyticsQuery: AnalyticsQueryInput = {
      siteUrl: 'https://example.com/',
      startDate: '2026-04-01',
      endDate: '2026-04-11',
    }
    const inspectionInput: InspectionInput = {
      siteUrl: 'https://example.com/',
      inspectionUrl: 'https://example.com/page',
    }
    const request: HttpRequest = {
      method: 'GET',
      path: '/sites',
    }

    expect(site.siteUrl).toBe('https://example.com/')
    expect(analyticsQuery.siteUrl).toBe('https://example.com/')
    expect(inspectionInput.inspectionUrl).toBe('https://example.com/page')
    expect(request.path).toBe('/sites')

    expectTypeOf(site).toMatchTypeOf<SiteEntry>()
    expectTypeOf(analyticsQuery).toMatchTypeOf<AnalyticsQueryInput>()
    expectTypeOf(inspectionInput).toMatchTypeOf<InspectionInput>()
    expectTypeOf(request).toMatchTypeOf<HttpRequest>()
  })

  it('HttpRequest accepts method, path, body, query', () => {
    const req: HttpRequest = {
      method: 'POST',
      path: '/sites/x/searchAnalytics/query',
      body: { startDate: '2026-01-01' },
      query: { limit: '10' },
    }
    expectTypeOf(req).toMatchTypeOf<HttpRequest>()
  })
})
