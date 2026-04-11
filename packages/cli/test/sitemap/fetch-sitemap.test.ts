import { describe, it, expect, vi } from 'vitest'
import { fetchSitemapUrls } from '../../src/sitemap/fetch-sitemap.js'

function xmlResponse(body: string) {
  return new Response(body, { status: 200, headers: { 'content-type': 'application/xml' } })
}

describe('fetchSitemapUrls', () => {
  it('parses a flat urlset', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      xmlResponse(`<?xml version="1.0"?>
        <urlset>
          <url><loc>https://a/1</loc></url>
          <url><loc>https://a/2</loc></url>
        </urlset>`),
    )
    const urls = await fetchSitemapUrls('https://a/sitemap.xml', { fetch: fetchFn as typeof fetch })
    expect(urls).toEqual(['https://a/1', 'https://a/2'])
  })

  it('recurses into a sitemap index', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        xmlResponse(`<?xml version="1.0"?>
        <sitemapindex>
          <sitemap><loc>https://a/sub.xml</loc></sitemap>
        </sitemapindex>`),
      )
      .mockResolvedValueOnce(
        xmlResponse(`<?xml version="1.0"?>
        <urlset>
          <url><loc>https://a/x</loc></url>
        </urlset>`),
      )
    const urls = await fetchSitemapUrls('https://a/root.xml', { fetch: fetchFn as typeof fetch })
    expect(urls).toEqual(['https://a/x'])
  })

  it('dedupes across nested sitemaps', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        xmlResponse(`<?xml version="1.0"?>
        <sitemapindex>
          <sitemap><loc>https://a/a.xml</loc></sitemap>
          <sitemap><loc>https://a/b.xml</loc></sitemap>
        </sitemapindex>`),
      )
      .mockResolvedValueOnce(
        xmlResponse(`<?xml version="1.0"?>
        <urlset><url><loc>https://a/1</loc></url></urlset>`),
      )
      .mockResolvedValueOnce(
        xmlResponse(`<?xml version="1.0"?>
        <urlset><url><loc>https://a/1</loc></url></urlset>`),
      )
    const urls = await fetchSitemapUrls('https://a/root.xml', { fetch: fetchFn as typeof fetch })
    expect(urls).toEqual(['https://a/1'])
  })

  it('enforces depth limit of 5', async () => {
    // Must return a new Response each time since Response body can only be read once
    const fetchFn = vi.fn().mockImplementation(() =>
      Promise.resolve(
        xmlResponse(`<?xml version="1.0"?>
        <sitemapindex><sitemap><loc>https://a/deeper.xml</loc></sitemap></sitemapindex>`),
      ),
    )
    await expect(
      fetchSitemapUrls('https://a/top.xml', { fetch: fetchFn as typeof fetch }),
    ).rejects.toThrow(/depth/)
  })

  it('handles single url (not array) in urlset', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      xmlResponse(`<?xml version="1.0"?>
        <urlset>
          <url><loc>https://a/only</loc></url>
        </urlset>`),
    )
    const urls = await fetchSitemapUrls('https://a/sitemap.xml', { fetch: fetchFn as typeof fetch })
    expect(urls).toContain('https://a/only')
  })

  it('returns empty array for unknown XML structure', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      xmlResponse(`<?xml version="1.0"?><unknown></unknown>`),
    )
    const urls = await fetchSitemapUrls('https://a/sitemap.xml', { fetch: fetchFn as typeof fetch })
    expect(urls).toEqual([])
  })
})
