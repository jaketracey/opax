export function abortError() {
  return Object.assign(new Error('Cancelled'), { name: 'AbortError' });
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AbortError'
  );
}

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}
