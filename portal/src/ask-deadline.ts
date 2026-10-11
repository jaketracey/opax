/** A parent deadline cancels the actual fetch as well as a non-cooperative stub. */
export class AskDeadline {
  private controller = new AbortController()
  private timer: ReturnType<typeof setTimeout>
  private end: number
  private abortParent = () => this.controller.abort(this.parent?.reason)
  constructor(ms: number, private parent?: AbortSignal) {
    this.end = Date.now() + ms
    this.timer = setTimeout(() => this.cancel(), ms)
    parent?.addEventListener('abort', this.abortParent, { once: true })
    if (parent?.aborted) this.abortParent()
  }
  get signal(): AbortSignal { return this.controller.signal }
  get remaining(): number { return Math.max(0, this.end - Date.now()) }
  async run<T>(work: (signal: AbortSignal) => Promise<T>, perCall = this.remaining): Promise<T> {
    const call = new AbortController()
    const abort = () => call.abort(this.signal.reason)
    this.signal.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(() => call.abort(new DOMException('Ask deadline exceeded', 'TimeoutError')), Math.min(perCall, this.remaining))
    if (this.signal.aborted || !this.remaining) abort()
    let rejectAbort: () => void = () => {}
    const stopped = new Promise<never>((_, reject) => {
      rejectAbort = () => reject(call.signal.reason || new DOMException('Ask cancelled', 'AbortError'))
      call.signal.addEventListener('abort', rejectAbort, { once: true })
      if (call.signal.aborted) rejectAbort()
    })
    try {
      if (call.signal.aborted) return await stopped
      return await Promise.race([work(call.signal), stopped])
    } finally {
      clearTimeout(timer)
      this.signal.removeEventListener('abort', abort)
      call.signal.removeEventListener('abort', rejectAbort)
    }
  }
  cancel(): void { this.controller.abort(new DOMException('Ask deadline exceeded', 'TimeoutError')); this.dispose() }
  dispose(): void { clearTimeout(this.timer); this.parent?.removeEventListener('abort', this.abortParent) }
}

/** Bounded per-isolate pack cache; there are no unbounded Cache API pack keys. */
export class AskPackCache<T> {
  private entries = new Map<string, { value: T; expires: number }>()
  constructor(readonly capacity = 500, readonly ttl = 600_000) {}
  get size(): number { return this.entries.size }
  get(key: string, now = Date.now()): T | undefined {
    const row = this.entries.get(key)
    if (!row) return undefined
    this.entries.delete(key)
    if (row.expires <= now) return undefined
    this.entries.set(key, row)
    return row.value
  }
  set(key: string, value: T, now = Date.now()): void {
    this.entries.delete(key)
    this.entries.set(key, { value, expires: now + this.ttl })
    while (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!)
  }
}
