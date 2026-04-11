import pLimit from 'p-limit'
import type { GSCClient, InspectionResult } from '@gsc-cli/sdk'
import { fetchSitemapUrls } from '../sitemap/fetch-sitemap.js'
import { EXIT_CODES } from '../output/envelope.js'

type Client = Pick<GSCClient, 'sitemaps' | 'inspection' | 'httpClient'>

export interface InspectSitemapOptions {
  client: Client
  siteUrl: string
  sitemapUrl?: string
  concurrency?: number
  filter?: 'indexed' | 'not-indexed' | 'errors'
  fetchSitemap?: (url: string) => Promise<string[]>
}

interface PerUrlResult {
  url: string
  verdict: string | undefined
  indexed: boolean
  indexStatus: InspectionResult['indexStatusResult'] | undefined
}

interface FailureRecord {
  url: string
  error: { code: string; message: string }
}

export async function runInspectSitemap(options: InspectSitemapOptions) {
  const concurrency = options.concurrency ?? 4
  const limit = pLimit(concurrency)
  const fetcher = options.fetchSitemap ?? fetchSitemapUrls

  let resolvedSitemapUrl: string
  if (options.sitemapUrl !== undefined) {
    resolvedSitemapUrl = options.sitemapUrl
  } else {
    const res = await options.client.sitemaps.list({ siteUrl: options.siteUrl })
    const sitemaps = res.sitemap ?? []
    if (sitemaps.length === 0) {
      throw Object.assign(new Error(`no sitemaps registered for ${options.siteUrl}`), {
        code: 'BAD_ARGS',
        hint: 'Submit a sitemap first with `gsc sitemaps submit <feedpath> --site <url>`',
      })
    }
    resolvedSitemapUrl = sitemaps[0]!.path
  }

  const urls = await fetcher(resolvedSitemapUrl)
  const results: PerUrlResult[] = []
  const failures: FailureRecord[] = []

  await Promise.all(
    urls.map((url) =>
      limit(async () => {
        try {
          const res = await options.client.inspection.inspect({
            siteUrl: options.siteUrl,
            inspectionUrl: url,
          })
          const verdict = res.indexStatusResult?.verdict
          results.push({
            url,
            verdict,
            indexed: verdict === 'PASS',
            indexStatus: res.indexStatusResult,
          })
        } catch (err) {
          const code = (err as { code?: string }).code ?? 'INTERNAL_ERROR'
          const message = err instanceof Error ? err.message : String(err)
          failures.push({ url, error: { code, message } })
        }
      }),
    ),
  )

  const filteredResults = applyFilter(results, options.filter)
  const indexed = results.filter((r) => r.indexed).length
  const notIndexed = results.filter((r) => !r.indexed).length
  const total = results.length + failures.length

  let exitCode: number
  if (results.length === 0 && failures.length > 0) {
    exitCode = EXIT_CODES.network
  } else if (notIndexed > 0) {
    exitCode = EXIT_CODES.semanticNegative
  } else {
    exitCode = EXIT_CODES.success
  }

  const snap = options.client.httpClient.rateLimitSnapshot()
  const rateLimit = snap.remaining !== -1 ? snap : undefined
  const data = {
    sitemapUrl: resolvedSitemapUrl,
    summary: { total, indexed, notIndexed, errors: failures.length },
    results: filteredResults,
    failures,
  }
  return rateLimit !== undefined
    ? { data, exitCode, rateLimit }
    : { data, exitCode }
}

function applyFilter(
  results: PerUrlResult[],
  filter: 'indexed' | 'not-indexed' | 'errors' | undefined,
): PerUrlResult[] {
  if (filter === undefined) return results
  if (filter === 'indexed') return results.filter((r) => r.indexed)
  if (filter === 'not-indexed') return results.filter((r) => !r.indexed)
  return results.filter((r) => r.verdict !== undefined && r.verdict !== 'PASS' && r.verdict !== 'NEUTRAL')
}
