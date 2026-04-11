import { describe, it, expect, vi } from 'vitest'
import { AnalyticsResource } from '../../src/resources/analytics.js'
import type { HttpClient } from '../../src/transport/http-client.js'

function mockHttp() {
  return { request: vi.fn() } as unknown as HttpClient & { request: ReturnType<typeof vi.fn> }
}

describe('AnalyticsResource', () => {
  it('POSTs searchAnalytics/query with JSON body and returns rows', async () => {
    const http = mockHttp()
    http.request.mockResolvedValue({
      rows: [{ keys: ['/'], clicks: 1, impressions: 2, ctr: 0.5, position: 1 }],
    })
    const r = new AnalyticsResource(http)
    const out = await r.query({
      siteUrl: 'https://a/',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      dimensions: ['page'],
      rowLimit: 100,
    })
    expect(out.rows).toHaveLength(1)
    expect(http.request).toHaveBeenCalledOnce()
    const call = http.request.mock.calls[0]![0] as { method: string; path: string; body: unknown }
    expect(call.method).toBe('POST')
    expect(call.path).toBe(`/sites/${encodeURIComponent('https://a/')}/searchAnalytics/query`)
    expect(call.body).toMatchObject({
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      dimensions: ['page'],
      rowLimit: 100,
      startRow: 0,
    })
  })

  it('auto-paginates when rowLimit > 25000', async () => {
    const http = mockHttp()
    const page1 = {
      rows: Array.from({ length: 25_000 }, (_, i) => ({
        keys: [`k${i}`],
        clicks: 0,
        impressions: 0,
        ctr: 0,
        position: 0,
      })),
    }
    const page2 = {
      rows: Array.from({ length: 5_000 }, (_, i) => ({
        keys: [`k${25_000 + i}`],
        clicks: 0,
        impressions: 0,
        ctr: 0,
        position: 0,
      })),
    }
    http.request.mockResolvedValueOnce(page1).mockResolvedValueOnce(page2)
    const r = new AnalyticsResource(http)
    const out = await r.query({
      siteUrl: 'https://a/',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      dimensions: ['query'],
      rowLimit: 30_000,
    })
    expect(out.rows).toHaveLength(30_000)
    expect(http.request).toHaveBeenCalledTimes(2)
    const call2 = http.request.mock.calls[1]![0] as { body: { startRow: number; rowLimit: number } }
    expect(call2.body.startRow).toBe(25_000)
    expect(call2.body.rowLimit).toBe(5_000)
  })

  it('stops paginating when a page is short', async () => {
    const http = mockHttp()
    http.request.mockResolvedValueOnce({
      rows: Array.from({ length: 12_345 }, () => ({
        clicks: 0,
        impressions: 0,
        ctr: 0,
        position: 0,
      })),
    })
    const r = new AnalyticsResource(http)
    const out = await r.query({
      siteUrl: 'https://a/',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      rowLimit: 30_000,
    })
    expect(out.rows).toHaveLength(12_345)
    expect(http.request).toHaveBeenCalledOnce()
  })

  it('uses default rowLimit of 1000 when not specified', async () => {
    const http = mockHttp()
    http.request.mockResolvedValue({ rows: [] })
    const r = new AnalyticsResource(http)
    await r.query({ siteUrl: 'https://a/', startDate: '2026-01-01', endDate: '2026-01-31' })
    const call = http.request.mock.calls[0]![0] as { body: { rowLimit: number } }
    expect(call.body.rowLimit).toBe(1000)
  })

  it('handles empty rows response', async () => {
    const http = mockHttp()
    http.request.mockResolvedValue({})
    const r = new AnalyticsResource(http)
    const out = await r.query({
      siteUrl: 'https://a/',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      rowLimit: 100,
    })
    expect(out.rows).toEqual([])
  })

  it('passes optional body fields when set', async () => {
    const http = mockHttp()
    http.request.mockResolvedValue({ rows: [] })
    const r = new AnalyticsResource(http)
    await r.query({
      siteUrl: 'https://a/',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      type: 'web',
      dataState: 'final',
      dimensionFilterGroups: [{ filters: [{ dimension: 'query', expression: 'test' }] }],
      rowLimit: 10,
    })
    const call = http.request.mock.calls[0]![0] as { body: Record<string, unknown> }
    expect(call.body.type).toBe('web')
    expect(call.body.dataState).toBe('final')
    expect(call.body.dimensionFilterGroups).toBeDefined()
  })

  it('includes _pagination.pagesFetched=1 for single-page response', async () => {
    const http = mockHttp()
    http.request.mockResolvedValue({ rows: [{ keys: ['/'], clicks: 1, impressions: 2, ctr: 0.5, position: 1 }] })
    const r = new AnalyticsResource(http)
    const out = await r.query({
      siteUrl: 'https://a/',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      rowLimit: 100,
    })
    expect(out._pagination?.pagesFetched).toBe(1)
    expect(out._pagination?.totalRowsFetched).toBe(1)
  })

  it('includes _pagination.pagesFetched=2 for multi-page response', async () => {
    const http = mockHttp()
    const page1 = {
      rows: Array.from({ length: 25_000 }, (_, i) => ({
        keys: [`k${i}`],
        clicks: 0,
        impressions: 0,
        ctr: 0,
        position: 0,
      })),
    }
    const page2 = {
      rows: Array.from({ length: 1000 }, (_, i) => ({
        keys: [`k${25_000 + i}`],
        clicks: 0,
        impressions: 0,
        ctr: 0,
        position: 0,
      })),
    }
    http.request.mockResolvedValueOnce(page1).mockResolvedValueOnce(page2)
    const r = new AnalyticsResource(http)
    const out = await r.query({
      siteUrl: 'https://a/',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      rowLimit: 26_000,
    })
    expect(out._pagination?.pagesFetched).toBe(2)
    expect(out._pagination?.totalRowsFetched).toBe(26_000)
  })
})
