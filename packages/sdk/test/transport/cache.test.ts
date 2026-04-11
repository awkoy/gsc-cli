import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryCache, buildCacheKey } from '../../src/transport/cache.js'

describe('MemoryCache', () => {
  beforeEach(() => vi.useFakeTimers({ now: 1_700_000_000_000 }))
  afterEach(() => vi.useRealTimers())

  it('returns undefined on miss', () => {
    const cache = new MemoryCache({ maxEntries: 10, ttlMs: 1000 })
    expect(cache.get('k')).toBeUndefined()
  })

  it('returns cached value within TTL', () => {
    const cache = new MemoryCache({ maxEntries: 10, ttlMs: 1000 })
    cache.set('k', { data: 42 })
    expect(cache.get('k')).toEqual({ data: 42 })
  })

  it('expires after TTL', () => {
    const cache = new MemoryCache({ maxEntries: 10, ttlMs: 1000 })
    cache.set('k', { data: 42 })
    vi.advanceTimersByTime(1001)
    expect(cache.get('k')).toBeUndefined()
  })

  it('evicts oldest when over capacity', () => {
    const cache = new MemoryCache({ maxEntries: 2, ttlMs: 10_000 })
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe(2)
    expect(cache.get('c')).toBe(3)
  })

  it('clear removes all entries', () => {
    const cache = new MemoryCache({ maxEntries: 10, ttlMs: 10_000 })
    cache.set('a', 1)
    cache.set('b', 2)
    cache.clear()
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBeUndefined()
  })

  it('set overwrites existing key', () => {
    const cache = new MemoryCache({ maxEntries: 10, ttlMs: 10_000 })
    cache.set('k', 'v1')
    cache.set('k', 'v2')
    expect(cache.get('k')).toBe('v2')
  })
})

describe('buildCacheKey', () => {
  it('is stable for equal inputs', () => {
    const a = buildCacheKey({ method: 'POST', url: '/x', body: { q: 1 } })
    const b = buildCacheKey({ method: 'POST', url: '/x', body: { q: 1 } })
    expect(a).toBe(b)
  })

  it('differs on body change', () => {
    const a = buildCacheKey({ method: 'POST', url: '/x', body: { q: 1 } })
    const b = buildCacheKey({ method: 'POST', url: '/x', body: { q: 2 } })
    expect(a).not.toBe(b)
  })

  it('differs on method change', () => {
    const a = buildCacheKey({ method: 'GET', url: '/x' })
    const b = buildCacheKey({ method: 'POST', url: '/x' })
    expect(a).not.toBe(b)
  })

  it('differs on url change', () => {
    const a = buildCacheKey({ method: 'GET', url: '/x' })
    const b = buildCacheKey({ method: 'GET', url: '/y' })
    expect(a).not.toBe(b)
  })

  it('returns hex string', () => {
    const key = buildCacheKey({ method: 'GET', url: '/test' })
    expect(key).toMatch(/^[0-9a-f]+$/)
  })

  it('no body vs undefined body yields same key', () => {
    const a = buildCacheKey({ method: 'GET', url: '/x' })
    const b = buildCacheKey({ method: 'GET', url: '/x', body: undefined })
    expect(a).toBe(b)
  })
})
