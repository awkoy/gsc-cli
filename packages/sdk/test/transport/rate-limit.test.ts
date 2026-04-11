import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TokenBucket } from '../../src/transport/rate-limit.js'

describe('TokenBucket', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('allows capacity immediately', async () => {
    const bucket = new TokenBucket({ capacity: 3, refillPerSecond: 1 })
    await bucket.acquire()
    await bucket.acquire()
    await bucket.acquire()
    expect(bucket.available()).toBe(0)
  })

  it('delays next acquire until refill', async () => {
    const bucket = new TokenBucket({ capacity: 1, refillPerSecond: 2 })
    await bucket.acquire()
    const pending = bucket.acquire()
    let settled = false
    void pending.then(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(499)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(2)
    await pending
    expect(settled).toBe(true)
  })

  it('snapshot reports remaining and reset time', () => {
    const bucket = new TokenBucket({ capacity: 5, refillPerSecond: 1 })
    const snap = bucket.snapshot()
    expect(snap.remaining).toBe(5)
    expect(new Date(snap.resetAt).getTime()).toBeGreaterThanOrEqual(Date.now())
  })

  it('snapshot remaining decreases after acquire', async () => {
    const bucket = new TokenBucket({ capacity: 10, refillPerSecond: 1 })
    await bucket.acquire(3)
    const snap = bucket.snapshot()
    expect(snap.remaining).toBe(7)
  })

  it('refills tokens over time', async () => {
    const bucket = new TokenBucket({ capacity: 10, refillPerSecond: 2 })
    await bucket.acquire(10)
    expect(bucket.available()).toBe(0)
    await vi.advanceTimersByTimeAsync(1000)
    expect(bucket.available()).toBe(2)
  })

  it('does not exceed capacity on refill', async () => {
    const bucket = new TokenBucket({ capacity: 5, refillPerSecond: 10 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(bucket.available()).toBe(5)
  })
})
