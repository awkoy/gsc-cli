import type { SitemapEntry } from '../types.js'
import type { HttpClient } from '../transport/http-client.js'

export interface SitemapRequest {
  siteUrl: string
  feedpath?: string
}

export interface SitemapsListResponse {
  sitemap?: SitemapEntry[]
}

export class SitemapsResource {
  constructor(readonly httpClient: HttpClient) {}

  async list(input: SitemapRequest): Promise<SitemapsListResponse> {
    return this.httpClient.request<SitemapsListResponse>({
      method: 'GET',
      path: `/sites/${encodeURIComponent(input.siteUrl)}/sitemaps`,
    })
  }

  async get(input: Required<SitemapRequest>): Promise<SitemapEntry> {
    return this.httpClient.request<SitemapEntry>({
      method: 'GET',
      path: `/sites/${encodeURIComponent(input.siteUrl)}/sitemaps/${encodeURIComponent(input.feedpath)}`,
    })
  }

  async submit(input: Required<SitemapRequest>): Promise<void> {
    await this.httpClient.request<void>({
      method: 'PUT',
      path: `/sites/${encodeURIComponent(input.siteUrl)}/sitemaps/${encodeURIComponent(input.feedpath)}`,
    })
  }

  async delete(input: Required<SitemapRequest>): Promise<void> {
    await this.httpClient.request<void>({
      method: 'DELETE',
      path: `/sites/${encodeURIComponent(input.siteUrl)}/sitemaps/${encodeURIComponent(input.feedpath)}`,
    })
  }
}
