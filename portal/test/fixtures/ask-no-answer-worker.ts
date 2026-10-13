import worker from '../../src/index'
import {stubFetch} from './ask-no-answer.mjs'
// Fail closed for every network destination. No remote bindings or real secrets.
globalThis.fetch = stubFetch as typeof fetch
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const mode = request.headers.get('x-fixture-case') || 'declined'
    return worker.fetch(request, {...env, ARAG_ZONE:'offline', ARAG_KB_ID:'offline', ARAG_KB_TOKEN:'offline',
      COMMUNITY_ORIGIN:new URL(request.url).origin, ASK_MODEL:'fixture-'+mode, CACHE_EPOCH:'fixture-'+mode, COMMUNITY_ENABLED:'false', INDEXNOW_ENABLED:'false',
      DAILY_POST_ENABLED:'false', BLUESKY_POST_ENABLED:'false'}, ctx)
  }
}
