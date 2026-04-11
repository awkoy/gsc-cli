import type { GSCClient } from '@gsc-cli/sdk'

type Client = Pick<GSCClient, 'sites' | 'httpClient'>

function getRateLimit(client: Client) {
  const snap = client.httpClient.rateLimitSnapshot()
  return snap.remaining !== -1 ? snap : undefined
}

export async function runSitesList({ client }: { client: Client }) {
  const res = await client.sites.list()
  const data = res.siteEntry ?? []
  const rateLimit = getRateLimit(client)
  return rateLimit !== undefined ? { data, rateLimit } : { data }
}

export async function runSitesGet({ client, siteUrl }: { client: Client; siteUrl: string }) {
  const data = await client.sites.get(siteUrl)
  const rateLimit = getRateLimit(client)
  return rateLimit !== undefined ? { data, rateLimit } : { data }
}

export async function runSitesAdd({ client, siteUrl }: { client: Client; siteUrl: string }) {
  await client.sites.add(siteUrl)
  const rateLimit = getRateLimit(client)
  const data = { siteUrl, added: true }
  return rateLimit !== undefined ? { data, rateLimit } : { data }
}

export async function runSitesDelete({ client, siteUrl }: { client: Client; siteUrl: string }) {
  await client.sites.delete(siteUrl)
  const rateLimit = getRateLimit(client)
  const data = { siteUrl, deleted: true }
  return rateLimit !== undefined ? { data, rateLimit } : { data }
}
