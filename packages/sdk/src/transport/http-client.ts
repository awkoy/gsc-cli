import {
  GSCAuthError,
  GSCError,
  GSCNetworkError,
  GSCNotFoundError,
  GSCPermissionError,
  GSCRateLimitError,
  GSCServerError,
  GSCValidationError,
} from '../errors.js'
import { computeBackoffMs, sleep } from './retry.js'
import { buildCacheKey, type MemoryCache } from './cache.js'
import type { RetryOptions } from './retry.js'
import { TokenBucket, type TokenBucketOptions } from './rate-limit.js'

export interface HttpRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
}

export interface HttpClientOptions {
  baseUrl: string
  fetch?: typeof fetch
  getToken?: () => Promise<string>
  refreshToken?: () => Promise<void>
  quotaProjectId?: string
  timeoutMs?: number
  retry?: RetryOptions
  rateLimit?: TokenBucketOptions
  cache?: MemoryCache
}

export class HttpClient {
  readonly baseUrl: string
  readonly fetchImpl: typeof fetch | undefined
  readonly getToken: (() => Promise<string>) | undefined
  readonly refreshToken: (() => Promise<void>) | undefined
  readonly quotaProjectId: string | undefined
  readonly timeoutMs: number | undefined
  readonly retry: RetryOptions | undefined
  readonly rateLimit: TokenBucketOptions | undefined
  readonly cache: MemoryCache | undefined
  private readonly tokenBucket: TokenBucket | undefined

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.fetchImpl = options.fetch
    this.getToken = options.getToken
    this.refreshToken = options.refreshToken
    this.quotaProjectId = options.quotaProjectId
    this.timeoutMs = options.timeoutMs
    this.retry = options.retry
    this.rateLimit = options.rateLimit
    this.cache = options.cache
    if (options.rateLimit) {
      this.tokenBucket = new TokenBucket(options.rateLimit)
    }
  }

  async request<T = unknown>(req: HttpRequest): Promise<T> {
    if (!this.getToken) {
      throw new GSCAuthError('No getToken function provided', { code: 'AUTH_MISSING' })
    }

    const url = this.buildUrl(req.path, req.query)
    const isCacheable = this.cache && (req.method === 'GET' || req.method === 'POST')
    if (isCacheable) {
      const key = buildCacheKey({ method: req.method, url, body: req.body })
      const cached = this.cache!.get<T>(key)
      if (cached !== undefined) return cached
    }

    if (this.tokenBucket) {
      await this.tokenBucket.acquire()
    }

    const maxAttempts = this.retry?.maxAttempts ?? 5

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const result = await this.executeOnce<T>(req, false, url)
        if (isCacheable) {
          const key = buildCacheKey({ method: req.method, url, body: req.body })
          this.cache!.set(key, result)
        }
        return result
      } catch (err) {
        if (!this.isRetryable(err) || attempt === maxAttempts - 1) throw err
        await sleep(this.retryDelayFor(err, attempt))
      }
    }
    // Unreachable: the loop always returns or throws
    throw new GSCError('retry loop exhausted')
  }

  private async executeOnce<T>(req: HttpRequest, didRefresh: boolean, prebuiltUrl: string): Promise<T> {
    const fetchImpl = this.fetchImpl ?? fetch
    const token = await this.getToken!()

    const url = prebuiltUrl
    const headers = new Headers({
      authorization: `Bearer ${token}`,
      accept: 'application/json',
    })
    if (this.quotaProjectId) {
      headers.set('x-goog-user-project', this.quotaProjectId)
    }
    const init: RequestInit = { method: req.method, headers }
    if (req.body !== undefined) {
      headers.set('content-type', 'application/json')
      init.body = JSON.stringify(req.body)
    }

    const controller = new AbortController()
    const timeoutMs = this.timeoutMs ?? 30_000
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    init.signal = controller.signal

    let res: Response
    try {
      res = await fetchImpl(url, init)
    } catch (cause) {
      const isTimeout = cause instanceof DOMException && cause.name === 'AbortError'
      throw new GSCNetworkError(
        isTimeout ? `request timed out after ${timeoutMs}ms` : 'fetch failed',
        {
          cause,
          hint: isTimeout
            ? 'Request timed out — the API may be slow, try again'
            : 'Network error — check connectivity and retry',
        },
      )
    } finally {
      clearTimeout(timer)
    }

    if (res.ok) {
      // Handle 204 No Content
      if (res.status === 204) {
        return {} as T
      }
      const text = await res.text()
      if (!text) return {} as T
      return JSON.parse(text) as T
    }

    if (res.status === 401 && !didRefresh) {
      if (this.refreshToken) {
        try {
          await this.refreshToken()
        } catch (cause) {
          throw new GSCAuthError('token refresh failed', {
            httpStatus: 401,
            code: 'AUTH_INVALID',
            cause,
            hint: 'Run `gsc auth login` to re-authenticate',
          })
        }
        return this.executeOnce<T>(req, true, prebuiltUrl)
      } else {
        throw new GSCAuthError('Unauthorized', {
          httpStatus: 401,
          code: 'AUTH_INVALID',
          hint: 'Run `gsc auth login` to re-authenticate',
        })
      }
    }

    throw await this.mapErrorResponse(res)
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): string {
    const base = this.baseUrl
    const absolute = path.startsWith('http')
      ? path
      : `${base}${path.startsWith('/') ? '' : '/'}${path}`
    if (!query) return absolute
    const url = new URL(absolute)
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v))
    }
    return url.toString()
  }

  private async mapErrorResponse(res: Response): Promise<GSCError> {
    const requestId = res.headers.get('x-request-id') ?? undefined
    let payload: { error?: { message?: string; status?: string } } = {}
    try {
      const text = await res.text()
      if (text) payload = JSON.parse(text) as typeof payload
    } catch {
      // ignore parse failure
    }
    const message = payload.error?.message ?? res.statusText ?? `HTTP ${res.status}`
    const base: { httpStatus: number; requestId?: string } = { httpStatus: res.status }
    if (requestId !== undefined) base.requestId = requestId

    switch (res.status) {
      case 400:
        return new GSCValidationError(message, {
          ...base,
          hint: 'Check request parameters — the API rejected the input shape',
        })
      case 401:
        return new GSCAuthError(message, {
          ...base,
          code: 'AUTH_INVALID',
          hint: 'Run `gsc auth login` to re-authenticate',
        })
      case 403:
        return new GSCPermissionError(message, {
          ...base,
          hint: 'Verify you have owner/full access to this site in Google Search Console',
        })
      case 404:
        return new GSCNotFoundError(message, {
          ...base,
          hint: 'Check the site URL or resource path — it may not exist or may need URL-encoding',
        })
      case 429: {
        const retryAfter = res.headers.get('retry-after')
        return new GSCRateLimitError(message, {
          ...base,
          ...(retryAfter !== null && { retryAfterMs: Number(retryAfter) * 1000 }),
          hint: 'Rate limited — wait and retry, or reduce request frequency',
        })
      }
      default:
        if (res.status >= 500)
          return new GSCServerError(message, {
            ...base,
            hint: 'Google server error — retry after a brief wait',
          })
        return new GSCError(message, base)
    }
  }

  private isRetryable(err: unknown): boolean {
    if (err instanceof GSCRateLimitError) return true
    if (err instanceof GSCServerError) return true
    return false
  }

  rateLimitSnapshot(): { remaining: number; resetAt: string } {
    if (this.tokenBucket) return this.tokenBucket.snapshot()
    return { remaining: -1, resetAt: '' }
  }

  private retryDelayFor(err: unknown, attempt: number): number {
    if (err instanceof GSCRateLimitError && err.retryAfterMs !== undefined) return err.retryAfterMs
    return computeBackoffMs(attempt)
  }
}
