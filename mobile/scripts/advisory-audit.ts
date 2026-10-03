import assert from 'node:assert/strict';
import {
  unacceptedAdvisories,
  type AuditRoot,
  type AcceptedAdvisory,
} from './advisory-policy';

interface AuditResult {
  stdout: string;
  stderr: string;
  error?: Error & { code?: string };
}
export const advisoryTimeoutMs = 8000;
const skipped = (timedOut: boolean) =>
  `WARNING: ADVISORY AUDIT SKIPPED — npm registry ${
    timedOut
      ? `did not respond within ${advisoryTimeoutMs / 1000}s`
      : 'unreachable'
  }; advisories were NOT checked. Re-run online before release.`;
const unavailableCode =
  /\b(?:ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|ERR_SOCKET_TIMEOUT|E50[234])\b/;
export function checkAdvisoryAudit(
  result: AuditResult,
  accepted: AcceptedAdvisory[],
): string {
  const timedOut = result.error?.code === 'ETIMEDOUT';
  if (result.error && !timedOut) throw result.error;
  let audit;
  try {
    audit = JSON.parse(result.stdout);
  } catch {
    assert(
      timedOut || unavailableCode.test(result.stderr),
      'Audit returned invalid JSON without a registry connection error',
    );
    return skipped(timedOut);
  }
  // A valid inventory always takes priority over a connection warning. Never
  // suppress a new advisory merely because npm printed an unrelated warning.
  if (!audit.vulnerabilities) {
    if (audit.error?.code)
      assert(
        unavailableCode.test(audit.error.code),
        `Audit unavailable: ${JSON.stringify(audit.error)}`,
      );
    assert(
      timedOut ||
        unavailableCode.test(
          [audit.error?.code, audit.message, result.stderr].join('\n'),
        ),
      `Audit unavailable: ${JSON.stringify(audit.error)}`,
    );
    return skipped(timedOut);
  }
  assert(!audit.error, `Audit unavailable: ${JSON.stringify(audit.error)}`);
  const roots: AuditRoot[] = [];
  for (const [name, vulnerability] of Object.entries(audit.vulnerabilities))
    for (const via of (vulnerability as { via: (string | { url: string })[] })
      .via)
      if (typeof via !== 'string') roots.push({ name, url: via.url });
  assert.deepEqual(
    unacceptedAdvisories(roots, accepted),
    [],
    'New/unaccepted advisory: review runtime exposure and upgrade safely; never npm audit fix --force',
  );
  return `PASS advisory baseline: ${roots.length} accepted roots; new runtime or unclassified advisories fail`;
}
