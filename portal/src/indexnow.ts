/** Public IndexNow ownership key. This is not a credential. */
export const INDEXNOW_KEY = '3fd7466e2dc64b00a55ee502b82c51ad';
export const INDEXNOW_ORIGIN = 'https://opax.com.au';
export const INDEXNOW_BATCH_SIZE = 500; // protocol allows at most 10,000
export const INDEXNOW_CRON = '*/5 * * * *';
type Snapshot = [string, string][];
interface Job {
  epoch: string; urls: string; cursor: number; complete: number; total: number;
  next_attempt_at: number; failure_count: number; superseded: number;
  plan_version: number; extras: string; carried_entries: string; lease_until: number; finished_at: number;
}
interface PlannedJob extends Job { entries: string | null; sequence: number }
interface Sent { path: string; fingerprint: string | null; extra_token: string | null }
type Extra = [string, string];
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
type IndexNowEnv = Pick<Env, 'ASSETS' | 'COMMUNITY_DB' | 'CACHE_EPOCH'> & {
  INDEXNOW_ENABLED?: string; INDEXNOW_DRY_RUN?: string; STAGING_API?: Fetcher;
  /** Optional private secret: one-off donor paths to re-crawl (see extraUrls). */
  INDEXNOW_EXTRA_PATHS?: string;
  INDEXNOW_DAILY_CAP?: string;
};
const DONOR_PREFIX = '/subject/donor/';
// One path segment as sent: unreserved and sub-delimiter characters and %-escapes only.
const SEGMENT = /^(?:[A-Za-z0-9\-._~!$&'()*+,;=:@]|%[0-9A-Fa-f]{2})+$/;

/**
 * The canonical `/subject/donor/<one segment>` path for a path or opax.com.au URL,
 * or null. The segment is decoded (a malformed escape fails), and the decoded
 * name must still be one plain segment: no slash or backslash, no dot segment, no
 * query, fragment, percent sign (double encoding) or control character. The
 * result is re-encoded as the sitemap encodes a donor name.
 */
export function donorPath(raw: string): string | null {
  const path = raw.startsWith(INDEXNOW_ORIGIN + '/') ? raw.slice(INDEXNOW_ORIGIN.length) : raw;
  if (!path.startsWith(DONOR_PREFIX)) return null;
  const segment = path.slice(DONOR_PREFIX.length);
  if (!SEGMENT.test(segment)) return null;
  let name: string;
  try { name = decodeURIComponent(segment); } catch { return null; }
  if (!name.trim() || name === '.' || name === '..' || /[/\\?#%\u0000-\u001f\u007f]/.test(name)) return null;
  return DONOR_PREFIX + encodeURIComponent(name);
}

/**
 * One-off donor pages to re-crawl with the next epoch's job, from the private
 * INDEXNOW_EXTRA_PATHS secret (whitespace-separated paths or opax.com.au URLs).
 * Donor pages made noindex by the October 2026 privacy hotfix are pinged so
 * engines see the noindex, without naming anyone in the public crawl assets
 * (/crawl/indexnow.json is served). Only valid donor paths are taken (donorPath),
 * in canonical form; at most 1,000.
 */
export function extraUrls(list = ''): string[] {
  return [...new Set(list.split(/\s+/).filter(Boolean).map(donorPath).filter((path): path is string => path !== null))]
    .slice(0, 1000).map(path => INDEXNOW_ORIGIN + path);
}

function eligiblePath(path: string): boolean {
  if (path.startsWith(DONOR_PREFIX)) return donorPath(path) === path;
  try {
    return /^\/(?:bill\/au-[a-z0-9-]+|doc\/division-[a-z0-9-]+|subject\/person\/[^/?#]+)$/.test(path)
      && !/\/(?:null|undefined)$/i.test(decodeURIComponent(path));
  } catch { return false; }
}

export function changedUrls(entries: Snapshot, previous: Snapshot = []): string[] {
  const before = new Map(previous);
  return [...new Set(entries.filter(([path,fingerprint]) => eligiblePath(path) && before.get(path) !== fingerprint)
    .map(([path]) => INDEXNOW_ORIGIN + path))].sort();
}

export function indexNowPayloads(urls: string[], size = INDEXNOW_BATCH_SIZE) {
  if (!Number.isInteger(size) || size < 1 || size > 10_000) throw new Error('Invalid IndexNow batch size');
  const eligible = [...new Set(urls)].filter(raw => {
    // Exactly as sent: a URL the parser would rewrite (dot segments, backslashes) is refused.
    if (raw.startsWith(INDEXNOW_ORIGIN + DONOR_PREFIX)) return raw === INDEXNOW_ORIGIN + donorPath(raw);
    try { const u = new URL(raw); return u.href === raw && u.origin === INDEXNOW_ORIGIN && !u.search && !u.hash && changedUrls([[u.pathname,'current']]).length > 0; } catch { return false; }
  }); // Preserve the plan's priority order.
  return Array.from({length:Math.ceil(eligible.length / size)},(_,i) => ({
    host: 'opax.com.au', key: INDEXNOW_KEY, keyLocation: `${INDEXNOW_ORIGIN}/${INDEXNOW_KEY}.txt`, urlList: eligible.slice(i * size,(i+1)*size),
  }));
}

function dailyCap(raw?: string): number {
  const value = Number(raw);
  return raw?.trim() && Number.isSafeInteger(value) && value >= 0 ? value : 2000;
}

function retryAt(header: string | null, failures: number, now: number): number {
  if (header !== null) {
    const value = header.trim();
    const delta = now + Number(value) * 1000;
    if (/^\d+$/.test(value) && Number.isSafeInteger(delta)) return delta;
    // Retry-After is either delta-seconds or an HTTP date, never a signed number.
    if (/[a-z]/i.test(value)) {
      const date = Date.parse(value);
      if (Number.isFinite(date)) return Math.max(now, date);
    }
  }
  return now + Math.min(DAY, HOUR * 2 ** Math.min(failures - 1, 5));
}

function sentStatement(db: D1Database, receipts: [string, string | null, string | null][]) {
  return db.prepare(`INSERT INTO indexnow_sent (path, fingerprint, extra_token)
    SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]')
    FROM json_each(?) WHERE 1
    ON CONFLICT(path) DO UPDATE SET
      fingerprint = COALESCE(excluded.fingerprint, indexnow_sent.fingerprint),
      extra_token = COALESCE(excluded.extra_token, indexnow_sent.extra_token)`)
    .bind(JSON.stringify(receipts));
}

/** Import receipts from the old journal once, including sent prefixes of unfinished jobs. */
function legacyReceipts(jobs: PlannedJob[], extras: string[], token: string): Sent[] {
  const sent = new Map<string, Sent>();
  const completed = jobs.filter(j => j.complete && !j.superseded && j.entries)
    .sort((a,b) => a.finished_at-b.finished_at || a.sequence-b.sequence).at(-1);
  if (completed) {
    for (const [path,fingerprint] of JSON.parse(completed.entries!) as Snapshot) {
      if (eligiblePath(path)) sent.set(path,{path,fingerprint,extra_token:null});
    }
  }
  for (const job of jobs) {
    if (job.complete || !job.entries) continue;
    const snapshot = new Map(JSON.parse(job.entries) as Snapshot);
    for (const url of (JSON.parse(job.urls) as string[]).slice(0,job.cursor)) {
      const path = url.slice(INDEXNOW_ORIGIN.length);
      if (!eligiblePath(path)) continue;
      const previous = sent.get(path);
      const extraToken = extras.includes(url) ? token : path.startsWith(DONOR_PREFIX) && !snapshot.has(path)
        ? 'legacy-extra' : previous?.extra_token ?? null;
      // Older partial jobs can add receipts missing from the completed snapshot,
      // but must not replace its newer known fingerprints with older ones.
      const fingerprint = job.sequence <= (completed?.sequence ?? 0) && previous
        ? previous.fingerprint : snapshot.get(path) ?? previous?.fingerprint ?? null;
      sent.set(path,{path,fingerprint,extra_token:extraToken});
    }
  }
  return [...sent.values()];
}

/** The receiver has no idempotency token; journal successful batches locally. */
export async function runIndexNow(env: IndexNowEnv, now = Date.now(), send: typeof fetch = fetch,
  clock?: () => number): Promise<void> {
  if (env.INDEXNOW_ENABLED !== 'true' || env.STAGING_API || !env.CACHE_EPOCH) return;
  // Follow elapsed time across UTC midnight, while allowing deterministic stub tests.
  const epoch = env.CACHE_EPOCH;
  const started = Date.now(), time = clock ?? (() => now + Date.now() - started);
  const log = (event: string, detail: Record<string, unknown> = {}) => console.log(JSON.stringify({event,epoch,...detail}));
  const db = env.COMMUNITY_DB, owner = crypto.randomUUID(), cap = dailyCap(env.INDEXNOW_DAILY_CAP);
  const dry = env.INDEXNOW_DRY_RUN === 'true';
  const renew = async (attempt = time()) => {
    const lease = await db.prepare('UPDATE indexnow_control SET lease_until = ? WHERE id = 1 AND owner = ? AND lease_until > ?')
      .bind(attempt+120_000,owner,attempt).run();
    if (!lease.meta.changes) throw new Error('IndexNow lease expired');
  };
  let claimed = false;
  try {
    let job = await db.prepare('SELECT * FROM indexnow_jobs WHERE epoch = ?').bind(epoch).first<Job>();
    if (job?.complete || job?.superseded) return;
    if (!dry) {
      const lease = await db.prepare('UPDATE indexnow_control SET owner = ?, lease_until = ? WHERE id = 1 AND lease_until <= ?')
        .bind(owner,time()+120_000,time()).run();
      if (!lease.meta.changes) return;
      claimed = true;
      // A cron running the old code may still own a per-job lease during rollout.
      const held = await db.prepare('SELECT epoch FROM indexnow_jobs WHERE complete = 0 AND superseded = 0 AND lease_until > ?')
        .bind(time()).first();
      if (held) return;
      job = await db.prepare('SELECT * FROM indexnow_jobs WHERE epoch = ?').bind(epoch).first<Job>();
      if (job?.complete || job?.superseded) return;
    }
    if (!job || !job.plan_version) {
      const response = await env.ASSETS.fetch(new Request(`${INDEXNOW_ORIGIN}/crawl/indexnow.json`));
      if (!response.ok) throw new Error(`manifest ${response.status}`);
      const {entries} = await response.json<{entries:Snapshot}>();
      const {results:jobs} = await db.prepare(`SELECT j.*, s.entries, j.rowid AS sequence FROM indexnow_jobs j
        LEFT JOIN indexnow_snapshots s ON s.epoch = j.epoch ORDER BY j.rowid`).all<PlannedJob>();
      // An old rollout tick must not rebuild its legacy plan over a newer epoch
      // that already exists in the journal. The newest legacy tick takes over.
      const sequence = jobs.find(j => j.epoch === epoch)?.sequence;
      if (sequence !== undefined && jobs.some(j => j.sequence > sequence && !j.superseded)) return;
      const extra = extraUrls(env.INDEXNOW_EXTRA_PATHS);
      const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode([...extra].sort().join('\n')));
      const token = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2,'0')).join('');
      const control = await db.prepare('SELECT initialized FROM indexnow_control WHERE id = 1').first<{initialized:number}>();
      let receipts: Sent[];
      if (!control?.initialized) {
        receipts = legacyReceipts(jobs,extra,token);
        if (!dry) {
          await renew();
          await db.batch([
            sentStatement(db,receipts.map(r => [r.path,r.fingerprint,r.extra_token])),
            db.prepare('UPDATE indexnow_control SET initialized = 1 WHERE id = 1 AND owner = ?').bind(owner),
          ]);
        }
      } else receipts = (await db.prepare('SELECT * FROM indexnow_sent').all<Sent>()).results;
      const sent = new Map(receipts.map(r => [r.path,r]));
      const snapshot = new Map(entries);
      const pending = jobs.filter(j => !j.complete && !j.superseded);
      const extraTokens = new Map<string,string>();
      const carriedEntries = new Map<string,string>();
      const carry: string[] = [];
      for (const old of pending) {
        const oldSnapshot = new Map(old.entries ? JSON.parse(old.entries) as Snapshot : []);
        for (const [path,fingerprint] of JSON.parse(old.carried_entries) as Snapshot) oldSnapshot.set(path,fingerprint);
        const oldExtras = new Map(JSON.parse(old.extras) as Extra[]);
        for (const url of (JSON.parse(old.urls) as string[]).slice(old.cursor)) {
          const path = url.slice(INDEXNOW_ORIGIN.length);
          if (!eligiblePath(path)) continue;
          const extraToken = extra.includes(url) ? token : oldExtras.get(url)
            ?? (path.startsWith(DONOR_PREFIX) && !oldSnapshot.has(path) ? 'legacy-extra' : undefined);
          const fingerprint = snapshot.get(path) ?? oldSnapshot.get(path);
          const needsExtra = extraToken !== undefined && sent.get(path)?.extra_token !== extraToken;
          if (needsExtra) extraTokens.set(url,extraToken);
          if (needsExtra || (fingerprint !== undefined ? sent.get(path)?.fingerprint !== fingerprint : !sent.has(path))) {
            carry.push(url);
            if (!snapshot.has(path) && fingerprint !== undefined) carriedEntries.set(path,fingerprint);
          }
        }
      }
      for (const url of extra) {
        if (sent.get(url.slice(INDEXNOW_ORIGIN.length))?.extra_token !== token) extraTokens.set(url,token);
        else extraTokens.delete(url);
      }
      const baseline: Snapshot = receipts.filter((r): r is Sent & {fingerprint:string} => r.fingerprint !== null)
        .map(r => [r.path,r.fingerprint]);
      const needed = new Set([...changedUrls(entries,baseline),...carry,...extraTokens.keys()]);
      // Priority is based on changes in this epoch, even when earlier unsent work remains.
      const previous = jobs.filter(j => j.epoch !== epoch && j.entries).at(-1);
      const priority = new Set([...changedUrls(entries,previous ? JSON.parse(previous.entries!) as Snapshot : [])
        .filter(url => /\/(?:subject\/(?:person|donor)\/|doc\/division-)/.test(url)),...extraTokens.keys()]);
      // Keep privacy re-pings ahead of even a large set of changed divisions.
      const rank = (url: string) => !priority.has(url) ? 2
        : extraTokens.has(url) || url.includes('/subject/') ? 0 : 1;
      const urls = indexNowPayloads([...needed],10_000).flatMap(p => p.urlList)
        .sort((a,b) => rank(a)-rank(b) || a.localeCompare(b));
      if (extraTokens.size) log('indexnow_extra',{urls:extraTokens.size});
      if (dry) {
        log('indexnow_dry_run',{urls:urls.length,batches:indexNowPayloads(urls).length});
        return;
      }
      const serialized = JSON.stringify(entries), plan = JSON.stringify(urls);
      const serializedExtras = JSON.stringify([...extraTokens]), serializedCarry = JSON.stringify([...carriedEntries]);
      if (new TextEncoder().encode(serialized).length > 1_800_000
        || new TextEncoder().encode(plan+serializedExtras+serializedCarry).length > 1_800_000) {
        throw new Error('IndexNow journal exceeds row budget');
      }
      const next = Math.max(0,...pending.map(j => j.next_attempt_at));
      const failures = Math.max(0,...pending.map(j => j.failure_count));
      await renew();
      await db.batch([
        db.prepare('INSERT OR REPLACE INTO indexnow_snapshots (epoch, entries) VALUES (?, ?)').bind(epoch,serialized),
        db.prepare(`INSERT INTO indexnow_jobs (epoch, urls, total, extras, carried_entries, plan_version, next_attempt_at, failure_count)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?) ON CONFLICT(epoch) DO UPDATE SET
          urls = excluded.urls, cursor = 0, total = excluded.total, extras = excluded.extras, plan_version = 1,
          carried_entries = excluded.carried_entries,
          next_attempt_at = excluded.next_attempt_at, failure_count = excluded.failure_count`)
          .bind(epoch,plan,urls.length,serializedExtras,serializedCarry,next,failures),
        db.prepare('UPDATE indexnow_jobs SET superseded = 1 WHERE complete = 0 AND superseded = 0 AND epoch != ?').bind(epoch),
      ]);
      log('indexnow_plan',{urls:urls.length,superseded:pending.filter(j => j.epoch !== epoch).length});
      job = await db.prepare('SELECT * FROM indexnow_jobs WHERE epoch = ?').bind(epoch).first<Job>();
    }
    if (!job || job.complete || job.superseded) return;
    const urls = JSON.parse(job.urls) as string[];
    if (dry) { log('indexnow_dry_run',{urls:urls.length-job.cursor,batches:indexNowPayloads(urls.slice(job.cursor)).length}); return; }
    if (job.next_attempt_at > time() && job.cursor < urls.length) return;
    await renew();
    await db.prepare('UPDATE indexnow_jobs SET owner = ?, lease_until = ? WHERE epoch = ?')
      .bind(owner,time()+120_000,epoch).run();
    const row = await db.prepare('SELECT entries FROM indexnow_snapshots WHERE epoch = ?').bind(epoch).first<{entries:string}>();
    if (!row) throw new Error('IndexNow snapshot disappeared');
    const snapshot = new Map(JSON.parse(row.entries) as Snapshot), extras = new Map(JSON.parse(job.extras) as Extra[]);
    for (const [path,fingerprint] of JSON.parse(job.carried_entries) as Snapshot) snapshot.set(path,fingerprint);
    let cursor = job.cursor;
    // At most two 500-URL batches (20 seconds of fetch time) per five-minute tick.
    for (let batch = 0; batch < 2 && cursor < urls.length; batch++) {
      const attempt = time(), day = new Date(attempt).toISOString().slice(0,10);
      await renew(attempt);
      await db.prepare('INSERT OR IGNORE INTO indexnow_daily (day) VALUES (?)').bind(day).run();
      const daily = await db.prepare('SELECT urls_sent FROM indexnow_daily WHERE day = ?').bind(day).first<{urls_sent:number}>();
      const allowance = Math.max(0,cap-(daily?.urls_sent ?? 0));
      if (!allowance) break;
      const payload = indexNowPayloads(urls.slice(cursor,cursor+Math.min(INDEXNOW_BATCH_SIZE,allowance)))[0];
      if (!payload) throw new Error('Invalid IndexNow journal URL');
      // Reserve before sending: failed/ambiguous requests also consume the daily traffic budget.
      const reserved = await db.prepare(`UPDATE indexnow_daily SET urls_sent = urls_sent + ? WHERE day = ? AND urls_sent + ? <= ?
        AND EXISTS (SELECT 1 FROM indexnow_control WHERE id = 1 AND owner = ? AND lease_until > ?)`)
        .bind(payload.urlList.length,day,payload.urlList.length,cap,owner,time()).run();
      if (!reserved.meta.changes) break;
      const response = await send('https://api.indexnow.org/indexnow',{
        method:'POST',headers:{'content-type':'application/json; charset=utf-8'},body:JSON.stringify(payload),signal:AbortSignal.timeout(10_000),
      });
      await response.body?.cancel().catch(() => {});
      await renew();
      if (response.status === 429 || response.status >= 500) {
        const failures = job.failure_count+1, next = retryAt(response.headers.get('retry-after'),failures,time());
        await db.prepare('UPDATE indexnow_jobs SET next_attempt_at = ?, failure_count = ? WHERE epoch = ? AND owner = ?')
          .bind(next,failures,epoch,owner).run();
        log('indexnow_backoff',{status:response.status,next_attempt_at:next,failure_count:failures});
        return;
      }
      if (response.status !== 200 && response.status !== 202) throw new Error(`IndexNow HTTP ${response.status}`);
      cursor += payload.urlList.length;
      await db.batch([
        sentStatement(db,payload.urlList.map(url => {
          const path = url.slice(INDEXNOW_ORIGIN.length);
          return [path,snapshot.get(path) ?? null,extras.get(url) ?? null];
        })),
        db.prepare('UPDATE indexnow_jobs SET cursor = ?, next_attempt_at = 0, failure_count = 0 WHERE epoch = ? AND owner = ?')
          .bind(cursor,epoch,owner),
        db.prepare('UPDATE indexnow_daily SET urls_accepted = urls_accepted + ? WHERE day = ?').bind(payload.urlList.length,day),
      ]);
      job.failure_count = 0;
      log('indexnow_batch_accepted',{urls:payload.urlList.length,cursor,status:response.status});
    }
    if (cursor >= urls.length) {
      await db.batch([
        db.prepare('UPDATE indexnow_jobs SET complete = 1, finished_at = ? WHERE epoch = ? AND owner = ?').bind(time(),epoch,owner),
        db.prepare('DELETE FROM indexnow_snapshots WHERE epoch != ? AND epoch IN (SELECT epoch FROM indexnow_jobs WHERE complete = 1 OR superseded = 1)').bind(epoch),
        db.prepare("UPDATE indexnow_jobs SET urls = '[]', extras = '[]', carried_entries = '[]' WHERE complete = 1 OR superseded = 1"),
      ]);
      log('indexnow_epoch_complete',{urls:urls.length});
    }
  } catch (err) {
    log('indexnow_failed',{message:err instanceof Error ? err.message : String(err)});
  } finally {
    if (claimed) {
      try {
        await db.batch([
          db.prepare('UPDATE indexnow_jobs SET owner = NULL, lease_until = 0 WHERE epoch = ? AND owner = ?').bind(epoch,owner),
          db.prepare('UPDATE indexnow_control SET owner = NULL, lease_until = 0 WHERE id = 1 AND owner = ?').bind(owner),
        ]);
      } catch { log('indexnow_lease_release_failed'); }
    }
    try {
      const job = await db.prepare('SELECT * FROM indexnow_jobs WHERE epoch = ?').bind(epoch).first<Job>();
      const day = new Date(time()).toISOString().slice(0,10);
      const daily = await db.prepare('SELECT urls_sent, urls_accepted FROM indexnow_daily WHERE day = ?')
        .bind(day).first<{urls_sent:number;urls_accepted:number}>();
      log('indexnow_status',{cursor:job?.cursor ?? 0,total:job?.total ?? 0,next_attempt_at:job?.next_attempt_at ?? 0,
        complete:job?.complete ?? 0,superseded:job?.superseded ?? 0,day,daily_cap:cap,
        urls_sent_today:daily?.urls_sent ?? 0,urls_accepted_today:daily?.urls_accepted ?? 0});
    } catch { /* A missing migration has already been reported above. */ }
  }
}
