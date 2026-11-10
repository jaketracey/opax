/** The status line's words, exactly as drawn (journeys/ask.md 9). */
export type AskStage =
  | 'Reading your question'
  | 'Searching the record'
  | 'Writing the answer'
  | 'Searching again';
export type AskStep = {
  id: string;
  label: string;
  arg?: string;
  state: 'running' | 'done' | 'failed' | 'error';
};
export type StreamHandlers = {
  stage: (stage: AskStage) => void;
  step?: (step: AskStep) => void;
  delta: (text: string) => void;
  retry: () => void;
  /** How many records were found: a count, never their titles. */
  reading?: (count: number) => void;
};

function parseStep(value: unknown): AskStep | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { id, label, arg, state } = value as Record<string, unknown>;
  if (
    typeof id !== 'string' ||
    !id.trim() ||
    typeof label !== 'string' ||
    !label.trim() ||
    (arg !== undefined && (typeof arg !== 'string' || arg.length > 40)) ||
    typeof state !== 'string' ||
    !['running', 'done', 'failed', 'error'].includes(state)
  )
    return null;
  return {
    id,
    label,
    ...(arg ? { arg } : {}),
    state: state as AskStep['state'],
  };
}
export class AskFailure extends Error {
  constructor(
    public code:
      | 'rate-limited'
      | 'blocked'
      | 'offline'
      | 'timeout'
      | 'partial'
      | 'empty'
      | 'cancelled'
      | 'invalid',
    message: string,
  ) {
    super(message);
  }
}
// Incremental framing accepts split UTF-8, CRLF and multi-line SSE data.
export class AskStream {
  private buffer = '';
  private final: unknown;
  private completed = false;
  private shown = false;
  constructor(private on: StreamHandlers) {}
  get done() {
    return this.completed;
  }
  push(text: string, end = false) {
    this.buffer += text;
    let match: RegExpExecArray | null;
    while ((match = /\r?\n\r?\n/.exec(this.buffer))) {
      const block = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      this.dispatch(block);
    }
    if (end && this.buffer.trim()) {
      this.dispatch(this.buffer);
      this.buffer = '';
    }
  }
  private dispatch(block: string) {
    if (this.completed) return;
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:'))
        data.push(line.slice(5).replace(/^ /, ''));
    }
    if (!data.length) return;
    let v: Record<string, unknown>;
    try {
      v = JSON.parse(data.join('\n'));
    } catch {
      return;
    }
    if (!v || typeof v !== 'object' || Array.isArray(v)) return;
    if (event === 'done') {
      this.final = v;
      this.completed = true;
    } else if (event === 'error')
      throw new AskFailure(
        this.shown ? 'partial' : 'invalid',
        'The answer stream failed.',
      );
    else if (event === 'delta' && typeof v.text === 'string') {
      if (v.text) this.shown = true;
      this.on.delta(v.text);
    } else if (event === 'retry') {
      this.shown = false;
      this.on.retry();
      this.on.stage('Searching again');
    } else if (event === 'status') {
      if (v.phase === 'step') {
        const step = parseStep(v.step);
        if (step) this.on.step?.(step);
      } else if (v.phase === 'searching') this.on.stage('Searching the record');
      else if (
        v.phase === 'retrieved' ||
        v.phase === 'writing' ||
        v.phase === 'reading'
      )
        this.on.stage('Writing the answer');
      if (v.phase === 'retrieved' && Array.isArray(v.sources))
        this.on.reading?.(v.sources.length);
    }
  }
  result() {
    if (!this.completed)
      throw new AskFailure('partial', 'The answer stream ended early.');
    return this.final;
  }
}
