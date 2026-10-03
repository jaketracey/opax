// Executes origin/main's actual deletion route and community status branch.
// All database, MAC and email bindings are in memory. The VM has no networking.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
const root = new URL('../../../../', import.meta.url);
const read = path => execFileSync('git', ['show', `origin/main:${path}`], { cwd: root, encoding: 'utf8' });
const deletion = read('portal/src/community-deletion.ts'), core = read('portal/src/community-core.ts'), community = read('portal/src/community.ts');
function between(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error('Worker source changed: review fixture extraction');
  return source.slice(a, b);
}
// Node's strip mode cannot erase a TypeScript constructor parameter property.
// Lower only the source-pinned error helper to its equivalent assignment; leave
// route/control-flow code unchanged and fail if the helper's syntax changes.
const errorConstructor = 'constructor(public status:number,message:string){super(message)}';
if (!core.split('\n')[0].includes(errorConstructor)) throw new Error('Worker error helper changed: review fixture lowering');
const errorClass = core.split('\n')[0].replace(errorConstructor, 'constructor(status:number,message:string){super(message);this.status=status}');
const helperSource = [errorClass, core.split('\n').find(s => s.startsWith('export const json =')),
  between(core, 'export async function body(', 'export function text('),
  between(core, 'export function sameOrigin(', 'export type Member='),
  between(core, 'export async function member(', 'export async function requireMember('),
  core.split('\n').find(s => s.startsWith('export function publicMember('))].join('\n');
const statusSource = between(community, " if(path==='/api/community/status'", " if(String(env.COMMUNITY_ENABLED)");
const code = stripTypeScriptTypes((helperSource + '\n' + deletion.replace(/^import .*\n/gm, '') +
  '\nasync function status(req,env){const path="/api/community/status";\n' + statusSource + '\n}\n').replace(/\bexport /g, ''), { mode: 'strip' });
const shapes = {}, timestamp = 1_700_000_000;
const cases = {
  requestSuccess: {}, requestDisabled: { disabled: true }, requestPaused: { paused: true },
  request400: { insertionLost: true }, request400Quota: { quota: true }, request401: { signedOut: true },
  request403: { wrongOrigin: true }, request503: { schema: true }, request503Email: { email: true },
  deleteSuccess: {}, deleteDisabled: { disabled: true }, deletePaused: { paused: true },
  delete400: { wrongCode: true }, delete400Expired: { expired: true }, delete400Used: { expired: true },
  delete400Superseded: { expired: true }, delete400OverLimit: { expired: true },
  delete400OtherMember: { unknown: true }, delete400Unknown: { unknown: true },
  delete400MalformedChallenge: { malformedChallenge: true }, delete400MalformedCode: { malformedCode: true },
  delete400Quota: { quota: true }, delete401: { signedOut: true }, delete403: { wrongOrigin: true },
  delete503: { schema: true }, delete503Database: { database: true },
  request405: { method: 'GET' }
};
for (const [name, spec] of Object.entries(cases)) {
  const context = { Request, Response, TextEncoder, TextDecoder, Uint8Array, now: () => timestamp,
    randomToken: () => 'c'.repeat(43), digest: async () => 'fixture-digest',
    randomSignInCode: () => '00001234', requireSignInCodeSecret: () => {}, macHex: () => 'fixture-mac',
    signInCodeMac: async () => 'fixture-mac', matchesSignInCode: async () => !spec.wrongCode,
    socialCounts: async () => ({ messages: 0, activity: 0 }) };
  const worker = runInNewContext(code + ';({deletionRoute,status,CommunityError,json});', context, { timeout: 1000 });
  const m = { id: 'fixture', email: 'fixture@example.invalid', display_name: '', bio: '', role: 'member', disabled: spec.disabled ? 1 : 0, created_at: timestamp };
  const env = { COMMUNITY_ORIGIN: 'https://opax.com.au', COMMUNITY_ENABLED: spec.paused ? 'false' : 'true',
    COMMUNITY_EMAIL_FROM: 'fixture@example.invalid', COMMUNITY_EMAIL: { async send() { if (spec.email) throw new Error('Synthetic email failure'); } },
    COMMUNITY_DB: { prepare(sql) { return { bind() { return this; }, async first() {
      if (sql.includes('JOIN member_sessions')) return sql.includes('m.disabled=0') && spec.disabled ? null : m;
      if (sql.includes('LIMIT 0')) { if (spec.schema) throw new Error('Synthetic missing schema'); return null; }
      if (sql.includes('community_limits')) return { hits: spec.quota ? 1000 : 1 };
      if (sql.startsWith('SELECT challenge_id FROM')) return spec.unknown ? null : { challenge_id: 'c'.repeat(43) };
      if (sql.includes('RETURNING code_mac')) return spec.expired ? null : { code_mac: 'fixture-mac' };
      throw new Error('Unexpected SQL in fixture');
    }, async all() { return { results: ['member_id', 'member_a', 'member_b'].map(from => ({ from, on_delete: 'SET NULL' })) }; }, async run() { return { meta: { changes: 1 } }; } }; },
      async batch(statements) { if (spec.database) throw new Error('Synthetic transaction failure'); return statements.map((_, index) => ({ meta: { changes: spec.insertionLost && index === 1 ? 0 : 1 } })); }
    } };
  const issuing = name.startsWith('request'), path = `/api/community/account/${issuing ? 'deletion-code' : 'delete'}`;
  const headers = { origin: spec.wrongOrigin ? 'https://wrong.example.invalid' : env.COMMUNITY_ORIGIN, 'content-type': 'application/json' };
  if (!spec.signedOut) headers.cookie = `__Host-opax_session=${'f'.repeat(43)}`;
  const requestBody = issuing ? {} : { challenge_id: spec.malformedChallenge ? 'bad' : 'c'.repeat(43), code: spec.malformedCode ? 'bad' : '00001234' };
  const request = new Request(`http://127.0.0.1${path}`, { method: spec.method ?? 'POST', headers, ...(spec.method ? {} : { body: JSON.stringify(requestBody) }) });
  let response;
  try { response = await worker.deletionRoute(request, env, path); }
  catch (error) { response = worker.json({ error: error instanceof worker.CommunityError ? error.message : 'This action could not be completed. Please try again shortly.' }, error instanceof worker.CommunityError ? error.status : 503); }
  shapes[name] = { status: response.status, headers: Object.fromEntries(response.headers), body: await response.json() };
  if (['requestSuccess', 'requestDisabled', 'requestPaused', 'request401'].includes(name)) {
    const status = await worker.status(new Request('http://127.0.0.1/api/community/status', { headers }), env);
    shapes[name + 'Status'] = { status: status.status, headers: Object.fromEntries(status.headers), body: await status.json() };
  }
}
const result = JSON.stringify({ source_ref: 'origin/main', timestamp,
  sources: Object.fromEntries([['community-deletion.ts', deletion], ['community-core.ts', core], ['community.ts', community]].map(([name, source]) => [name, createHash('sha256').update(source).digest('hex')])), shapes }, null, 2) + '\n';
const output = new URL('../ios/OpaxVoiceCore/Tests/OpaxVoiceCoreTests/Fixtures/worker-deletion.json', import.meta.url);
if (process.argv.includes('--check')) { if (readFileSync(output, 'utf8') !== result) throw new Error('Deletion fixture drift; regenerate and review'); }
else writeFileSync(output, result);
console.log(`Worker deletion fixtures ${process.argv.includes('--check') ? 'verified' : 'generated'}`);
