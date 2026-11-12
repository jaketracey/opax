import { AskFailure, AskStream, busyWait, type StreamHandlers } from './stream';

// portal/src/index.ts: the lighter retrieval can take 50 s. The position
// path can silently fall through from a 40 s recovery to 40 s reasoning.
// Allow both plus 5 s; cap the pre-text wait (including retry) separately.
export const ASK_STALL_MS = 85_000;
export const ASK_DEADLINE_MS = 120_000;

/** Retry-After is a non-negative seconds count or an HTTP date. */
function retryDeadline(value: string | null, receivedAt: number): number {
  const raw = value?.trim() ?? '';
  const date =
    /^(?:[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT|[A-Za-z]+, \d{2}-[A-Za-z]{3}-\d{2} \d{2}:\d{2}:\d{2} GMT|[A-Za-z]{3} [A-Za-z]{3} [ \d]\d \d{2}:\d{2}:\d{2} \d{4})$/;
  const deadline = /^\d+$/.test(raw)
    ? receivedAt + Number(raw) * 1000
    : date.test(raw)
      ? Date.parse(raw.endsWith('GMT') ? raw : `${raw} GMT`)
      : NaN;
  return Number.isSafeInteger(deadline)
    ? Math.max(receivedAt, deadline)
    : receivedAt + busyWait;
}

/** One submission, at most two requests, with one pre-text deadline across both. */
export async function postAsk(
  url: string,
  send: (signal: AbortSignal) => Promise<Response>,
  signal: AbortSignal,
  on?: StreamHandlers,
): Promise<unknown> {
  let everShown = false;
  let deadlineExpired = false;
  const deadlineAt = Date.now() + ASK_DEADLINE_MS;
  let interrupt: ((failure: AskFailure) => void) | undefined;
  const cancel = () => interrupt?.(new AskFailure('cancelled', 'Cancelled.'));
  if (signal.aborted) throw new AskFailure('cancelled', 'Cancelled.');
  signal.addEventListener('abort', cancel, { once: true });
  const deadline = setTimeout(() => {
    deadlineExpired = true;
    interrupt?.(
      new AskFailure('timeout', 'The answer took too long.', 'deadline'),
    );
  }, ASK_DEADLINE_MS);

  const attempt = async (): Promise<unknown> => {
    const request = new AbortController();
    let interruptedBy: AskFailure | undefined;
    let rejectInterrupted!: (failure: AskFailure) => void;
    const interrupted = new Promise<never>((_resolve, reject) => {
      rejectInterrupted = reject;
    });
    interrupt = (failure) => {
      if (interruptedBy) return;
      interruptedBy = failure;
      // Settle first even if a native transport rejects synchronously on abort.
      rejectInterrupted(failure);
      request.abort();
    };
    let stall: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(stall);
      stall = setTimeout(
        () =>
          interrupt?.(
            new AskFailure(
              'timeout',
              'The answer stopped responding.',
              'stall',
            ),
          ),
        ASK_STALL_MS,
      );
    };
    const waiting = <T>(operation: Promise<T>) =>
      Promise.race([operation, interrupted]);
    let shown = false;
    arm();
    try {
      const response = await waiting(send(request.signal));
      const receivedAt = Date.now();
      if (
        response.redirected ||
        (response.status >= 300 && response.status < 400) ||
        (response.url && response.url !== url)
      )
        throw new AskFailure('blocked', 'The answer request was blocked.');
      if (!response.ok)
        throw new AskFailure(
          response.status === 429
            ? 'rate-limited'
            : response.status === 403 || response.status === 401
              ? 'blocked'
              : 'invalid',
          `Request failed (${response.status}).`,
          undefined,
          response.status === 429
            ? retryDeadline(response.headers.get('retry-after'), receivedAt)
            : undefined,
        );
      if (
        !on ||
        !response.headers.get('content-type')?.includes('text/event-stream')
      )
        return await waiting(response.json());
      if (!response.body)
        throw new AskFailure('invalid', 'No answer came back.');
      on.stage('Searching the record');
      const stream = new AskStream({
        ...on,
        progress: arm,
        delta: (text) => {
          if (text.trim()) {
            // Once words are visible, steady progress may take longer than
            // the initial wait budget. Only a stall should cut it short.
            clearTimeout(deadline);
            everShown = shown = true;
          }
          on.delta(text);
        },
        retry: () => {
          shown = false;
          on.retry();
        },
      });
      const decoder = new TextDecoder();
      const reader = response.body.getReader();
      try {
        for (;;) {
          const { value, done } = await waiting(reader.read());
          if (done) break;
          stream.push(decoder.decode(value, { stream: true }));
          if (stream.done) break;
        }
        stream.push(decoder.decode(), true);
        return stream.result();
      } finally {
        void reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    } catch (error) {
      if (signal.aborted) throw new AskFailure('cancelled', 'Cancelled.');
      const failure = interruptedBy ?? error;
      const reason =
        failure instanceof AskFailure
          ? failure.reason
          : error instanceof SyntaxError
            ? 'server'
            : 'network';
      if (failure instanceof AskFailure && !interruptedBy) throw failure;
      if (shown)
        throw new AskFailure(
          'partial',
          'The answer stream ended early.',
          reason,
        );
      if (failure instanceof AskFailure) throw failure;
      if (error instanceof SyntaxError)
        throw new AskFailure('invalid', 'The answer could not be read.');
      throw new AskFailure('offline', 'OPAX could not be reached.', 'network');
    } finally {
      clearTimeout(stall);
      interrupt = undefined;
    }
  };
  try {
    for (let count = 0; ; count++) {
      if (signal.aborted) throw new AskFailure('cancelled', 'Cancelled.');
      if (deadlineExpired)
        throw new AskFailure(
          'timeout',
          'The answer took too long.',
          'deadline',
        );
      try {
        return await attempt();
      } catch (error) {
        // Only streaming Ask can retry, never follow-up generation or a final
        // server error (the Worker already tries to recover those). A server
        // withdrawal does not erase the fact that words were already shown.
        if (
          !on ||
          count > 0 ||
          everShown ||
          signal.aborted ||
          deadlineExpired ||
          !(error instanceof AskFailure) ||
          !['stall', 'network'].includes(error.reason ?? '')
        )
          throw error;
        // A paid stall retry needs enough time for recovery to be worthwhile.
        // The 85 s client stall leaves just 35 s of the pre-text budget,
        // below the 60 s recovery allowance: offer Try again instead.
        // Quick network failures or earlier reported stalls can still recover.
        if (error.reason === 'stall' && deadlineAt - Date.now() < 60_000)
          throw error;
        on.retry();
        on.stage('Searching again');
      }
    }
  } finally {
    clearTimeout(deadline);
    signal.removeEventListener('abort', cancel);
  }
}
