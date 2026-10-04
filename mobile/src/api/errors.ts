export type ErrorCode =
  | 'offline'
  | 'timeout'
  | 'not-found'
  | 'forbidden'
  | 'rate-limited'
  | 'server'
  | 'invalid-data'
  | 'http';
export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
/** An ambiguous catalog identity must not choose a native profile. */
export class PersonIdentityError extends ApiError {
  constructor(message: string) {
    super('invalid-data', message);
  }
}
export function httpError(status: number): ApiError {
  const code: ErrorCode =
    status === 404
      ? 'not-found'
      : status === 403 || status === 401
        ? 'forbidden'
        : status === 429
          ? 'rate-limited'
          : status >= 500
            ? 'server'
            : 'http';
  return new ApiError(
    code,
    code === 'not-found'
      ? 'This record is not available.'
      : code === 'rate-limited'
        ? 'Too many requests. Try again shortly.'
        : 'The public record could not be loaded. Try again.',
    status,
  );
}
