import {readFileSync} from 'node:fs';
import {cacheKeyParams} from '../src/cache-key.ts';
import {counts, speeches, topics} from './fixtures/server-html.mjs';

// The search page key's version text, read from the Worker itself: a seed that
// copies it by hand misses the cache the day the key moves on, and the topic
// page then asks the (offline) record and answers 503.
const SEARCH_PAGE_KEY = /\\n(years-topics-[a-z0-9-]+)\\n\$\{keyParams\(\['nocache'\]\)\}/.exec(readFileSync(new URL('../src/index.ts',import.meta.url),'utf8'))?.[1];
if (!SEARCH_PAGE_KEY) throw new Error('The search page cache key was not found in src/index.ts');

/** Seed the existing cache keys with fixture responses. No network or new API. */
export async function seedTopicCache(env, cache) {
  for(const slug of topics) {
    const q = slug === 'housing' ? 'housing' : 'climate and environment';
    const params = new URLSearchParams({q,kind:'speech',mode:'hybrid',page:'1',per:'200',sort:'newest',topic:slug});
    const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${env.CACHE_EPOCH}\npredict\n${SEARCH_PAGE_KEY}\n${cacheKeyParams(params,['nocache'])}`));
    const key = [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
    await cache.put(new Request(`https://cache.opax.internal/search/${key}`),Response.json(speeches,{headers:{'cache-control':'public, max-age=3600'}}));
    await cache.put(new Request(`https://opax.com.au/api/topic/${slug}`),Response.json({...counts,slug},{headers:{'x-opax-cached-at':new Date().toISOString(),'cache-control':'public, max-age=3600'}}));
  }
}
