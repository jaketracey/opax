/** The status line's words, exactly as drawn (journeys/ask.md 9). */
export type AskStage =
  | 'Reading your question'
  | 'Searching the record'
  | 'Writing the answer'
  | 'Searching again';
export type AskTrailStep = {
  id: string;
  label: string;
  arg?: string;
  state: 'running' | 'done' | 'failed' | 'error';
  tool?: string;
  round?: number;
  results?: number;
  ms?: number;
};
export type AskStep = AskTrailStep & {
  /** One decoded run, including completed lookups, in start order. */
  trail?: readonly AskTrailStep[];
};
export type StreamHandlers = {
  stage: (stage: AskStage) => void;
  step?: (step: AskStep) => void;
  delta: (text: string) => void;
  retry: () => void;
  /** How many records were found: a count, never their titles. */
  reading?: (count: number) => void;
};

function parseStep(value: unknown): AskTrailStep | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { id, label, arg, tool, round, results, ms, ok } = value as Record<
    string,
    unknown
  >;
  const state =
    (value as Record<string, unknown>).state ??
    (typeof ok === 'boolean' ? (ok ? 'done' : 'error') : undefined);
  if (
    !(
      (typeof id === 'string' && id.trim()) ||
      (typeof id === 'number' && Number.isSafeInteger(id) && id >= 0)
    ) ||
    typeof label !== 'string' ||
    !label.trim() ||
    (arg !== undefined && (typeof arg !== 'string' || arg.length > 40)) ||
    typeof state !== 'string' ||
    !['running', 'done', 'failed', 'error'].includes(state)
  )
    return null;
  return {
    id: String(id),
    label,
    ...(arg ? { arg } : {}),
    state: state as AskStep['state'],
    ...(typeof tool === 'string' && tool.trim() ? { tool } : {}),
    ...(typeof round === 'number' && Number.isSafeInteger(round) && round > 0
      ? { round }
      : {}),
    ...(typeof results === 'number' && Number.isFinite(results) && results >= 0
      ? { results }
      : {}),
    ...(typeof ms === 'number' && Number.isFinite(ms) && ms >= 0 ? { ms } : {}),
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
  private trail: AskTrailStep[] = [];
  constructor(private on: StreamHandlers) {}
  get done() {
    return this.completed;
  }
  private steps(values: unknown[]) {
    let changed = false;
    for (const value of values) {
      const step = parseStep(value);
      if (!step) continue;
      const index = this.trail.findIndex((s) => s.id === step.id);
      if (index < 0)
        this.trail = [...this.trail, step].sort((a, b) => {
          const left = Number(a.id),
            right = Number(b.id);
          return Number.isFinite(left) && Number.isFinite(right)
            ? left - right
            : 0;
        });
      else
        this.trail = this.trail.map((s, i) =>
          i === index ? { ...s, ...step } : s,
        );
      changed = true;
    }
    if (!changed) return;
    // The controller retains running lookups only. Decode the research run
    // as one envelope, with each lookup's real state and counts inside it.
    // Fresh snapshots preserve even starts and finishes in one network chunk.
    const current = this.trail.filter((s) => s.state === 'running').at(-1);
    this.on.step?.({
      id: 'research.trail',
      label: current?.label ?? 'Searching the record',
      ...(current?.arg ? { arg: current.arg } : {}),
      state: 'running',
      trail: this.trail,
    });
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
      this.trail = [];
      this.on.retry();
      this.on.stage('Searching again');
    } else if (event === 'research.trail') {
      this.steps(Array.isArray(v.trail) ? v.trail : [v]);
    } else if (event === 'status') {
      if (v.phase === 'step') {
        this.steps([v.step]);
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
    // "Stopped partway" only when words are on screen to have stopped.
    if (!this.completed)
      throw this.shown
        ? new AskFailure('partial', 'The answer stream ended early.')
        : new AskFailure('invalid', 'No answer came back.');
    return this.final;
  }
}
