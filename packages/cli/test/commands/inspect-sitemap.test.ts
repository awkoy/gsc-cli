import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runInspectSitemap } from '../../src/commands/inspect-sitemap.js'

function mkHttpClient() {
  return { rateLimitSnapshot: vi.fn().mockReturnValue({ remaining: -1, resetAt: '' }) }
}

function mkClient(inspectResults: Record<string, { verdict: string }>) {
  return {
    sitemaps: {
      // Returns { sitemap?: SitemapEntry[] } matching the real SDK
      list: vi.fn().mockResolvedValue({ sitemap: [{ path: 'https://a/sitemap.xml' }] }),
    },
    inspection: {
      inspect: vi.fn().mockImplementation(async ({ inspectionUrl }: { inspectionUrl: string }) => ({
        indexStatusResult: inspectResults[inspectionUrl] ?? { verdict: 'FAIL' },
      })),
    },
    httpClient: mkHttpClient(),
  }
}

// Defined at module level but re-initialized with beforeEach due to clearMocks: true in vitest config
let fetchSitemap: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchSitemap = vi.fn().mockResolvedValue(['https://a/1', 'https://a/2', 'https://a/3'])
})

describe('runInspectSitemap', () => {
  it('inspects every URL and aggregates summary', async () => {
    const client = mkClient({
      'https://a/1': { verdict: 'PASS' },
      'https://a/2': { verdict: 'PASS' },
      'https://a/3': { verdict: 'FAIL' },
    })
    const { data, exitCode } = await runInspectSitemap({
      client: client as never,
      siteUrl: 'https://a/',
      concurrency: 2,
      fetchSitemap,
    })
    expect(data.summary.total).toBe(3)
    expect(data.summary.indexed).toBe(2)
    expect(data.summary.notIndexed).toBe(1)
    expect(data.results).toHaveLength(3)
    expect(exitCode).toBe(2)
  })

  it('exits 0 when every URL is indexed', async () => {
    const client = mkClient({
      'https://a/1': { verdict: 'PASS' },
      'https://a/2': { verdict: 'PASS' },
      'https://a/3': { verdict: 'PASS' },
    })
    const { exitCode } = await runInspectSitemap({
      client: client as never,
      siteUrl: 'https://a/',
      concurrency: 3,
      fetchSitemap,
    })
    expect(exitCode).toBe(0)
  })

  it('captures per-URL failures without aborting batch', async () => {
    const client = {
      sitemaps: { list: vi.fn() },
      inspection: {
        inspect: vi.fn().mockImplementation(async ({ inspectionUrl }: { inspectionUrl: string }) => {
          if (inspectionUrl === 'https://a/2') throw new Error('boom')
          return { indexStatusResult: { verdict: 'PASS' } }
        }),
      },
      httpClient: mkHttpClient(),
    }
    const { data } = await runInspectSitemap({
      client: client as never,
      siteUrl: 'https://a/',
      concurrency: 1,
      sitemapUrl: 'https://a/sitemap.xml',
      fetchSitemap,
    })
    expect(data.summary.errors).toBe(1)
    expect(data.failures).toHaveLength(1)
    expect(data.failures[0]!.url).toBe('https://a/2')
  })

  it('exits 7 when ALL URLs fail', async () => {
    const client = {
      sitemaps: { list: vi.fn() },
      inspection: {
        inspect: vi.fn().mockRejectedValue(new Error('network error')),
      },
      httpClient: mkHttpClient(),
    }
    const fetchAll = vi.fn().mockResolvedValue(['https://a/1', 'https://a/2'])
    const { exitCode } = await runInspectSitemap({
      client: client as never,
      siteUrl: 'https://a/',
      concurrency: 1,
      sitemapUrl: 'https://a/sitemap.xml',
      fetchSitemap: fetchAll,
    })
    expect(exitCode).toBe(7)
  })

  it('applies indexed filter', async () => {
    const client = mkClient({
      'https://a/1': { verdict: 'PASS' },
      'https://a/2': { verdict: 'FAIL' },
      'https://a/3': { verdict: 'PASS' },
    })
    const { data } = await runInspectSitemap({
      client: client as never,
      siteUrl: 'https://a/',
      concurrency: 1,
      filter: 'indexed',
      fetchSitemap,
    })
    expect(data.results.every((r) => r.indexed)).toBe(true)
    expect(data.results).toHaveLength(2)
  })

  it('picks first sitemap from list when no sitemapUrl given', async () => {
    const client = mkClient({ 'https://a/1': { verdict: 'PASS' }, 'https://a/2': { verdict: 'PASS' }, 'https://a/3': { verdict: 'PASS' } })
    const fetchFn = vi.fn().mockResolvedValue(['https://a/1'])
    await runInspectSitemap({
      client: client as never,
      siteUrl: 'https://a/',
      fetchSitemap: fetchFn,
    })
    expect(fetchFn).toHaveBeenCalledWith('https://a/sitemap.xml')
  })
})
