import {
  GSCError,
  GSCAuthError,
  GSCPermissionError,
  GSCNotFoundError,
  GSCValidationError,
  GSCRateLimitError,
  GSCServerError,
  GSCNetworkError,
} from '@gsc-cli/sdk'

export interface RateLimitMeta {
  remaining: number
  resetAt: string
}

export interface Meta {
  command: string
  durationMs: number
  rateLimit?: RateLimitMeta
}

export interface SuccessEnvelope<T> {
  ok: true
  data: T
  meta: Meta
}

export interface ErrorEnvelope {
  ok: false
  error: {
    code: string
    message: string
    hint?: string
    httpStatus?: number
    requestId?: string
  }
  meta: Meta
}

export type Envelope<T = unknown> = SuccessEnvelope<T> | ErrorEnvelope

export interface SuccessInput<T> {
  command: string
  data: T
  durationMs: number
  rateLimit?: RateLimitMeta
}

export interface ErrorInput {
  command: string
  error: unknown
  durationMs: number
}

export function buildSuccess<T>(input: SuccessInput<T>): SuccessEnvelope<T> {
  const meta: Meta = { command: input.command, durationMs: input.durationMs }
  if (input.rateLimit !== undefined) meta.rateLimit = input.rateLimit
  return { ok: true, data: input.data, meta }
}

export function buildError(input: ErrorInput): ErrorEnvelope {
  return {
    ok: false,
    error: classify(input.error),
    meta: { command: input.command, durationMs: input.durationMs },
  }
}

function classify(error: unknown): ErrorEnvelope['error'] {
  if (error instanceof GSCError) {
    const result: ErrorEnvelope['error'] = {
      code: error.code,
      message: error.message,
    }
    if (error.httpStatus !== undefined) result.httpStatus = error.httpStatus
    if (error.requestId !== undefined) result.requestId = error.requestId
    if (error.hint !== undefined) result.hint = error.hint
    return result
  }
  if (error instanceof Error) {
    const coded = error as Error & { code?: string; hint?: string }
    const result: ErrorEnvelope['error'] = {
      code: coded.code ?? 'INTERNAL_ERROR',
      message: error.message,
    }
    if (coded.hint !== undefined) result.hint = coded.hint
    return result
  }
  return { code: 'INTERNAL_ERROR', message: String(error) }
}

export type Format = 'json' | 'text' | 'table'

export function formatEnvelope(env: Envelope, format: Format): string {
  if (format === 'json') return JSON.stringify(env)
  if (format === 'table') return renderTable(env)
  return renderText(env)
}

function renderText(env: Envelope): string {
  if (!env.ok) {
    return `ERROR ${env.error.code}: ${env.error.message}${env.error.hint ? `\nhint: ${env.error.hint}` : ''}`
  }
  const data = env.data
  if (Array.isArray(data)) return data.map((row) => JSON.stringify(row)).join('\n')
  return JSON.stringify(data, null, 2)
}

function renderTable(env: Envelope): string {
  if (!env.ok) return renderText(env)
  const data = env.data
  if (!Array.isArray(data) || data.length === 0) return renderText(env)
  const rows = data as Array<Record<string, unknown>>
  const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))))
  const widths = columns.map((c) =>
    Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)),
  )
  const fmtRow = (values: string[]) =>
    values.map((v, i) => v.padEnd(widths[i] ?? v.length)).join('  ')
  const header = fmtRow(columns)
  const sep = columns.map((_, i) => '-'.repeat(widths[i] ?? 0)).join('  ')
  const body = rows.map((r) => fmtRow(columns.map((c) => String(r[c] ?? ''))))
  return [header, sep, ...body].join('\n')
}

export const EXIT_CODES = {
  success: 0,
  generic: 1,
  semanticNegative: 2,
  auth: 3,
  validation: 4,
  notFound: 5,
  rateLimited: 6,
  network: 7,
} as const

export function exitCodeFor(error: unknown): number {
  if (error instanceof GSCAuthError || error instanceof GSCPermissionError) return EXIT_CODES.auth
  if (error instanceof GSCValidationError) return EXIT_CODES.validation
  if (error instanceof GSCNotFoundError) return EXIT_CODES.notFound
  if (error instanceof GSCRateLimitError) return EXIT_CODES.rateLimited
  if (error instanceof GSCNetworkError || error instanceof GSCServerError) return EXIT_CODES.network
  if (error instanceof Error && (error as Error & { code?: string }).code === 'BAD_ARGS') return EXIT_CODES.validation
  return EXIT_CODES.generic
}
