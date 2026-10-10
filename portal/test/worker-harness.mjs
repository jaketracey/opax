// The real Worker over an export directory, offline: disk-backed ASSETS, a
// minimal HTMLRewriter, an empty Cache API and a refused network. Shared by
// test/donor-privacy.test.mjs and scripts/donor_privacy_changed_urls.mjs.
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {build} from 'esbuild';

const esc = v => String(v).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
/** Only the transformations the Worker's SEO and share-card code use. */
class Rewriter {
  handlers = [];
  on(selector, handler) { this.handlers.push([selector, handler]); return this; }
  transform(response) {
    const handlers = this.handlers;
    return new Response(new ReadableStream({async start(controller) {
      let html = await response.text();
      for (const [selector, handler] of handlers) {
        const mutate = (outer, open, inner, close) => {
          let attr = open, body = inner, removed = false;
          handler.element({setAttribute(name, value) { const re = new RegExp(` ${name}="[^"]*"`); const next = ` ${name}="${esc(value)}"`; attr = re.test(attr) ? attr.replace(re, next) : attr.replace(/>$/, next + '>'); },
            setInnerContent(value, opts) { body = opts?.html ? value : esc(value); }, append(value) { body += value; }, remove() { removed = true; }});
          return removed ? '' : attr + body + close;
        };
        if (selector === 'main#main') html = html.replace(/(<main\b[^>]*>)([\s\S]*?)(<\/main>)/, mutate);
        else if (selector === 'div#crawl-facts') html = html.replace(/(<div\b[^>]*id="crawl-facts"[^>]*>)([\s\S]*?)(<\/div>)/, mutate);
        else if (selector === 'title') html = html.replace(/(<title>)([\s\S]*?)(<\/title>)/, mutate);
        else if (selector === 'head') html = html.replace(/(<head>)([\s\S]*?)(<\/head>)/, mutate);
        else if (selector === 'script#ld-page') html = html.replace(/(<script\b[^>]*id="ld-page"[^>]*>)([\s\S]*?)(<\/script>)/, mutate);
        else { const m = /^(meta|link)\[(name|property|rel)="([^"]+)"\]$/.exec(selector); if (m) html = html.replace(new RegExp(`<${m[1]}\\b[^>]*${m[2]}="${m[3]}"[^>]*>`, 'g'), outer => mutate(outer, outer, '', '')); }
      }
      controller.enqueue(new TextEncoder().encode(html)); controller.close();
    }}), response);
  }
}

/** What would have gone to a model or the knowledge box; every such call is refused. */
export const outbound = [];
const realFetch = globalThis.fetch;
export function offline() {
  globalThis.HTMLRewriter = Rewriter;
  globalThis.caches ??= {default: {match: async () => undefined, put: async () => {}}};
  globalThis.fetch = async (input, init) => { outbound.push(String(init?.body ?? '')); throw new Error('network disabled: offline Worker harness'); };
  return () => { globalThis.fetch = realFetch; };
}

/** Bundle a Worker entry (share-card rendering stubbed) and serve it over `root`. */
export async function loadWorker(entry, root) {
  const compiled = await build({entryPoints: [entry], bundle: true, platform: 'browser', format: 'esm', write: false, external: ['node:*'],
    plugins: [{name: 'omit-images', setup(b) { b.onResolve({filter: /^\.\/og-render$/}, () => ({path: 'images', namespace: 'harness'})); b.onLoad({filter: /.*/, namespace: 'harness'}, () => ({contents: 'export const renderOgPng=()=>{};export const renderOgJpeg=()=>{};', loader: 'js'})); }}]});
  const {default: worker} = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  const files = new Map(), parsed = new Map();
  const at = path => join(root, path.replace(/^\//, ''));
  const file = path => { if (!files.has(path)) files.set(path, existsSync(at(path)) ? readFileSync(at(path)) : null); return files.get(path); };
  // The shell's own main element holds the static app (128 KB) that every server-rendered
  // page replaces with its answer; serving it empty changes no rendered output, only time.
  files.set('index.html', Buffer.from(readFileSync(at('index.html'), 'utf8').replace(/(<main\b[^>]*>)[\s\S]*?(<\/main>)/, '$1$2')));
  const origin = 'https://opax.com.au';
  const env = {COMMUNITY_ORIGIN: origin, CACHE_EPOCH: 'offline-harness', ARAG_ZONE: 'offline', ARAG_KB_ID: 'offline', ARAG_KB_TOKEN: 'offline', ASSETS: {async fetch(req) {
    const path = new URL(req.url).pathname;
    const body = file(path === '/' ? 'index.html' : path === '/home' ? 'home.html' : path);
    if (!body) return new Response('Missing', {status: 404});
    const response = new Response(body, {headers: {'content-type': path.endsWith('.json') ? 'application/json' : 'text/html'}});
    if (path.endsWith('.json')) response.json = async () => { if (!parsed.has(path)) parsed.set(path, JSON.parse(body.toString('utf8'))); return parsed.get(path); };
    return response;
  }}};
  const ctx = {waitUntil() {}, passThroughOnException() {}};
  return {env, fetch: (path, init) => worker.fetch(new Request(origin + path, init), env, ctx)};
}

/** Everything the Worker writes into the static shell: the head and the main element. */
export const rendered = html => [...html.matchAll(/<head>[\s\S]*?<\/head>|<main\b[\s\S]*?<\/main>|<div\b[^>]*id="crawl-facts"[\s\S]*?<\/div>/g)].map(m => m[0]).join('\n');
