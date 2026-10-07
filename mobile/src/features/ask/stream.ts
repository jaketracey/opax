export type AskStage =
  | 'Reading your question'
  | 'Searching the record'
  | 'Writing the answer'
  | 'Reading the record again.';
export type StreamHandlers = {
  stage: (stage: AskStage) => void;
  delta: (text: string) => void;
  retry: () => void;
  reading?: (titles: string[]) => void;
};
export class AskFailure extends Error {
  constructor(
    public code:
      | 'rate-limited'
      | 'blocked'
      | 'offline'
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
  constructor(private on: StreamHandlers) {}
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
    if (!v || typeof v !== 'object') return;
    if (event === 'done') {
      this.final = v;
      this.completed = true;
    } else if (event === 'error')
      throw new AskFailure(
        'partial',
        typeof v.error === 'string' ? v.error : 'The answer stream failed.',
      );
    else if (event === 'delta' && typeof v.text === 'string')
      this.on.delta(v.text);
    else if (event === 'retry') {
      this.on.retry();
      this.on.stage('Reading the record again.');
    } else if (event === 'status') {
      if (v.phase === 'searching') this.on.stage('Searching the record');
      else if (['retrieved', 'writing', 'reading'].includes(String(v.phase)))
        this.on.stage('Writing the answer');
      if (v.phase === 'retrieved' && Array.isArray(v.sources))
        this.on.reading?.(
          v.sources
            .flatMap((s) => (s && typeof s.title === 'string' ? [s.title] : []))
            .slice(0, 3),
        );
    }
  }
  result() {
    if (!this.completed)
      throw new AskFailure('partial', 'The answer stream ended early.');
    return this.final;
  }
}
