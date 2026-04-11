import type { GSCClient, Dimension, SearchType, AnalyticsQueryInput, AnalyticsFilter } from '@gsc-cli/sdk'

type Client = Pick<GSCClient, 'analytics' | 'httpClient'>

export interface AnalyticsQueryOptions {
  client: Client
  siteUrl: string
  start?: string
  end?: string
  days?: number
  dimensions?: Dimension[]
  limit?: number
  type?: SearchType
  filters?: string[]
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Parse a filter string into an AnalyticsFilter.
 *
 * Supported operators (in order of matching, longest first):
 *   =~  → includingRegex
 *   !=~ → excludingRegex
 *   !=  → notEquals
 *   !~  → notContains
 *   =   → equals
 *   ~   → contains
 */
type FilterOperator = NonNullable<AnalyticsFilter['operator']>

function parseFilter(raw: string): AnalyticsFilter {
  const operators: Array<[string, FilterOperator]> = [
    ['!=~', 'excludingRegex'],
    ['=~', 'includingRegex'],
    ['!=', 'notEquals'],
    ['!~', 'notContains'],
    ['~', 'contains'],
    ['=', 'equals'],
  ]
  for (const [op, operator] of operators) {
    const idx = raw.indexOf(op)
    if (idx > 0) {
      const dimension = raw.slice(0, idx).trim() as Dimension
      const expression = raw.slice(idx + op.length).trim()
      return { dimension, operator, expression }
    }
  }
  throw Object.assign(new Error(`invalid filter expression: ${raw}`), {
    code: 'BAD_ARGS',
    hint: 'Filter format: dim=value, dim!=value, dim~value, dim!~value, dim=~regex, dim!=~regex',
  })
}

export async function runAnalyticsQuery(options: AnalyticsQueryOptions) {
  const endDate = options.end ?? toIsoDate(new Date())
  let startDate = options.start
  if (startDate === undefined) {
    if (options.days === undefined) {
      throw Object.assign(new Error('must specify --start or --days'), {
        code: 'BAD_ARGS',
        hint: 'Use --days 30 for the last 30 days, or --start 2026-01-01 --end 2026-01-31',
      })
    }
    const end = new Date(endDate)
    end.setUTCDate(end.getUTCDate() - options.days)
    startDate = toIsoDate(end)
  }
  const queryInput: AnalyticsQueryInput = {
    siteUrl: options.siteUrl,
    startDate,
    endDate,
    rowLimit: options.limit ?? 1000,
  }
  if (options.dimensions !== undefined) queryInput.dimensions = options.dimensions
  if (options.type !== undefined) queryInput.type = options.type
  if (options.filters !== undefined && options.filters.length > 0) {
    queryInput.dimensionFilterGroups = [
      { filters: options.filters.map(parseFilter) },
    ]
  }
  const result = await options.client.analytics.query(queryInput)
  const snap = options.client.httpClient.rateLimitSnapshot()
  const rateLimit = snap.remaining !== -1 ? snap : undefined
  return rateLimit !== undefined
    ? { data: result, rateLimit }
    : { data: result }
}
