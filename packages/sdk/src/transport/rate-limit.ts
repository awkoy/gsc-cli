import type { RateLimitSnapshot } from '../types.js'

export interface TokenBucketOptions {
  capacity: number
  refillPerSecond: number
}

export class TokenBucket {
  readonly capacity: number
  readonly refillPerSecond: number
  private tokens: number
  private lastRefill: number

  constructor(options: TokenBucketOptions) {
    this.capacity = options.capacity
    this.refillPerSecond = options.refillPerSecond
    this.tokens = options.capacity
    this.lastRefill = Date.now()
  }

  available(): number {
    this.refill()
    return Math.floor(this.tokens)
  }

  async acquire(count = 1): Promise<void> {
    this.refill()
    if (this.tokens >= count) {
      this.tokens -= count
      return
    }
    const deficit = count - this.tokens
    const waitMs = Math.ceil((deficit / this.refillPerSecond) * 1000)
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs))
    this.refill()
    this.tokens = Math.max(0, this.tokens - count)
  }

  snapshot(): RateLimitSnapshot {
    this.refill()
    const deficit = this.capacity - this.tokens
    const secondsUntilFull = deficit / this.refillPerSecond
    return {
      remaining: Math.floor(this.tokens),
      resetAt: new Date(Date.now() + secondsUntilFull * 1000).toISOString(),
    }
  }

  private refill() {
    const now = Date.now()
    const elapsedSec = (now - this.lastRefill) / 1000
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillPerSecond)
    this.lastRefill = now
  }
}
