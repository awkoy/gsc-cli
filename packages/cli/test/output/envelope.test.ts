import { describe, it, expect } from 'vitest'
import {
  buildSuccess,
  buildError,
  formatEnvelope,
  exitCodeFor,
  EXIT_CODES,
} from '../../src/output/envelope.js'
import { GSCAuthError, GSCNotFoundError, GSCPermissionError, GSCValidationError, GSCRateLimitError, GSCServerError, GSCNetworkError } from '@gsc-cli/sdk'

describe('buildSuccess', () => {
  it('wraps data with ok:true and meta.command', () => {
    const env = buildSuccess({ command: 'sites list', data: [{ siteUrl: 'https://a/' }], durationMs: 42 })
    expect(env.ok).toBe(true)
    expect(env.data).toEqual([{ siteUrl: 'https://a/' }])
    expect(env.meta.command).toBe('sites list')
    expect(env.meta.durationMs).toBe(42)
  })

  it('includes rateLimit when provided', () => {
    const env = buildSuccess({
      command: 'analytics query',
      data: [],
      durationMs: 5,
      rateLimit: { remaining: 100, resetAt: '2026-04-11T12:00:00Z' },
    })
    expect(env.meta.rateLimit).toEqual({ remaining: 100, resetAt: '2026-04-11T12:00:00Z' })
  })

  it('does not include rateLimit when not provided', () => {
    const env = buildSuccess({ command: 'sites list', data: [], durationMs: 1 })
    expect(env.meta.rateLimit).toBeUndefined()
  })
})

describe('buildError', () => {
  it('maps GSCAuthError → code AUTH_EXPIRED', () => {
    const env = buildError({ command: 'sites list', error: new GSCAuthError('expired'), durationMs: 3 })
    expect(env.ok).toBe(false)
    expect(env.error.code).toBe('AUTH_EXPIRED')
    expect(env.error.message).toBe('expired')
    expect(env.meta.command).toBe('sites list')
  })

  it('maps GSCNotFoundError with httpStatus', () => {
    const env = buildError({
      command: 'sites get',
      error: new GSCNotFoundError('no such site', { httpStatus: 404, requestId: 'abc' }),
      durationMs: 1,
    })
    expect(env.error.code).toBe('NOT_FOUND')
    expect(env.error.httpStatus).toBe(404)
    expect(env.error.requestId).toBe('abc')
  })

  it('wraps unknown errors as INTERNAL_ERROR', () => {
    const env = buildError({ command: 'x', error: new Error('oops'), durationMs: 0 })
    expect(env.error.code).toBe('INTERNAL_ERROR')
  })

  it('maps plain string errors as INTERNAL_ERROR', () => {
    const env = buildError({ command: 'x', error: 'something broke', durationMs: 0 })
    expect(env.error.code).toBe('INTERNAL_ERROR')
    expect(env.error.message).toBe('something broke')
  })

  it('includes hint when GSCError has one', () => {
    const env = buildError({
      command: 'sites list',
      error: new GSCAuthError('expired', { hint: 'Run gsc auth login' }),
      durationMs: 1,
    })
    expect(env.error.hint).toBe('Run gsc auth login')
  })
})

describe('formatEnvelope', () => {
  it('json format produces parseable JSON', () => {
    const env = buildSuccess({ command: 'sites list', data: [], durationMs: 1 })
    const out = formatEnvelope(env, 'json')
    const parsed = JSON.parse(out)
    expect(parsed.ok).toBe(true)
  })

  it('json format is single-line', () => {
    const env = buildSuccess({ command: 'sites list', data: [{ a: 1 }], durationMs: 1 })
    const out = formatEnvelope(env, 'json')
    expect(out).not.toContain('\n')
  })

  it('text format of array data is pretty-printed', () => {
    const env = buildSuccess({
      command: 'sites list',
      data: [{ siteUrl: 'https://a/', permissionLevel: 'siteOwner' }],
      durationMs: 1,
    })
    const out = formatEnvelope(env, 'text')
    expect(out).toContain('https://a/')
  })

  it('text format shows error with code prefix', () => {
    const env = buildError({ command: 'x', error: new GSCAuthError('expired'), durationMs: 1 })
    const out = formatEnvelope(env, 'text')
    expect(out).toContain('ERROR AUTH_EXPIRED:')
  })

  it('table format includes column headers for array-of-objects', () => {
    const env = buildSuccess({
      command: 'sites list',
      data: [{ siteUrl: 'https://a/', permissionLevel: 'siteOwner' }],
      durationMs: 1,
    })
    const out = formatEnvelope(env, 'table')
    expect(out).toContain('siteUrl')
    expect(out).toContain('permissionLevel')
  })

  it('table format includes data rows', () => {
    const env = buildSuccess({
      command: 'sites list',
      data: [{ siteUrl: 'https://a/', permissionLevel: 'siteOwner' }],
      durationMs: 1,
    })
    const out = formatEnvelope(env, 'table')
    expect(out).toContain('https://a/')
    expect(out).toContain('siteOwner')
  })
})

describe('exitCodeFor', () => {
  it('GSCAuthError → 3 (auth)', () => {
    expect(exitCodeFor(new GSCAuthError('x'))).toBe(EXIT_CODES.auth)
  })

  it('GSCPermissionError → 3 (auth)', () => {
    expect(exitCodeFor(new GSCPermissionError('x'))).toBe(EXIT_CODES.auth)
  })

  it('GSCValidationError → 4 (validation)', () => {
    expect(exitCodeFor(new GSCValidationError('x'))).toBe(EXIT_CODES.validation)
  })

  it('GSCNotFoundError → 5 (notFound)', () => {
    expect(exitCodeFor(new GSCNotFoundError('x'))).toBe(EXIT_CODES.notFound)
  })

  it('GSCRateLimitError → 6 (rateLimited)', () => {
    expect(exitCodeFor(new GSCRateLimitError('x'))).toBe(EXIT_CODES.rateLimited)
  })

  it('GSCNetworkError → 7 (network)', () => {
    expect(exitCodeFor(new GSCNetworkError('x'))).toBe(EXIT_CODES.network)
  })

  it('GSCServerError → 7 (network)', () => {
    expect(exitCodeFor(new GSCServerError('x'))).toBe(EXIT_CODES.network)
  })

  it('plain Error → 1 (generic)', () => {
    expect(exitCodeFor(new Error('oops'))).toBe(EXIT_CODES.generic)
  })

  it('Error with code BAD_ARGS → 4 (validation)', () => {
    const err = Object.assign(new Error('bad args'), { code: 'BAD_ARGS' })
    expect(exitCodeFor(err)).toBe(EXIT_CODES.validation)
  })

  it('Error with code BAD_ARGS and hint preserves hint in envelope', () => {
    const err = Object.assign(new Error('no site'), { code: 'BAD_ARGS', hint: 'pass --site' })
    const env = buildError({ command: 'sites list', error: err, durationMs: 0 })
    expect(env.error.code).toBe('BAD_ARGS')
    expect(env.error.hint).toBe('pass --site')
  })
})
