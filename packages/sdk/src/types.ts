export interface SiteEntry {
  siteUrl: string
  permissionLevel:
    | 'siteOwner'
    | 'siteFullUser'
    | 'siteRestrictedUser'
    | 'siteUnverifiedUser'
}

export interface SitemapContentEntry {
  type: string
  submitted: string
  indexed: string
}

export interface SitemapEntry {
  path: string
  lastSubmitted?: string
  isPending?: boolean
  isSitemapsIndex?: boolean
  type?: string
  lastDownloaded?: string
  warnings?: string
  errors?: string
  contents?: SitemapContentEntry[]
}

export type SearchType =
  | 'web'
  | 'image'
  | 'video'
  | 'news'
  | 'discover'
  | 'googleNews'

export type Dimension =
  | 'query'
  | 'page'
  | 'country'
  | 'device'
  | 'date'
  | 'searchAppearance'

export interface AnalyticsFilter {
  dimension: Dimension
  operator?:
    | 'contains'
    | 'equals'
    | 'notContains'
    | 'notEquals'
    | 'includingRegex'
    | 'excludingRegex'
  expression: string
}

export interface AnalyticsFilterGroup {
  filters: AnalyticsFilter[]
  groupType?: 'and'
}

export interface AnalyticsQueryInput {
  siteUrl: string
  startDate: string
  endDate: string
  dimensions?: Dimension[]
  type?: SearchType
  dimensionFilterGroups?: AnalyticsFilterGroup[]
  rowLimit?: number
  startRow?: number
  dataState?: 'final' | 'all'
}

export interface AnalyticsRow {
  keys?: string[]
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface AnalyticsQueryResponse {
  rows?: AnalyticsRow[]
  responseAggregationType?: string
  _pagination?: { pagesFetched: number; totalRowsFetched: number }
}

export interface InspectionInput {
  siteUrl: string
  inspectionUrl: string
  languageCode?: string
}

export interface InspectionIssue {
  issueType?: string
  severity?: string
  message?: string
  issueMessage?: string
}

export interface InspectionResult {
  inspectionResultLink?: string
  indexStatusResult?: {
    verdict?: 'VERDICT_UNSPECIFIED' | 'PASS' | 'PARTIAL' | 'FAIL' | 'NEUTRAL'
    coverageState?: string
    robotsTxtState?: string
    indexingState?: string
    lastCrawlTime?: string
    pageFetchState?: string
    googleCanonical?: string
    userCanonical?: string
    referringUrls?: string[]
    sitemap?: string[]
    crawledAs?: string
  }
  mobileUsabilityResult?: {
    verdict?: string
    issues?: InspectionIssue[]
  }
  richResultsResult?: {
    verdict?: string
    detectedItems?: Array<{
      richResultType?: string
      items?: Array<{
        name?: string
        issues?: InspectionIssue[]
      }>
    }>
  }
  ampResult?: {
    verdict?: string
    ampUrl?: string
    robotsTxtState?: string
    indexingState?: string
    ampIndexStatusVerdict?: string
    issues?: InspectionIssue[]
  }
}

export interface RateLimitSnapshot {
  remaining: number
  resetAt: string
}
