import type { SiteEntry } from '../types.js'
import type { HttpClient } from '../transport/http-client.js'

export interface SitesListResponse {
  siteEntry?: SiteEntry[]
}

export class SitesResource {
  constructor(readonly httpClient: HttpClient) {}

  async list(): Promise<SitesListResponse> {
    return this.httpClient.request<SitesListResponse>({ method: 'GET', path: '/sites' })
  }

  async get(siteUrl: string): Promise<SiteEntry> {
    return this.httpClient.request<SiteEntry>({
      method: 'GET',
      path: `/sites/${encodeURIComponent(siteUrl)}`,
    })
  }

  async add(siteUrl: string): Promise<void> {
    await this.httpClient.request<void>({
      method: 'PUT',
      path: `/sites/${encodeURIComponent(siteUrl)}`,
    })
  }

  async delete(siteUrl: string): Promise<void> {
    await this.httpClient.request<void>({
      method: 'DELETE',
      path: `/sites/${encodeURIComponent(siteUrl)}`,
    })
  }
}
