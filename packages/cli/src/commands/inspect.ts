import type { GSCClient, InspectionInput } from '@gsc-cli/sdk'
import { EXIT_CODES } from '../output/envelope.js'

type Client = Pick<GSCClient, 'inspection' | 'httpClient'>

export interface InspectUrlOptions {
  client: Client
  siteUrl: string
  url: string
  languageCode?: string
}

export async function runInspectUrl(options: InspectUrlOptions) {
  const inspectInput: InspectionInput = {
    siteUrl: options.siteUrl,
    inspectionUrl: options.url,
  }
  if (options.languageCode !== undefined) {
    inspectInput.languageCode = options.languageCode
  }
  const result = await options.client.inspection.inspect(inspectInput)
  const verdict = result.indexStatusResult?.verdict
  const indexed = verdict === 'PASS'
  const snap = options.client.httpClient.rateLimitSnapshot()
  const rateLimit = snap.remaining !== -1 ? snap : undefined
  const data = {
    url: options.url,
    verdict,
    indexed,
    indexStatus: result.indexStatusResult,
    mobileUsability: result.mobileUsabilityResult,
    richResults: result.richResultsResult,
    amp: result.ampResult,
  }
  const exitCode = indexed ? EXIT_CODES.success : EXIT_CODES.semanticNegative
  return rateLimit !== undefined
    ? { data, exitCode, rateLimit }
    : { data, exitCode }
}
