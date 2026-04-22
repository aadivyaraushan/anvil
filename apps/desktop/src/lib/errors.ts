export enum ErrorCode {
  OFFLINE = 'OFFLINE',
  API_UNREACHABLE = 'API_UNREACHABLE',
  AUTH_EXPIRED = 'AUTH_EXPIRED',
  RATE_LIMITED = 'RATE_LIMITED',
  NOT_FOUND = 'NOT_FOUND',
  SERVER_ERROR = 'SERVER_ERROR',
  UNKNOWN = 'UNKNOWN',
}

export const USER_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.OFFLINE]: "You're offline. Changes will sync when you reconnect.",
  [ErrorCode.API_UNREACHABLE]: "Can't reach Anvil's servers. Retrying\u2026",
  [ErrorCode.AUTH_EXPIRED]: 'Session expired. Sign in again.',
  [ErrorCode.RATE_LIMITED]: 'Anvil is catching up. New findings will appear shortly.',
  [ErrorCode.NOT_FOUND]: 'This item no longer exists.',
  [ErrorCode.SERVER_ERROR]: "Something went wrong on our end. We're looking into it.",
  [ErrorCode.UNKNOWN]: 'An unexpected error occurred.',
}

const RETRYABLE = new Set<ErrorCode>([
  ErrorCode.OFFLINE,
  ErrorCode.API_UNREACHABLE,
  ErrorCode.RATE_LIMITED,
  ErrorCode.SERVER_ERROR,
])

export class AnvilError extends Error {
  readonly code: ErrorCode
  readonly userMessage: string
  readonly retryable: boolean

  constructor(code: ErrorCode, cause?: unknown) {
    super(USER_MESSAGES[code])
    this.name = 'AnvilError'
    this.code = code
    this.userMessage = USER_MESSAGES[code]
    this.retryable = RETRYABLE.has(code)
    if (cause instanceof Error) this.cause = cause
  }
}

function codeFromStatus(status: number): ErrorCode {
  if (status === 401 || status === 403) return ErrorCode.AUTH_EXPIRED
  if (status === 404) return ErrorCode.NOT_FOUND
  if (status === 429) return ErrorCode.RATE_LIMITED
  if (status >= 500) return ErrorCode.SERVER_ERROR
  return ErrorCode.UNKNOWN
}

export function mapError(err: unknown): AnvilError {
  if (err instanceof AnvilError) return err

  if (err instanceof TypeError) {
    return new AnvilError(ErrorCode.OFFLINE, err)
  }

  if (err instanceof Response) {
    return new AnvilError(codeFromStatus(err.status), err)
  }

  if (err instanceof Error && 'status' in err) {
    const status = (err as Error & { status: number }).status
    if (typeof status === 'number') {
      return new AnvilError(codeFromStatus(status), err)
    }
  }

  return new AnvilError(ErrorCode.UNKNOWN, err instanceof Error ? err : undefined)
}
