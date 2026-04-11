import { createHash } from 'node:crypto'

export interface CacheOptions {
  maxEntries: number
  ttlMs: number
}

interface Entry<T> {
  value: T
  expiresAt: number
}

export class MemoryCache {
  readonly maxEntries: number
  readonly ttlMs: number
  private readonly entries = new Map<string, Entry<unknown>>()

  constructor(options: CacheOptions) {
    this.maxEntries = options.maxEntries
    this.ttlMs = options.ttlMs
  }

  get<T = unknown>(key: string): T | undefined {
    const entry = this.entries.get(key) as Entry<T> | undefined
    if (!entry) return undefined
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value
  }

  set<T = unknown>(key: string, value: T): void {
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value
      if (oldest !== undefined) this.entries.delete(oldest)
    }
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs })
  }

  clear(): void {
    this.entries.clear()
  }
}

export function buildCacheKey(input: { method: string; url: string; body?: unknown }): string {
  const hash = createHash('sha1')
  hash.update(input.method)
  hash.update('\n')
  hash.update(input.url)
  if (input.body !== undefined) {
    hash.update('\n')
    hash.update(JSON.stringify(input.body))
  }
  return hash.digest('hex')
}
