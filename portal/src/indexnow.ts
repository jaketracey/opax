/** Public IndexNow ownership key. This is not a credential. */
export const INDEXNOW_KEY = '3fd7466e2dc64b00a55ee502b82c51ad';
export const INDEXNOW_ORIGIN = 'https://opax.com.au';
export const INDEXNOW_BATCH_SIZE = 1000; // protocol allows at most 10,000
export const INDEXNOW_CRON = '*/5 * * * *';
type Snapshot = [string, string][];
interface Job { epoch: string; urls: string; cursor: number; complete: number }
type IndexNowEnv = Pick<Env, 'ASSETS' | 'COMMUNITY_DB' | 'CACHE_EPOCH'> & {
  INDEXNOW_ENABLED?: string; INDEXNOW_DRY_RUN?: string; STAGING_API?: Fetcher;
  /** Optional private secret: one-off donor paths to re-crawl (see extraUrls). */
  INDEXNOW_EXTRA_PATHS?: string;
};
const EXTRA_PATH = /^\/subject\/donor\/[^/?#]+$/;

/**
 * One-off donor pages to re-crawl with the next epoch's job, from the private
 * INDEXNOW_EXTRA_PATHS secret (whitespace-separated paths or opax.com.au URLs).
 * Donor pages made noindex by the October 2026 privacy hotfix are pinged so
 * engines see the noindex, without naming anyone in the public crawl assets
 * (/crawl/indexnow.json is served). Only donor paths are taken; at most 1,000.
 */
export function extraUrls(list = ''): string[] {
  return [...new Set(list.split(/\s+/).map(line => line.replace(/^https:\/\/opax\.com\.au(?=\/)/, '')).filter(path => EXTRA_PATH.test(path)))]
    .slice(0, 1000).map(path => INDEXNOW_ORIGIN + path);
}

export function changedUrls(entries: Snapshot, previous: Snapshot = []): string[] {
  const before = new Map(previous);
  return [...new Set(entries.filter(([path,fingerprint]) => {
    return /^\/(?:bill\/au-[a-z0-9-]+|doc\/division-[a-z0-9-]+|subject\/person\/[^/?#]+)$/.test(path)
      && !/\/(?:null|undefined)$/i.test(decodeURIComponent(path)) && before.get(path) !== fingerprint;
  }).map(([path]) => INDEXNOW_ORIGIN + path))].sort();
}

export function indexNowPayloads(urls: string[], size = INDEXNOW_BATCH_SIZE) {
  if (!Number.isInteger(size) || size < 1 || size > 10_000) throw new Error('Invalid IndexNow batch size');
  const eligible = [...new Set(urls)].filter(raw => {
    try { const u = new URL(raw); return u.origin === INDEXNOW_ORIGIN && !u.search && !u.hash && (changedUrls([[u.pathname,'current']]).length > 0 || EXTRA_PATH.test(u.pathname)); } catch { return false; }
  }).sort();
  return Array.from({length:Math.ceil(eligible.length / size)},(_,i) => ({
    host: 'opax.com.au', key: INDEXNOW_KEY, keyLocation: `${INDEXNOW_ORIGIN}/${INDEXNOW_KEY}.txt`, urlList: eligible.slice(i * size,(i+1)*size),
  }));
}

/** The receiver has no idempotency token; journal successful batches locally. */
export async function runIndexNow(env: IndexNowEnv, now = Date.now(), send: typeof fetch = fetch): Promise<void> {
  if (env.INDEXNOW_ENABLED !== 'true' || env.STAGING_API || !env.CACHE_EPOCH) return;
  const log = (event: string, detail: Record<string, unknown> = {}) => console.log(JSON.stringify({event,epoch:env.CACHE_EPOCH,...detail}));
  const db = env.COMMUNITY_DB;
  const owner = crypto.randomUUID();
  let claimed = false;
  try {
    let job = await db.prepare('SELECT epoch, urls, cursor, complete FROM indexnow_jobs WHERE epoch = ?').bind(env.CACHE_EPOCH).first<Job>();
    if (job?.complete) return;
    if (!job) {
      const response = await env.ASSETS.fetch(new Request(`${INDEXNOW_ORIGIN}/crawl/indexnow.json`));
      if (!response.ok) throw new Error(`manifest ${response.status}`);
      const {entries} = await response.json<{entries:Snapshot}>();
      const baseline = await db.prepare('SELECT entries FROM indexnow_snapshots WHERE epoch = (SELECT epoch FROM indexnow_jobs WHERE complete = 1 ORDER BY finished_at DESC LIMIT 1)').first<{entries:string}>();
      const extra = extraUrls(env.INDEXNOW_EXTRA_PATHS);
      const urls = [...new Set([...changedUrls(entries,baseline ? JSON.parse(baseline.entries) as Snapshot : []), ...extra])].sort();
      if (extra.length) log('indexnow_extra',{urls:extra.length});
      if (env.INDEXNOW_DRY_RUN === 'true') {
        log('indexnow_dry_run',{urls:urls.length,batches:indexNowPayloads(urls).length});
        return; // no external request, journal, lease or baseline advancement
      }
      const snapshot = JSON.stringify(entries), plan = JSON.stringify(urls);
      if (snapshot.length > 1_800_000 || plan.length > 1_800_000) throw new Error('IndexNow journal exceeds row budget');
      await db.batch([
        db.prepare('INSERT OR IGNORE INTO indexnow_snapshots (epoch, entries) VALUES (?, ?)').bind(env.CACHE_EPOCH,snapshot),
        db.prepare('INSERT OR IGNORE INTO indexnow_jobs (epoch, urls) VALUES (?, ?)').bind(env.CACHE_EPOCH,plan),
      ]);
      job = await db.prepare('SELECT epoch, urls, cursor, complete FROM indexnow_jobs WHERE epoch = ?').bind(env.CACHE_EPOCH).first<Job>();
    }
    if (!job || job.complete) return;
    const urls = JSON.parse(job.urls) as string[];
    if (env.INDEXNOW_DRY_RUN === 'true') { log('indexnow_dry_run',{urls:urls.length-job.cursor,batches:indexNowPayloads(urls.slice(job.cursor)).length}); return; }
    // Atomic D1 lease, rather than an eventually consistent KV read/write lock.
    const lease = await db.prepare('UPDATE indexnow_jobs SET owner = ?, lease_until = ? WHERE epoch = ? AND complete = 0 AND lease_until <= ?')
      .bind(owner,now+120_000,env.CACHE_EPOCH,now).run();
    if (!lease.meta.changes) return;
    claimed = true;
    job = await db.prepare('SELECT epoch, urls, cursor, complete FROM indexnow_jobs WHERE epoch = ?').bind(env.CACHE_EPOCH).first<Job>();
    if (!job) throw new Error('IndexNow job disappeared');
    let cursor = job.cursor;
    // At most two batches (20 seconds of fetch time) per five-minute tick.
    for (const payload of indexNowPayloads(urls.slice(cursor)).slice(0,2)) {
      const response = await send('https://api.indexnow.org/indexnow',{
        method:'POST',headers:{'content-type':'application/json; charset=utf-8'},body:JSON.stringify(payload),signal:AbortSignal.timeout(10_000),
      });
      await response.body?.cancel().catch(() => {});
      if (response.status !== 200 && response.status !== 202) throw new Error(`IndexNow HTTP ${response.status}`);
      cursor += payload.urlList.length;
      await db.prepare('UPDATE indexnow_jobs SET cursor = ? WHERE epoch = ? AND owner = ?').bind(cursor,env.CACHE_EPOCH,owner).run();
      log('indexnow_batch_accepted',{urls:payload.urlList.length,cursor,status:response.status});
    }
    if (cursor >= urls.length) {
      await db.prepare('UPDATE indexnow_jobs SET complete = 1, finished_at = ? WHERE epoch = ? AND owner = ?').bind(now,env.CACHE_EPOCH,owner).run();
      // Keep the last baseline, pending snapshots and tiny completed receipts.
      await db.batch([
        db.prepare('DELETE FROM indexnow_snapshots WHERE epoch IN (SELECT epoch FROM indexnow_jobs WHERE complete = 1 AND epoch != ?)').bind(env.CACHE_EPOCH),
        db.prepare("UPDATE indexnow_jobs SET urls = '[]' WHERE complete = 1"),
      ]);
      log('indexnow_epoch_complete',{urls:urls.length});
    }
  } catch (err) {
    log('indexnow_failed',{message:err instanceof Error ? err.message : String(err)});
  } finally {
    if (claimed) {
      try { await db.prepare('UPDATE indexnow_jobs SET owner = NULL, lease_until = 0 WHERE epoch = ? AND owner = ?').bind(env.CACHE_EPOCH,owner).run(); }
      catch { log('indexnow_lease_release_failed'); }
    }
  }
}
