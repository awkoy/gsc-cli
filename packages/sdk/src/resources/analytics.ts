import type { AnalyticsQueryInput, AnalyticsQueryResponse, AnalyticsRow } from '../types.js'
import type { HttpClient } from '../transport/http-client.js'

const GOOGLE_MAX_ROWS_PER_PAGE = 25_000

export class AnalyticsResource {
  constructor(readonly httpClient: HttpClient) {}

  async query(input: AnalyticsQueryInput): Promise<AnalyticsQueryResponse> {
    const target = input.rowLimit ?? 1000
    const collected: AnalyticsRow[] = []
    let startRow = input.startRow ?? 0
    let aggregation: string | undefined
    let pagesFetched = 0

    while (collected.length < target) {
      const remaining = target - collected.length
      const pageSize = Math.min(remaining, GOOGLE_MAX_ROWS_PER_PAGE)
      const body: Record<string, unknown> = {
        startDate: input.startDate,
        endDate: input.endDate,
        rowLimit: pageSize,
        startRow,
      }
      if (input.dimensions !== undefined) body.dimensions = input.dimensions
      if (input.type !== undefined) body.type = input.type
      if (input.dimensionFilterGroups !== undefined) body.dimensionFilterGroups = input.dimensionFilterGroups
      if (input.dataState !== undefined) body.dataState = input.dataState

      const res = await this.httpClient.request<AnalyticsQueryResponse>({
        method: 'POST',
        path: `/sites/${encodeURIComponent(input.siteUrl)}/searchAnalytics/query`,
        body,
      })
      pagesFetched++
      const rows = res.rows ?? []
      collected.push(...rows)
      aggregation = res.responseAggregationType ?? aggregation
      if (rows.length < pageSize) break
      startRow += rows.length
    }

    const response: AnalyticsQueryResponse = {
      rows: collected,
      _pagination: { pagesFetched, totalRowsFetched: collected.length },
    }
    if (aggregation !== undefined) response.responseAggregationType = aggregation
    return response
  }
}
