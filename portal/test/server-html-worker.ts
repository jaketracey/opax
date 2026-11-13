// Local Wrangler entry for offline curl and browser acceptance. Never deployed.
import worker from '../src/index'
import {files, counts, speeches} from './fixtures/server-html.mjs'
import {seedTopicCache} from './server-html-cache.mjs'

let ready: Promise<void> | undefined
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    ready ??= seedTopicCache(env, caches.default)
    await ready
    const path = new URL(request.url).pathname
    if (path.startsWith('/api/topic/')) return Response.json({...counts,slug:path.split('/').at(-1)})
    if (path === '/api/search') return Response.json(speeches)
    if (path === '/api/display-policy') return Response.json({SA_HANSARD_FULL_TEXT:'false'})
    if (path === '/api/person-slugs') return Response.json({})
    if (path === '/api/stats') return Response.json({resources:500,paragraphs:500,kinds:{},speeches_by_state:{}})
    if (path.startsWith('/api/')) return Response.json({items:[],topics:[],parties:[],decades:[]})
    const assets = env.ASSETS
    const fixtureAssets = {fetch: async (input: Request) => {
      const assetPath = new URL(input.url).pathname
      return Object.hasOwn(files,assetPath) ? Response.json(files[assetPath]) : assets.fetch(input)
    }}
    if(Object.hasOwn(files,path)) return Response.json(files[path])
    return worker.fetch(request, {...env, ASSETS:fixtureAssets} as Env, ctx)
  },
}
