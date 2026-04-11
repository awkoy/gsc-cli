import { describe, it, expect, vi } from 'vitest'
import { SitesResource } from '../../src/resources/sites.js'
import type { HttpClient } from '../../src/transport/http-client.js'

function mockHttp() {
  return { request: vi.fn() } as unknown as HttpClient & { request: ReturnType<typeof vi.fn> }
}

describe('SitesResource', () => {
  it('list GETs /sites and returns raw SitesListResponse', async () => {
    const http = mockHttp()
    http.request.mockResolvedValue({ siteEntry: [{ siteUrl: 'https://a/', permissionLevel: 'siteOwner' }] })
    const sites = new SitesResource(http)
    const out = await sites.list()
    expect(out).toEqual({ siteEntry: [{ siteUrl: 'https://a/', permissionLevel: 'siteOwner' }] })
    expect(http.request).toHaveBeenCalledWith({ method: 'GET', path: '/sites' })
  })

  it('list returns raw response even when siteEntry is missing', async () => {
    const http = mockHttp()
    http.request.mockResolvedValue({})
    const sites = new SitesResource(http)
    const out = await sites.list()
    expect(out).toEqual({})
    expect(out.siteEntry).toBeUndefined()
  })

  it('get encodes siteUrl in path', async () => {
    const http = mockHttp()
    http.request.mockResolvedValue({ siteUrl: 'https://a/', permissionLevel: 'siteOwner' })
    const sites = new SitesResource(http)
    await sites.get('https://a/')
    expect(http.request).toHaveBeenCalledWith({
      method: 'GET',
      path: `/sites/${encodeURIComponent('https://a/')}`,
    })
  })

  it('get returns SiteEntry', async () => {
    const http = mockHttp()
    http.request.mockResolvedValue({ siteUrl: 'https://b/', permissionLevel: 'siteFullUser' })
    const sites = new SitesResource(http)
    const out = await sites.get('https://b/')
    expect(out.siteUrl).toBe('https://b/')
    expect(out.permissionLevel).toBe('siteFullUser')
  })

  it('add PUTs /sites/:url', async () => {
    const http = mockHttp()
    http.request.mockResolvedValue({})
    const sites = new SitesResource(http)
    await sites.add('https://a/')
    expect(http.request).toHaveBeenCalledWith({
      method: 'PUT',
      path: `/sites/${encodeURIComponent('https://a/')}`,
    })
  })

  it('delete DELETEs /sites/:url', async () => {
    const http = mockHttp()
    http.request.mockResolvedValue({})
    const sites = new SitesResource(http)
    await sites.delete('https://a/')
    expect(http.request).toHaveBeenCalledWith({
      method: 'DELETE',
      path: `/sites/${encodeURIComponent('https://a/')}`,
    })
  })
})
