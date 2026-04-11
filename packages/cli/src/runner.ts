import {
  buildSuccess,
  buildError,
  formatEnvelope,
  exitCodeFor,
  EXIT_CODES,
  type Format,
  type RateLimitMeta,
  type SuccessInput,
} from './output/envelope.js'

export interface RunIO {
  stdout: (line: string) => void
  stderr: (line: string) => void
  exit: (code: number) => void
}

export interface ExecuteResult<T> {
  data: T
  exitCode?: number
  rateLimit?: RateLimitMeta
}

export interface RunOptions<T> {
  command: string
  format: Format
  execute: () => Promise<ExecuteResult<T>>
  io?: Partial<RunIO>
}

const defaultIO: RunIO = {
  stdout: (line) => process.stdout.write(line + '\n'),
  stderr: (line) => process.stderr.write(line + '\n'),
  exit: (code) => process.exit(code),
}

export async function runCommand<T>(options: RunOptions<T>): Promise<void> {
  const io: RunIO = { ...defaultIO, ...options.io }
  const started = Date.now()
  try {
    const result = await options.execute()
    const successInput: SuccessInput<T> = {
      command: options.command,
      data: result.data,
      durationMs: Date.now() - started,
    }
    if (result.rateLimit !== undefined) successInput.rateLimit = result.rateLimit
    const envelope = buildSuccess(successInput)
    io.stdout(formatEnvelope(envelope, options.format))
    io.exit(result.exitCode ?? EXIT_CODES.success)
  } catch (err) {
    const envelope = buildError({
      command: options.command,
      error: err,
      durationMs: Date.now() - started,
    })
    io.stdout(formatEnvelope(envelope, options.format))
    io.exit(exitCodeFor(err))
  }
}
