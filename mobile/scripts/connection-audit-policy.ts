export const SAMPLE_INTERVAL_MS = 250;
// Twelve nominal intervals is the maximum accepted polling gap. A late
// command may still finish and supply diagnostics, but cannot pass the audit.
export const SAMPLE_GAP_LIMIT_MS = 3000;

/** Poll starts, in-flight samples and the final tail all count as gaps. */
export class SampleGaps {
  longestSampleGapMs = 0;
  private processSamplesAt = new Map<string, number>();
  constructor(private previousSampleAt: number) {}

  check(at: number) {
    this.longestSampleGapMs = Math.max(
      this.longestSampleGapMs,
      at - this.previousSampleAt,
    );
    for (const sampledAt of this.processSamplesAt.values())
      this.longestSampleGapMs = Math.max(
        this.longestSampleGapMs,
        at - sampledAt,
      );
  }

  sampleStarted(at: number) {
    this.check(at);
    this.previousSampleAt = at;
  }

  activeProcesses(pids: readonly string[]) {
    for (const pid of this.processSamplesAt.keys())
      if (!pids.includes(pid)) this.processSamplesAt.delete(pid);
    for (const pid of pids)
      if (!this.processSamplesAt.has(pid))
        this.processSamplesAt.set(pid, this.previousSampleAt);
  }

  processSampled(pid: string, at: number) {
    this.check(at);
    this.processSamplesAt.set(pid, at);
  }
}

export function connectionAuditPass(proof: {
  processSamples: number;
  errors: readonly unknown[];
  productionConnections: number;
  nonLoopbackConnections: readonly string[];
  longestSampleGapMs: number;
}) {
  return (
    proof.processSamples > 0 &&
    proof.errors.length === 0 &&
    proof.productionConnections === 0 &&
    proof.nonLoopbackConnections.length === 0 &&
    Number.isFinite(proof.longestSampleGapMs) &&
    proof.longestSampleGapMs >= 0 &&
    proof.longestSampleGapMs <= SAMPLE_GAP_LIMIT_MS
  );
}
