// Executes the real Worker status function with an in-memory D1 seam. No network.
import { readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
const sourceURL = new URL('../../../../portal/src/voice.ts', import.meta.url);
const outputURL = new URL('../ios/OpaxVoiceCore/Tests/OpaxVoiceCoreTests/Fixtures/worker-status.json', import.meta.url);
const source = readFileSync(sourceURL, 'utf8');
const allowance = source.match(/^export const VOICE_ALLOWANCE_SECONDS = .*$/m)?.[0].replace('export ', '');
const configured = source.match(/^const configured = .*$/m)?.[0];
const start = source.indexOf('async function voiceStatus(');
const end = source.indexOf('\nasync function toolAuthorized(', start);
if (!allowance || !configured || start < 0 || end < 0) throw new Error('Worker status source changed; review fixture extraction');
const implementation = stripTypeScriptTypes(`${allowance}\n${configured}\n${source.slice(start, end)}`);
const timestamp = 1_700_000_000;
// The context has no fetch, WebSocket, require or other network entry points.
const status = runInNewContext(`${implementation}; voiceStatus;`, { now: () => timestamp }, { timeout: 1000 });
const shapes = {};
for (const [name, spec] of Object.entries({
  signedOut: { member: null }, disabledSignedOut: { member: null, disabled: true },
  allowance: { member: 'fixture', used: 120 }, exhausted: { member: 'fixture', used: 600 },
  unlimited: { member: 'fixture', unlimited: true }, openSession: { member: 'fixture', used: 600, active: true },
  budgetClosed: { member: 'fixture', used: 120 }
})) {
  const env = { VOICE_ENABLED: spec.disabled ? 'false' : 'true', VOICE_AGENT_ID: 'fixture',
    ELEVENLABS_API_KEY: 'synthetic-not-a-key', VOICE_TOOL_SECRET: 'synthetic-not-a-secret'.repeat(2), VOICE_MONTHLY_SECONDS: '0',
    COMMUNITY_DB: { prepare(sql) { return { bind() { return this; }, async first() {
      if (sql.includes('voice_access')) return { unlimited: spec.unlimited ? 1 : 0 };
      if (sql.includes('COALESCE(SUM')) return { seconds: spec.used ?? 0 };
      if (sql.includes('SELECT * FROM voice_sessions')) return spec.active ? {
        id: '11111111-1111-4111-8111-111111111111', state: 'reserved', reserved_seconds: 600,
        started_at: null, expires_at: timestamp + 60
      } : null;
      throw new Error('Unexpected status SQL');
    } }; } }
  };
  shapes[name] = await status(env, spec.member);
}
// The current Worker does not expose the budget. This separately named fixture
// adds only the approved future W8 field to the exact current budget-closed shape.
shapes.budgetClosedFutureW8 = { ...shapes.budgetClosed, budget_open: false };
const result = JSON.stringify({ worker_sha256: createHash('sha256').update(source).digest('hex'), timestamp,
  budget_note: 'Current Worker status has no budget_open signal; future W8 fixture explicitly adds it.', shapes }, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (readFileSync(outputURL, 'utf8') !== result) throw new Error('Worker fixture drift; regenerate and review');
} else writeFileSync(outputURL, result);
console.log(`Worker status fixtures ${process.argv.includes('--check') ? 'verified' : 'generated'}: ${fileURLToPath(outputURL)}`);
