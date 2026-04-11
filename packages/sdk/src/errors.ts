export interface GSCErrorOptions {
  code?: string
  httpStatus?: number
  requestId?: string
  hint?: string
  cause?: unknown
}

export class GSCError extends Error {
  readonly code: string
  readonly httpStatus: number | undefined
  readonly requestId: string | undefined
  readonly hint: string | undefined

  constructor(message: string, options: GSCErrorOptions = {}) {
    super(message, { cause: options.cause })
    this.name = 'GSCError'
    this.code = options.code ?? 'GSC_ERROR'
    this.httpStatus = options.httpStatus
    this.requestId = options.requestId
    this.hint = options.hint
  }
}

export class GSCAuthError extends GSCError {
  constructor(message: string, options: GSCErrorOptions = {}) {
    super(message, { code: 'AUTH_EXPIRED', ...options })
    this.name = 'GSCAuthError'
  }
}

export class GSCPermissionError extends GSCError {
  constructor(message: string, options: GSCErrorOptions = {}) {
    super(message, { code: 'PERMISSION_DENIED', ...options })
    this.name = 'GSCPermissionError'
  }
}

export class GSCNotFoundError extends GSCError {
  constructor(message: string, options: GSCErrorOptions = {}) {
    super(message, { code: 'NOT_FOUND', ...options })
    this.name = 'GSCNotFoundError'
  }
}

export class GSCValidationError extends GSCError {
  constructor(message: string, options: GSCErrorOptions = {}) {
    super(message, { code: 'VALIDATION_FAILED', ...options })
    this.name = 'GSCValidationError'
  }
}

export interface GSCRateLimitErrorOptions extends GSCErrorOptions {
  retryAfterMs?: number
}

export class GSCRateLimitError extends GSCError {
  readonly retryAfterMs: number | undefined

  constructor(message: string, options: GSCRateLimitErrorOptions = {}) {
    super(message, { code: 'RATE_LIMITED', ...options })
    this.name = 'GSCRateLimitError'
    this.retryAfterMs = options.retryAfterMs
  }
}

export class GSCServerError extends GSCError {
  constructor(message: string, options: GSCErrorOptions = {}) {
    super(message, { code: 'SERVER_ERROR', ...options })
    this.name = 'GSCServerError'
  }
}

export class GSCNetworkError extends GSCError {
  constructor(message: string, options: GSCErrorOptions = {}) {
    super(message, { code: 'NETWORK_ERROR', ...options })
    this.name = 'GSCNetworkError'
  }
}
