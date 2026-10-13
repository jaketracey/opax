import {AsyncLocalStorage} from 'node:async_hooks'

/** Per-request phase timings for the HTML pages' Server-Timing header.
 * Durations of concurrent phases (asset reads) are summed, so they can exceed
 * the wall time. workerd advances its clock only across I/O, so a purely
 * synchronous phase (the privacy matcher) can read 0 ms in production; its
 * call count is still exact. */
export class ServerTiming {
  readonly start = performance.now()
  private phases = new Map<string, {dur: number; count: number}>()
  add(name: string, dur: number) {
    const phase = this.phases.get(name) ?? {dur: 0, count: 0}
    phase.dur += dur; phase.count++
    this.phases.set(name, phase)
  }
  header(): string {
    const parts = [...this.phases].map(([name, {dur, count}]) => `${name};dur=${dur.toFixed(1)};desc="${count} call${count === 1 ? '' : 's'}"`)
    parts.push(`total;dur=${(performance.now() - this.start).toFixed(1)}`)
    return parts.join(', ')
  }
}

const current = new AsyncLocalStorage<ServerTiming>()
export const withTiming = <T>(timing: ServerTiming, fn: () => T): T => current.run(timing, fn)

/** Time an async phase against the current request, if there is one. */
export async function timed<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const timing = current.getStore()
  if (!timing) return fn()
  const start = performance.now()
  try { return await fn() } finally { timing.add(name, performance.now() - start) }
}

/** Time a synchronous call against the current request, if there is one. */
export function timedSync<T>(name: string, fn: () => T): T {
  const timing = current.getStore()
  if (!timing) return fn()
  const start = performance.now()
  try { return fn() } finally { timing.add(name, performance.now() - start) }
}
