/** W19: bounded static catalog reads, shared per deployment/asset binding. */
import {appJson, appRead, readOnly, sha256, validDate} from './app-http'
import {voiceConfigured, type VoiceConfig} from './voice-config'

type ManifestEnv = Pick<Env, 'ASSETS'> & VoiceConfig & {APP_MINIMUM_VERSION?: string}
type Catalog = {url: string; sha256: string; as_of: string | null}
type Snapshot = {data_version: string; generated_at: string | null; catalogs: Record<string,Catalog>}
const ROOTS = {
  corpus:'/corpus.json', parliamentarians:'/parliamentarians.json', votes:'/votes.json', bills:'/bills/index.json',
  interests:'/interests/index.json', recent_interests:'/interests/recent.json', pay:'/pay.json', expenses:'/expenses.json',
  expense_categories:'/expense-categories.json', portraits:'/photos/people.json',
  portrait_credits:'/photos/credits.json', electorates:'/electorates/manifest.json',
} as const
const snapshots = new WeakMap<Fetcher, {until: number; value: Promise<Snapshot>}>()

function record(value: unknown): Record<string,unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid catalog')
  return value as Record<string,unknown>
}

function sourceDate(value: unknown): string | null {
  return typeof value === 'string' && validDate(value.slice(0,10)) && Number.isFinite(Date.parse(value)) ? value : null
}

function asOf(data: Record<string,unknown>): string | null {
  const meta = data.meta ? record(data.meta) : data._meta ? record(data._meta) : {}
  return sourceDate(meta.as_of) ?? sourceDate(meta.as_at) ?? sourceDate(data.generated_at)
    ?? sourceDate(meta.generated_at) ?? sourceDate(meta.generated) ?? sourceDate(meta.updated) ?? sourceDate(data.generated)
}

async function staticCatalog(assets: Fetcher, path: string): Promise<{data: Record<string,unknown>; catalog: Catalog}> {
  // Fixed local asset paths only; credentials, redirects and external fetch are absent.
  const res = await assets.fetch(new Request('https://app-assets.invalid' + path))
  if (res.status !== 200 || !res.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new Error('Catalog unavailable')
  const bytes = await res.arrayBuffer()
  const data = record(JSON.parse(new TextDecoder().decode(bytes)))
  return {data, catalog:{url:path, sha256:await sha256(bytes), as_of:asOf(data)}}
}

async function snapshot(assets: Fetcher): Promise<Snapshot> {
  const entries = await Promise.all(Object.entries(ROOTS).map(async ([key,path]) => [key,await staticCatalog(assets,path)] as const))
  const catalogs: Record<string,Catalog> = Object.fromEntries(entries.map(([key,value]) => [key,value.catalog]))
  const corpus = entries.find(([key]) => key === 'corpus')![1].data
  const refresh = corpus.refresh ? record(corpus.refresh) : {}
  const generated_at = sourceDate(refresh.checked_at) ?? sourceDate(corpus.version)
  catalogs.corpus.as_of = generated_at
  const electorates = entries.find(([key]) => key === 'electorates')![1].data
  if (typeof electorates.release_id !== 'string' || !/^[a-f0-9]{16}$/.test(electorates.release_id)) throw new Error('Invalid release')
  const files = record(electorates.files)
  const base = `/electorates/releases/${electorates.release_id}/`
  // This content-addressed release already publishes hashes, including all seats.
  // Reuse them without downloading hundreds of files on a manifest request.
  for (const name of ['index.json','people.json']) {
    if (!files[name]) throw new Error('Incomplete release')
  }
  for (const [name,hash] of Object.entries(files).sort(([a],[b]) => a.localeCompare(b))) {
    // Match the native catalog policy. Web-only entries are non-essential:
    // their absence or malformed metadata cannot disable app catalogs.
    if (!/^(?:index|people|el_[a-f0-9]{24})\.json$/.test(name)) continue
    if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid release file')
    catalogs[`electorates/${name}`] = {url:base + name, sha256:hash, as_of:catalogs.electorates.as_of}
  }
  for (const [field,name] of [['index_url','index.json'],['people_url','people.json']]) {
    if (electorates[field] !== base + name) throw new Error('Invalid release URL')
  }
  return {data_version:await sha256(JSON.stringify(catalogs)), generated_at, catalogs}
}

function cachedSnapshot(assets: Fetcher): Promise<Snapshot> {
  if (!assets || typeof assets.fetch !== 'function') throw new Error('Assets unavailable')
  const at = Date.now(), existing = snapshots.get(assets)
  if (existing && existing.until > at) return existing.value
  const value = snapshot(assets)
  const entry = {until:at + 300_000, value}
  snapshots.set(assets,entry)
  // Failed or incomplete catalogs are never cached as a usable bundle.
  void value.catch(() => {if (snapshots.get(assets) === entry) snapshots.delete(assets)})
  return value
}

export async function appManifest(req: Request, env: ManifestEnv): Promise<Response> {
  const method = readOnly(req)
  if (method) return method
  if (new URL(req.url).search) return appJson(req, {error:'invalid_query'}, 400)
  try {
    const data = await cachedSnapshot(env.ASSETS)
    const configured = env.APP_MINIMUM_VERSION?.trim() ?? ''
    const minimum_app_version = /^(?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8})$/.test(configured) ? configured : '0.0.0'
    return await appRead(req, {schema_version:1, ...data, minimum_app_version,
      features:{public_data:true, voice:voiceConfigured(env), community:false, push:false}})
  } catch {
    return appJson(req, {error:'manifest_unavailable'}, 503, {'retry-after':'60'})
  }
}
