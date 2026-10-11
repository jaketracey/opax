// Local safety boundary only: real table APIs, D1, assets and SSR are unchanged.
import worker from '../src/index.ts';
export default {
  fetch(request,env,ctx) {
    const path=new URL(request.url).pathname;
    // Missing local bill text must not enter the production resource proxy.
    if (path.startsWith('/bill-texts/')) return env.ASSETS.fetch(request);
    if ((path.startsWith('/api/') && !path.startsWith('/api/table/')) || path.startsWith('/ingest/')) return Response.json({results:[],total:0,collections:[]});
    return worker.fetch(request,env,ctx);
  },
};
