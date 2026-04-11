import { describe, it, expect, vi } from 'vitest'
import { runSitesList, runSitesGet, runSitesAdd, runSitesDelete } from '../../src/commands/sites.js'
import { runSitemapsList, runSitemapsSubmit, runSitemapsGet, runSitemapsDelete } from '../../src/commands/sitemaps.js'
import { runAnalyticsQuery } from '../../src/commands/analytics.js'
import { runInspectUrl } from '../../src/commands/inspect.js'

// Fake client types matching the actual SDK method signatures
type Client = {
  sites: {
    list: ReturnType<typeof vi.fn>
    get: ReturnType<typeof vi.fn>
    add: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
  sitemaps: {
    list: ReturnType<typeof vi.fn>
    get: ReturnType<typeof vi.fn>
    submit: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
  analytics: { query: ReturnType<typeof vi.fn> }
  inspection: { inspect: ReturnType<typeof vi.fn> }
  httpClient: { rateLimitSnapshot: ReturnType<typeof vi.fn> }
}

function mkClient(): Client {
  return {
    sites: {
      list: vi.fn(),
      get: vi.fn(),
      add: vi.fn(),
      delete: vi.fn(),
    },
    sitemaps: {
      list: vi.fn(),
      get: vi.fn(),
      submit: vi.fn(),
      delete: vi.fn(),
    },
    analytics: { query: vi.fn() },
    inspection: { inspect: vi.fn() },
    httpClient: { rateLimitSnapshot: vi.fn().mockReturnValue({ remaining: -1, resetAt: '' }) },
  }
}

describe('sites commands', () => {
  it('list unwraps siteEntry array', async () => {
    const c = mkClient()
    // The real SDK returns { siteEntry?: SiteEntry[] }
    c.sites.list.mockResolvedValue({ siteEntry: [{ siteUrl: 'https://a/', permissionLevel: 'siteOwner' }] })
    const { data } = await runSitesList({ client: c as never })
    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({ siteUrl: 'https://a/' })
  })

  it('list returns empty array when siteEntry missing', async () => {
    const c = mkClient()
    c.sites.list.mockResolvedValue({})
    const { data } = await runSitesList({ client: c as never })
    expect(data).toEqual([])
  })

  it('get passes siteUrl through', async () => {
    const c = mkClient()
    c.sites.get.mockResolvedValue({ siteUrl: 'https://a/', permissionLevel: 'siteOwner' })
    await runSitesGet({ client: c as never, siteUrl: 'https://a/' })
    expect(c.sites.get).toHaveBeenCalledWith('https://a/')
  })

  it('add passes siteUrl through', async () => {
    const c = mkClient()
    c.sites.add.mockResolvedValue(undefined)
    const { data } = await runSitesAdd({ client: c as never, siteUrl: 'https://a/' })
    expect(c.sites.add).toHaveBeenCalledWith('https://a/')
    expect(data.added).toBe(true)
  })

  it('delete passes siteUrl through', async () => {
    const c = mkClient()
    c.sites.delete.mockResolvedValue(undefined)
    const { data } = await runSitesDelete({ client: c as never, siteUrl: 'https://a/' })
    expect(c.sites.delete).toHaveBeenCalledWith('https://a/')
    expect(data.deleted).toBe(true)
  })
})

describe('sitemaps commands', () => {
  it('list unwraps sitemap array', async () => {
    const c = mkClient()
    // The real SDK returns { sitemap?: SitemapEntry[] }
    c.sitemaps.list.mockResolvedValue({ sitemap: [{ path: 'https://a/sitemap.xml' }] })
    const { data } = await runSitemapsList({ client: c as never, siteUrl: 'https://a/' })
    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({ path: 'https://a/sitemap.xml' })
  })

  it('list returns empty array when sitemap missing', async () => {
    const c = mkClient()
    c.sitemaps.list.mockResolvedValue({})
    const { data } = await runSitemapsList({ client: c as never, siteUrl: 'https://a/' })
    expect(data).toEqual([])
  })

  it('get passes siteUrl and feedpath through', async () => {
    const c = mkClient()
    c.sitemaps.get.mockResolvedValue({ path: 'sitemap.xml' })
    await runSitemapsGet({ client: c as never, siteUrl: 'https://a/', feedpath: 'sitemap.xml' })
    expect(c.sitemaps.get).toHaveBeenCalledWith({ siteUrl: 'https://a/', feedpath: 'sitemap.xml' })
  })

  it('submit calls with feedpath', async () => {
    const c = mkClient()
    c.sitemaps.submit.mockResolvedValue(undefined)
    const { data } = await runSitemapsSubmit({ client: c as never, siteUrl: 'https://a/', feedpath: 'sitemap.xml' })
    expect(c.sitemaps.submit).toHaveBeenCalledWith({ siteUrl: 'https://a/', feedpath: 'sitemap.xml' })
    expect(data.submitted).toBe(true)
  })

  it('delete calls with feedpath', async () => {
    const c = mkClient()
    c.sitemaps.delete.mockResolvedValue(undefined)
    const { data } = await runSitemapsDelete({ client: c as never, siteUrl: 'https://a/', feedpath: 'sitemap.xml' })
    expect(c.sitemaps.delete).toHaveBeenCalledWith({ siteUrl: 'https://a/', feedpath: 'sitemap.xml' })
    expect(data.deleted).toBe(true)
  })
})

describe('analytics query', () => {
  it('computes date range from --days', async () => {
    const c = mkClient()
    c.analytics.query.mockResolvedValue({ rows: [] })
    vi.setSystemTime(new Date('2026-04-11T00:00:00Z'))
    await runAnalyticsQuery({
      client: c as never,
      siteUrl: 'https://a/',
      days: 30,
      dimensions: ['page'],
      limit: 500,
    })
    const arg = c.analytics.query.mock.calls[0]![0]
    expect(arg.siteUrl).toBe('https://a/')
    expect(arg.startDate).toBe('2026-03-12')
    expect(arg.endDate).toBe('2026-04-11')
    expect(arg.rowLimit).toBe(500)
    expect(arg.dimensions).toEqual(['page'])
    vi.useRealTimers()
  })

  it('uses explicit --start and --end when provided', async () => {
    const c = mkClient()
    c.analytics.query.mockResolvedValue({ rows: [] })
    await runAnalyticsQuery({
      client: c as never,
      siteUrl: 'https://a/',
      start: '2026-01-01',
      end: '2026-01-31',
    })
    const arg = c.analytics.query.mock.calls[0]![0]
    expect(arg.startDate).toBe('2026-01-01')
    expect(arg.endDate).toBe('2026-01-31')
  })

  it('throws when neither --start nor --days provided', async () => {
    const c = mkClient()
    await expect(runAnalyticsQuery({ client: c as never, siteUrl: 'https://a/' })).rejects.toThrow(
      /start|days/,
    )
  })

  it('parses equals filter correctly', async () => {
    const c = mkClient()
    c.analytics.query.mockResolvedValue({ rows: [] })
    await runAnalyticsQuery({
      client: c as never,
      siteUrl: 'https://a/',
      start: '2026-01-01',
      end: '2026-01-31',
      filters: ['country=USA'],
    })
    const arg = c.analytics.query.mock.calls[0]![0]
    expect(arg.dimensionFilterGroups).toEqual([
      { filters: [{ dimension: 'country', operator: 'equals', expression: 'USA' }] },
    ])
  })

  it('parses contains filter correctly', async () => {
    const c = mkClient()
    c.analytics.query.mockResolvedValue({ rows: [] })
    await runAnalyticsQuery({
      client: c as never,
      siteUrl: 'https://a/',
      start: '2026-01-01',
      end: '2026-01-31',
      filters: ['page~/blog/'],
    })
    const arg = c.analytics.query.mock.calls[0]![0]
    expect(arg.dimensionFilterGroups).toEqual([
      { filters: [{ dimension: 'page', operator: 'contains', expression: '/blog/' }] },
    ])
  })

  it('parses notEquals filter correctly', async () => {
    const c = mkClient()
    c.analytics.query.mockResolvedValue({ rows: [] })
    await runAnalyticsQuery({
      client: c as never,
      siteUrl: 'https://a/',
      start: '2026-01-01',
      end: '2026-01-31',
      filters: ['query!=test'],
    })
    const arg = c.analytics.query.mock.calls[0]![0]
    expect(arg.dimensionFilterGroups).toEqual([
      { filters: [{ dimension: 'query', operator: 'notEquals', expression: 'test' }] },
    ])
  })

  it('parses multiple filters as a single filter group', async () => {
    const c = mkClient()
    c.analytics.query.mockResolvedValue({ rows: [] })
    await runAnalyticsQuery({
      client: c as never,
      siteUrl: 'https://a/',
      start: '2026-01-01',
      end: '2026-01-31',
      filters: ['country=USA', 'device=DESKTOP'],
    })
    const arg = c.analytics.query.mock.calls[0]![0]
    expect(arg.dimensionFilterGroups[0].filters).toHaveLength(2)
  })

  it('throws hint on invalid filter expression', async () => {
    const c = mkClient()
    await expect(
      runAnalyticsQuery({
        client: c as never,
        siteUrl: 'https://a/',
        start: '2026-01-01',
        filters: ['invalidfilter'],
      }),
    ).rejects.toMatchObject({ code: 'BAD_ARGS' })
  })

  it('parses ~ (contains) filter', async () => {
    const c = mkClient()
    c.analytics.query.mockResolvedValue({ rows: [] })
    await runAnalyticsQuery({
      client: c as never,
      siteUrl: 'https://a/',
      start: '2026-01-01',
      filters: ['page~/blog/'],
    })
    const f = c.analytics.query.mock.calls[0]![0].dimensionFilterGroups[0].filters[0]
    expect(f.dimension).toBe('page')
    expect(f.operator).toBe('contains')
    expect(f.expression).toBe('/blog/')
  })

  it('parses !~ (notContains) filter', async () => {
    const c = mkClient()
    c.analytics.query.mockResolvedValue({ rows: [] })
    await runAnalyticsQuery({
      client: c as never,
      siteUrl: 'https://a/',
      start: '2026-01-01',
      filters: ['query!~test'],
    })
    const f = c.analytics.query.mock.calls[0]![0].dimensionFilterGroups[0].filters[0]
    expect(f.operator).toBe('notContains')
  })

  it('parses =~ (includingRegex) filter', async () => {
    const c = mkClient()
    c.analytics.query.mockResolvedValue({ rows: [] })
    await runAnalyticsQuery({
      client: c as never,
      siteUrl: 'https://a/',
      start: '2026-01-01',
      filters: ['page=~^/blog/.*'],
    })
    const f = c.analytics.query.mock.calls[0]![0].dimensionFilterGroups[0].filters[0]
    expect(f.operator).toBe('includingRegex')
    expect(f.expression).toBe('^/blog/.*')
  })

  it('parses !=~ (excludingRegex) filter', async () => {
    const c = mkClient()
    c.analytics.query.mockResolvedValue({ rows: [] })
    await runAnalyticsQuery({
      client: c as never,
      siteUrl: 'https://a/',
      start: '2026-01-01',
      filters: ['page!=~^/tmp/'],
    })
    const f = c.analytics.query.mock.calls[0]![0].dimensionFilterGroups[0].filters[0]
    expect(f.operator).toBe('excludingRegex')
    expect(f.expression).toBe('^/tmp/')
  })
})

describe('inspect single url', () => {
  it('returns PASS verdict with exit 0', async () => {
    const c = mkClient()
    c.inspection.inspect.mockResolvedValue({ indexStatusResult: { verdict: 'PASS' } })
    const { data, exitCode } = await runInspectUrl({
      client: c as never,
      siteUrl: 'https://a/',
      url: 'https://a/p',
    })
    expect(data.verdict).toBe('PASS')
    expect(data.indexed).toBe(true)
    expect(exitCode).toBe(0)
  })

  it('returns FAIL verdict with exit 2 (semantic negative)', async () => {
    const c = mkClient()
    c.inspection.inspect.mockResolvedValue({ indexStatusResult: { verdict: 'FAIL' } })
    const { data, exitCode } = await runInspectUrl({
      client: c as never,
      siteUrl: 'https://a/',
      url: 'https://a/p',
    })
    expect(data.verdict).toBe('FAIL')
    expect(data.indexed).toBe(false)
    expect(exitCode).toBe(2)
  })

  it('includes all inspection fields in data', async () => {
    const c = mkClient()
    c.inspection.inspect.mockResolvedValue({
      indexStatusResult: { verdict: 'PASS' },
      mobileUsabilityResult: { verdict: 'PASS' },
    })
    const { data } = await runInspectUrl({
      client: c as never,
      siteUrl: 'https://a/',
      url: 'https://a/p',
    })
    expect(data.url).toBe('https://a/p')
    expect(data.indexStatus).toBeDefined()
    expect(data.mobileUsability).toBeDefined()
  })
})
