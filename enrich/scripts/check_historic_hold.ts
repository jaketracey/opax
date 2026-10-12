// T1 preflight: the orchestrator must run this successfully before pushing any units.
export async function checkHistoricHold(endpoint: string, token: string, fetcher: typeof fetch = fetch): Promise<void> {
  const url = new URL('/status', endpoint)
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('admin URL must use HTTPS')
  if (token.length < 16) throw new Error('ENRICH_ADMIN_TOKEN is required')
  const response = await fetcher(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error('historic hold status unavailable; refuse T1 push')
  const status = await response.json() as { historicHold?: unknown } | null
  if (status?.historicHold !== true) throw new Error('historicHold must be true; refuse T1 push')
}

if (process.argv[1] === import.meta.filename) {
  checkHistoricHold(process.env.OPAX_ENRICH_URL ?? '', process.env.ENRICH_ADMIN_TOKEN ?? '')
    .then(() => console.log('historicHold=true; T1 preflight passed'))
    .catch(() => { console.error('T1 push refused: historic hold could not be confirmed.'); process.exitCode = 1 })
}
