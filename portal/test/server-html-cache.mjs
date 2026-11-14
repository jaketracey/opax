import {cacheKeyParams} from '../src/cache-key.ts';
import {counts, speeches, topics} from './fixtures/server-html.mjs';

/** Seed the existing cache keys with fixture responses. No network or new API. */
export async function seedTopicCache(env, cache) {
  for(const slug of topics) {
    const q = slug === 'housing' ? 'housing' : 'climate and environment';
    const params = new URLSearchParams({q,kind:'speech',mode:'hybrid',page:'1',per:'200',sort:'newest',topic:slug});
    const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${env.CACHE_EPOCH}\npredict\nyears-topics-v3-split-speakers-passage-v3-mixed-speakers-v1-bounded-v1-source-url-v2-word-count-v1\n${cacheKeyParams(params,['nocache'])}`));
    const key = [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
    await cache.put(new Request(`https://cache.opax.internal/search/${key}`),Response.json(speeches,{headers:{'cache-control':'public, max-age=3600'}}));
    await cache.put(new Request(`https://opax.com.au/api/topic/${slug}`),Response.json({...counts,slug},{headers:{'x-opax-cached-at':new Date().toISOString(),'cache-control':'public, max-age=3600'}}));
  }
}
