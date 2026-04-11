import type { GSCClient } from '@gsc-cli/sdk'

type Client = Pick<GSCClient, 'sitemaps' | 'httpClient'>

function getRateLimit(client: Client) {
  const snap = client.httpClient.rateLimitSnapshot()
  return snap.remaining !== -1 ? snap : undefined
}

export async function runSitemapsList({ client, siteUrl }: { client: Client; siteUrl: string }) {
  const res = await client.sitemaps.list({ siteUrl })
  const data = res.sitemap ?? []
  const rateLimit = getRateLimit(client)
  return rateLimit !== undefined ? { data, rateLimit } : { data }
}

export async function runSitemapsGet({
  client,
  siteUrl,
  feedpath,
}: {
  client: Client
  siteUrl: string
  feedpath: string
}) {
  const data = await client.sitemaps.get({ siteUrl, feedpath })
  const rateLimit = getRateLimit(client)
  return rateLimit !== undefined ? { data, rateLimit } : { data }
}

export async function runSitemapsSubmit({
  client,
  siteUrl,
  feedpath,
}: {
  client: Client
  siteUrl: string
  feedpath: string
}) {
  await client.sitemaps.submit({ siteUrl, feedpath })
  const rateLimit = getRateLimit(client)
  const data = { siteUrl, feedpath, submitted: true }
  return rateLimit !== undefined ? { data, rateLimit } : { data }
}

export async function runSitemapsDelete({
  client,
  siteUrl,
  feedpath,
}: {
  client: Client
  siteUrl: string
  feedpath: string
}) {
  await client.sitemaps.delete({ siteUrl, feedpath })
  const rateLimit = getRateLimit(client)
  const data = { siteUrl, feedpath, deleted: true }
  return rateLimit !== undefined ? { data, rateLimit } : { data }
}
