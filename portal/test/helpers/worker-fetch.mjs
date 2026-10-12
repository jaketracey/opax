// The real Worker, bundled once, answering page requests from the built
// public/ assets: what a reader's browser would be served, without a network.
import { readFileSync, statSync } from 'node:fs';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const publicRoot = new URL('../../public/', import.meta.url);
export const origin = 'https://opax.test';

// The HTMLRewriter operations the Worker's page renderers use, over jsdom.
export class HTMLRewriter {
  handlers = [];
  on(selector, handler) { this.handlers.push([selector, handler]); return this; }
  transform(response) {
    const handlers = this.handlers;
    return new Response(new ReadableStream({ async start(controller) {
      const dom = new JSDOM(await response.text());
      for (const [selector, handler] of handlers) {
        for (const node of dom.window.document.querySelectorAll(selector)) {
          handler.element({
            getAttribute: name => node.getAttribute(name),
            setAttribute: (name, value) => node.setAttribute(name, value),
            setInnerContent(value, options) { if (options?.html) node.innerHTML = value; else node.textContent = value; },
            append: value => node.insertAdjacentHTML('beforeend', value),
            after: value => node.insertAdjacentHTML('afterend', value),
            remove: () => node.remove(),
          });
        }
      }
      controller.enqueue(new TextEncoder().encode(dom.serialize()));
      controller.close();
      dom.window.close();
    } }), response);
  }
}

let worker;
async function loadWorker() {
  if (worker) return worker;
  const compiled = await build({
    entryPoints: [new URL('../../src/index.ts', import.meta.url).pathname],
    bundle: true, platform: 'browser', format: 'esm', write: false, external: ['node:*'],
    plugins: [{ name: 'omit-images', setup(builder) {
      builder.onResolve({ filter: /^\.\/og-render$/ }, () => ({ path: 'images', namespace: 'worker-fetch-test' }));
      builder.onLoad({ filter: /.*/, namespace: 'worker-fetch-test' }, () => ({ contents: 'export const renderOgPng=()=>{}; export const renderOgJpeg=()=>{}; export const renderStoryJpeg=()=>{};' }));
    } }],
  });
  globalThis.HTMLRewriter = HTMLRewriter;
  ({ default: worker } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64')));
  return worker;
}

/** The Worker's response for a path. `env` overrides the deployment's values. */
export async function workerFetch(path, env = {}, init = {}) {
  const fetchHandler = await loadWorker();
  const assets = { async fetch(request) {
    const pathname = new URL(request.url).pathname;
    const isFile = url => { try { return statSync(url).isFile(); } catch { return false; } };
    // As the assets binding does: "/community" is community.html.
    let file = new URL(pathname === '/' ? 'index.html' : pathname === '/home' ? 'home.html' : pathname.slice(1), publicRoot);
    if (!isFile(file) && isFile(new URL(file.href + '.html'))) file = new URL(file.href + '.html');
    if (!isFile(file)) return new Response('Missing', { status: 404 });
    const type = pathname.endsWith('.json') ? 'application/json' : pathname.endsWith('.js') ? 'text/javascript' : 'text/html';
    return new Response(readFileSync(file), { headers: { 'content-type': type } });
  } };
  return fetchHandler.fetch(new Request(origin + path, init), { COMMUNITY_ORIGIN: origin, VIC_ELECTION_HUB_ENABLED: 'true', ASSETS: assets, ...env }, { waitUntil() {} });
}
