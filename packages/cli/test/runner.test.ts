import { describe, it, expect, vi } from 'vitest'
import { runCommand } from '../src/runner.js'
import { GSCAuthError } from '@gsc-cli/sdk'
import { EXIT_CODES } from '../src/output/envelope.js'

describe('runCommand', () => {
  it('writes JSON envelope to stdout on success, exit 0', async () => {
    const stdout = vi.fn<(line: string) => void>()
    const stderr = vi.fn<(line: string) => void>()
    const exit = vi.fn()
    await runCommand({
      command: 'sites list',
      format: 'json',
      execute: async () => ({ data: [{ siteUrl: 'https://a/' }] }),
      io: { stdout, stderr, exit },
    })
    expect(stdout).toHaveBeenCalledOnce()
    const printed = JSON.parse(stdout.mock.calls[0]![0])
    expect(printed.ok).toBe(true)
    expect(printed.data).toEqual([{ siteUrl: 'https://a/' }])
    expect(exit).toHaveBeenCalledWith(0)
  })

  it('writes error envelope and auth exit code on GSCAuthError', async () => {
    const stdout = vi.fn<(line: string) => void>()
    const stderr = vi.fn<(line: string) => void>()
    const exit = vi.fn()
    await runCommand({
      command: 'sites list',
      format: 'json',
      execute: async () => {
        throw new GSCAuthError('expired')
      },
      io: { stdout, stderr, exit },
    })
    const printed = JSON.parse(stdout.mock.calls[0]![0])
    expect(printed.ok).toBe(false)
    expect(printed.error.code).toBe('AUTH_EXPIRED')
    expect(exit).toHaveBeenCalledWith(EXIT_CODES.auth)
  })

  it('uses explicit exit code from execute result', async () => {
    const stdout = vi.fn<(line: string) => void>()
    const stderr = vi.fn<(line: string) => void>()
    const exit = vi.fn()
    await runCommand({
      command: 'inspect',
      format: 'json',
      execute: async () => ({ data: { verdict: 'FAIL' }, exitCode: EXIT_CODES.semanticNegative }),
      io: { stdout, stderr, exit },
    })
    expect(exit).toHaveBeenCalledWith(EXIT_CODES.semanticNegative)
    expect(JSON.parse(stdout.mock.calls[0]![0]).ok).toBe(true)
  })

  it('uses text format when specified', async () => {
    const stdout = vi.fn<(line: string) => void>()
    const exit = vi.fn()
    await runCommand({
      command: 'sites list',
      format: 'text',
      execute: async () => ({ data: [{ siteUrl: 'https://a/' }] }),
      io: { stdout, exit, stderr: vi.fn() },
    })
    expect(stdout.mock.calls[0]![0]).toContain('https://a/')
  })

  it('stdout is only called once even on success', async () => {
    const stdout = vi.fn<(line: string) => void>()
    const exit = vi.fn()
    await runCommand({
      command: 'test',
      format: 'json',
      execute: async () => ({ data: { ok: true } }),
      io: { stdout, exit, stderr: vi.fn() },
    })
    expect(stdout).toHaveBeenCalledOnce()
  })

  it('includes meta.rateLimit in envelope when execute provides it', async () => {
    const stdout = vi.fn<(line: string) => void>()
    const exit = vi.fn()
    await runCommand({
      command: 'analytics query',
      format: 'json',
      execute: async () => ({
        data: [],
        rateLimit: { remaining: 42, resetAt: '2026-04-11T12:00:00Z' },
      }),
      io: { stdout, exit, stderr: vi.fn() },
    })
    const printed = JSON.parse(stdout.mock.calls[0]![0])
    expect(printed.ok).toBe(true)
    expect(printed.meta.rateLimit).toEqual({ remaining: 42, resetAt: '2026-04-11T12:00:00Z' })
  })
})
