import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { computeBackoffMs, sleep } from '../../src/transport/retry.js'

describe('computeBackoffMs', () => {
  beforeEach(() => vi.spyOn(Math, 'random').mockReturnValue(0.5))
  afterEach(() => vi.restoreAllMocks())

  it('scales exponentially and respects 30s cap', () => {
    expect(computeBackoffMs(0)).toBe(250)   // Math.floor(0.5 * min(30_000, 500*1)) = 250
    expect(computeBackoffMs(1)).toBe(500)   // Math.floor(0.5 * min(30_000, 1000)) = 500
    expect(computeBackoffMs(2)).toBe(1000)  // Math.floor(0.5 * min(30_000, 2000)) = 1000
    expect(computeBackoffMs(10)).toBe(15_000) // Math.floor(0.5 * min(30_000, 500*1024)) = 15_000
  })

  it('never exceeds 30 seconds', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9999)
    expect(computeBackoffMs(20)).toBeLessThanOrEqual(30_000)
  })

  it('returns 0 when random is 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(computeBackoffMs(5)).toBe(0)
  })
})

describe('sleep', () => {
  it('resolves after ms', async () => {
    const start = Date.now()
    await sleep(10)
    expect(Date.now() - start).toBeGreaterThanOrEqual(5)
  })

  it('rejects on abort', async () => {
    const controller = new AbortController()
    const p = sleep(10_000, controller.signal)
    controller.abort()
    await expect(p).rejects.toThrow('aborted')
  })

  it('rejects immediately if already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(sleep(100, controller.signal)).rejects.toThrow('aborted')
  })
})
