import { GoogleAuth, type AuthClient } from 'google-auth-library'
import { HttpClient, type HttpClientOptions } from './transport/http-client.js'
import { MemoryCache } from './transport/cache.js'
import type { RetryOptions } from './transport/retry.js'
import type { TokenBucketOptions } from './transport/rate-limit.js'
import { AnalyticsResource } from './resources/analytics.js'
import { InspectionResource } from './resources/inspection.js'
import { SitesResource } from './resources/sites.js'
import { SitemapsResource } from './resources/sitemaps.js'
import { GSCAuthError } from './errors.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const DEFAULT_BASE_URL = 'https://searchconsole.googleapis.com/webmasters/v3'
const ADC_PATH = join(homedir(), '.config', 'gcloud', 'application_default_credentials.json')
const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000
const DEFAULT_CACHE_MAX_ENTRIES = 128
const DEFAULT_SCOPES = ['https://www.googleapis.com/auth/webmasters']

export interface GSCClientOptions {
  auth?: AuthClient
  scopes?: string[]
  quotaProjectId?: string
  timeoutMs?: number
  cache?: boolean | MemoryCache
  fetch?: typeof fetch
  baseUrl?: string
  retry?: RetryOptions
  rateLimit?: TokenBucketOptions
}

export class GSCClient {
  readonly httpClient: HttpClient
  readonly sites: SitesResource
  readonly sitemaps: SitemapsResource
  readonly analytics: AnalyticsResource
  readonly inspection: InspectionResource

  private readonly googleAuth: GoogleAuth | undefined
  private authClientPromise: Promise<AuthClient> | undefined

  constructor(options: GSCClientOptions = {}) {
    if (options.auth !== undefined) {
      // Use the provided auth client directly
      const authClient = options.auth
      this.authClientPromise = Promise.resolve(authClient)
    } else {
      // Create a GoogleAuth instance for ADC
      this.googleAuth = new GoogleAuth({
        scopes: options.scopes ?? DEFAULT_SCOPES,
      })
    }

    const getToken = async (): Promise<string> => {
      try {
        const client = await this.getAuthClient()
        const tokenResponse = await client.getAccessToken()
        const token = tokenResponse.token
        if (!token) {
          throw new GSCAuthError('No access token available from ADC', {
            code: 'AUTH_MISSING',
            hint: 'Run `gsc auth login` or set GOOGLE_APPLICATION_CREDENTIALS env var',
          })
        }
        return token
      } catch (err) {
        if (err instanceof GSCAuthError) throw err
        throw new GSCAuthError('Failed to obtain access token', {
          code: 'AUTH_MISSING',
          cause: err,
          hint: 'Run `gsc auth login` or set GOOGLE_APPLICATION_CREDENTIALS env var',
        })
      }
    }

    const refreshToken = async (): Promise<void> => {
      // google-auth-library handles refresh internally via getAccessToken()
      // This is a no-op — the next getToken() call will auto-refresh.
    }

    const quotaProjectId = options.quotaProjectId ?? readQuotaProjectFromADC()
    const httpClientOptions: HttpClientOptions = {
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      getToken,
      refreshToken,
    }
    if (quotaProjectId !== undefined) httpClientOptions.quotaProjectId = quotaProjectId
    if (options.fetch !== undefined) httpClientOptions.fetch = options.fetch
    if (options.timeoutMs !== undefined) httpClientOptions.timeoutMs = options.timeoutMs
    if (options.retry !== undefined) httpClientOptions.retry = options.retry
    if (options.rateLimit !== undefined) httpClientOptions.rateLimit = options.rateLimit
    if (options.cache === true) {
      httpClientOptions.cache = new MemoryCache({
        maxEntries: DEFAULT_CACHE_MAX_ENTRIES,
        ttlMs: DEFAULT_CACHE_TTL_MS,
      })
    } else if (typeof options.cache === 'object') {
      httpClientOptions.cache = options.cache
    }

    this.httpClient = new HttpClient(httpClientOptions)
    this.sites = new SitesResource(this.httpClient)
    this.sitemaps = new SitemapsResource(this.httpClient)
    this.analytics = new AnalyticsResource(this.httpClient)
    this.inspection = new InspectionResource(this.httpClient)
  }

  private async getAuthClient(): Promise<AuthClient> {
    if (this.authClientPromise !== undefined) {
      return this.authClientPromise
    }
    // Lazily get client from GoogleAuth and cache the promise
    this.authClientPromise = this.googleAuth!.getClient()
    return this.authClientPromise
  }

  static async fromCachedAuth(options: GSCClientOptions = {}): Promise<GSCClient> {
    const client = new GSCClient(options)
    // Eagerly validate credentials by requesting a token once
    await client.getAuthClient().then((c) => c.getAccessToken()).catch((err) => {
      throw new GSCAuthError('No credentials available', {
        code: 'AUTH_MISSING',
        cause: err,
        hint: 'Run `gsc auth login` or set GOOGLE_APPLICATION_CREDENTIALS env var',
      })
    })
    return client
  }
}

function readQuotaProjectFromADC(): string | undefined {
  try {
    const raw = readFileSync(ADC_PATH, 'utf8')
    const parsed = JSON.parse(raw) as { quota_project_id?: string }
    return parsed.quota_project_id
  } catch {
    return undefined
  }
}
