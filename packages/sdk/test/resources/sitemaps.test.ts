import { describe, it, expect, vi } from 'vitest'
import { SitemapsResource } from '../../src/resources/sitemaps.js'
import type { HttpClient } from '../../src/transport/http-client.js'

function mockHttp() {
  return { request: vi.fn() } as unknown as HttpClient & { request: ReturnType<typeof vi.fn> }
}

const SITE = 'https://a/'
const FEED = 'sitemap.xml'
const SITE_ENC = encodeURIComponent(SITE)
const FEED_ENC = encodeURIComponent(FEED)

describe('SitemapsResource', () => {
  it('list returns raw SitemapsListResponse', async () => {
    const http = mockHttp()
    http.request.mockResolvedValue({ sitemap: [{ path: 'https://a/sitemap.xml' }] })
    const r = new SitemapsResource(http)
    const out = await r.list({ siteUrl: SITE })
    expect(out).toEqual({ sitemap: [{ path: 'https://a/sitemap.xml' }] })
    expect(http.request).toHaveBeenCalledWith({ method: 'GET', path: `/sites/${SITE_ENC}/sitemaps` })
  })

  it('list returns empty response when sitemap is missing', async () => {
    const http = mockHttp()
    http.request.mockResolvedValue({})
    const r = new SitemapsResource(http)
    const out = await r.list({ siteUrl: SITE })
    expect(out).toEqual({})
    expect(out.sitemap).toBeUndefined()
  })

  it('get GETs the feedpath', async () => {
    const http = mockHttp()
    http.request.mockResolvedValue({ path: 'https://a/sitemap.xml' })
    const r = new SitemapsResource(http)
    await r.get({ siteUrl: SITE, feedpath: FEED })
    expect(http.request).toHaveBeenCalledWith({
      method: 'GET',
      path: `/sites/${SITE_ENC}/sitemaps/${FEED_ENC}`,
    })
  })

  it('submit PUTs', async () => {
    const http = mockHttp()
    http.request.mockResolvedValue({})
    const r = new SitemapsResource(http)
    await r.submit({ siteUrl: SITE, feedpath: FEED })
    expect(http.request).toHaveBeenCalledWith({
      method: 'PUT',
      path: `/sites/${SITE_ENC}/sitemaps/${FEED_ENC}`,
    })
  })

  it('delete DELETEs', async () => {
    const http = mockHttp()
    http.request.mockResolvedValue({})
    const r = new SitemapsResource(http)
    await r.delete({ siteUrl: SITE, feedpath: FEED })
    expect(http.request).toHaveBeenCalledWith({
      method: 'DELETE',
      path: `/sites/${SITE_ENC}/sitemaps/${FEED_ENC}`,
    })
  })
})
