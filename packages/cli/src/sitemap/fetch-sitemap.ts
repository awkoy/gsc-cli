import { XMLParser } from 'fast-xml-parser'

const MAX_DEPTH = 5

export interface FetchSitemapOptions {
  fetch?: typeof fetch
  maxDepth?: number
}

const parser = new XMLParser({ ignoreAttributes: true, trimValues: true })

interface ParsedSitemap {
  urls: string[]
  nestedSitemaps: string[]
}

type AnyRecord = Record<string, unknown>

function extractLocs(container: AnyRecord, key: string): string[] {
  const raw = container[key]
  const entries: AnyRecord[] = Array.isArray(raw)
    ? raw
    : raw !== undefined
      ? [raw as AnyRecord]
      : []
  return entries
    .map((e) => e['loc'])
    .filter((loc): loc is string => typeof loc === 'string')
}

function parseSitemap(xml: string): ParsedSitemap {
  const doc = parser.parse(xml) as AnyRecord
  const urlset = doc['urlset'] as AnyRecord | undefined
  const index = doc['sitemapindex'] as AnyRecord | undefined

  if (urlset !== undefined) {
    return { urls: extractLocs(urlset, 'url'), nestedSitemaps: [] }
  }
  if (index !== undefined) {
    return { urls: [], nestedSitemaps: extractLocs(index, 'sitemap') }
  }
  return { urls: [], nestedSitemaps: [] }
}

export async function fetchSitemapUrls(
  rootUrl: string,
  options: FetchSitemapOptions = {},
): Promise<string[]> {
  const fetchImpl = options.fetch ?? fetch
  const maxDepth = options.maxDepth ?? MAX_DEPTH
  const collected = new Set<string>()

  async function walk(url: string, depth: number): Promise<void> {
    if (depth > maxDepth)
      throw Object.assign(new Error(`sitemap depth limit (${maxDepth}) exceeded`), {
        code: 'SITEMAP_DEPTH',
        hint: `The sitemap index nests too deeply (max ${maxDepth} levels)`,
      })
    const res = await fetchImpl(url)
    if (!res.ok)
      throw Object.assign(new Error(`sitemap fetch ${res.status} for ${url}`), {
        code: 'SITEMAP_FETCH',
        hint: 'Could not fetch the sitemap — check the URL is accessible',
      })
    const xml = await res.text()
    const parsed = parseSitemap(xml)
    for (const u of parsed.urls) collected.add(u)
    for (const nested of parsed.nestedSitemaps) await walk(nested, depth + 1)
  }

  await walk(rootUrl, 0)
  return Array.from(collected)
}
