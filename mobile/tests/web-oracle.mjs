// Where the web app takes an OPAX address, worked out by running the web
// app's own source with browser effects stubbed. It never reads the app's
// guard (src/navigation/external.ts): tests/web-router.test.ts checks the
// guard against it.
// - The Worker: machine routes (portal/src/index.ts fetch(): /today, /mcp,
//   /.well-known/, /api/, /og/ and /ingest/ never serve a page), the entry
//   redirects (portal/src/page-entry.ts, imported as is) and Community's own
//   page (/community and /community.html).
// - The homepage's legacy redirect (portal/public/home.js).
// - The research app's startup, the legacy "?ask=" entry and the fragment
//   fold, then route() until the panel it shows (portal/public/app.js).
// - Community's sign-in token (portal/public/community.js).
// An HTTP redirect keeps the fragment when its location has none, as browsers
// do. Reads {addresses, app?, home?} as JSON on stdin (app and home replace
// those sources, for mutation tests); writes one outcome per address.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { pageEntry } from '../../portal/src/page-entry.ts';

const publicDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../portal/public',
);
const input = JSON.parse(readFileSync(0, 'utf8'));
const appSource =
  input.app ?? readFileSync(resolve(publicDir, 'app.js'), 'utf8');
const homeSource =
  input.home ?? readFileSync(resolve(publicDir, 'home.js'), 'utf8');
const communitySource = readFileSync(
  resolve(publicDir, 'community.js'),
  'utf8',
);
const origin = 'https://opax.com.au';

/** A top-level declaration or block, through its closing brace at column 0. */
function block(source, file, opening, closing = '\n}\n') {
  const start = source.indexOf(opening);
  const end = start < 0 ? -1 : source.indexOf(closing, start);
  if (start < 0 || end < 0) throw new Error(`${file}: "${opening}" is gone`);
  return source.slice(start, end + closing.length);
}

// The browser stops a script on these; anything else thrown is a fault in
// this harness and is reported as one.
const browserStops = new Set(['ERR_INVALID_URL', 'SECURITY_ERR']);
const stop = new Error('stop');

function appRunner(source) {
  const functions = [
    'rawFragment',
    'hereRoute',
    'pathFor',
    'replaceRoute',
    'goRoute',
    'parseHash',
    'route',
    'askHash',
  ].map((name) => block(source, 'app.js', `function ${name}(`));
  const script = new vm.Script(`${functions.join('\n')}
${block(source, 'app.js', 'const DIRECTORY_KINDS = {', '\n};\n')}
var firstRoute, settleOn, grantsResearchGeneration, grantsResearchHandle, currentSubjectKey;
globalThis.boot = () => {
  firstRoute = true; settleOn = {}; grantsResearchGeneration = 0; grantsResearchHandle = null; currentSubjectKey = null;
${block(source, 'app.js', '{\n  const legacyAsk')}
${block(source, 'app.js', '{\n  // A link from before real paths')}
  route();
};`);
  const state = { url: null, panel: null, redirect: null };
  const leave = (target) => {
    state.redirect = String(target);
    throw stop;
  };
  const navigate = (target) => {
    const next = new URL(target, state.url);
    if (next.origin !== state.url.origin)
      throw Object.assign(new Error('history entry on another origin'), {
        code: 'SECURITY_ERR',
      });
    state.url = next;
  };
  const context = vm.createContext({
    URL,
    URLSearchParams,
    location: {
      get href() {
        return state.url.href;
      },
      get origin() {
        return state.url.origin;
      },
      get pathname() {
        return state.url.pathname;
      },
      get search() {
        return state.url.search;
      },
      get hash() {
        return state.url.hash;
      },
      replace: leave,
      assign: leave,
    },
    history: {
      replaceState: (_s, _t, target) => navigate(target),
      pushState: (_s, _t, target) => navigate(target),
    },
    document: { documentElement: { classList: { add() {} } } },
    destroySupplierPage() {},
    destroyConnectionsPage() {},
    destroySubjectMap() {},
    showPanel(name) {
      state.panel = name;
      throw stop;
    },
  });
  script.runInContext(context);
  return (address) => {
    Object.assign(state, {
      url: new URL(address),
      panel: null,
      redirect: null,
    });
    try {
      context.boot();
      return { error: 'route() showed no panel' };
    } catch (error) {
      if (browserStops.has(error?.code))
        return { stopped: String(error), at: state.url.href };
      if (error !== stop) return { error: String(error?.stack ?? error) };
    }
    if (state.redirect !== null)
      return { redirect: state.redirect, at: state.url.href };
    // route()'s Ask branch runs the question when the view is "ask" with q.
    const { segs, params } = context.parseHash();
    return {
      panel: state.panel,
      question: segs[0] === 'ask' ? params.get('q') : null,
      at: state.url.href,
    };
  };
}

function homeRunner(source) {
  const script = new vm.Script(
    `globalThis.legacy = () => {\n${block(source, 'home.js', 'const legacyRoute')}};`,
  );
  const state = { url: null, redirect: null };
  const context = vm.createContext({
    URL,
    location: {
      get href() {
        return state.url.href;
      },
      get origin() {
        return state.url.origin;
      },
      replace(target) {
        state.redirect = String(target);
      },
    },
  });
  script.runInContext(context);
  return (address) => {
    Object.assign(state, { url: new URL(address), redirect: null });
    try {
      context.legacy();
    } catch (error) {
      if (browserStops.has(error?.code)) return { stopped: String(error) };
      return { error: String(error?.stack ?? error) };
    }
    return { redirect: state.redirect };
  };
}

function communityToken(address) {
  const line = communitySource
    .split('\n')
    .find((text) => text.startsWith('let signInToken='));
  if (!line) throw new Error('community.js: "let signInToken=" is gone');
  const context = vm.createContext({
    URLSearchParams,
    location: { hash: new URL(address).hash },
  });
  vm.runInContext(`${line}\nglobalThis.token = signInToken;`, context);
  return context.token;
}

async function worker(url) {
  const path = url.pathname;
  if (
    path === '/today' ||
    path === '/mcp' ||
    ['/.well-known/', '/api/', '/og/', '/ingest/'].some((p) =>
      path.startsWith(p),
    )
  )
    return { endpoint: path };
  const response = await pageEntry(new Request(url), {
    fetch: async () => new Response('home'),
  });
  if (response && response.status >= 300 && response.status < 400)
    return { redirect: response.headers.get('location') };
  if (response) return { page: 'home' };
  if (path === '/community' || path === '/community.html')
    return { page: 'community' };
  return { page: 'app' };
}

const runApp = appRunner(appSource);
const runHome = homeRunner(homeSource);

/** A navigation's target, or null where the browser refuses it ("//"). */
function target(location, base) {
  try {
    return new URL(location, base);
  } catch {
    return null;
  }
}

async function follow(address) {
  let url = new URL(address);
  const trail = [];
  for (let hop = 0; hop < 8; hop++) {
    if (url.origin !== origin) return { end: 'off-site', at: url.href, trail };
    const step = await worker(url);
    if (step.endpoint)
      return { end: 'endpoint', endpoint: step.endpoint, at: url.href, trail };
    if (step.redirect) {
      const next = target(step.redirect, url);
      if (!next)
        return {
          end: 'stopped',
          stopped: `redirect to ${step.redirect}`,
          at: url.href,
          trail,
        };
      if (!next.hash) next.hash = url.hash;
      trail.push(`Worker: ${next.href}`);
      url = next;
      continue;
    }
    if (step.page === 'community')
      return {
        end: 'community',
        token: communityToken(url.href),
        at: url.href,
        trail,
      };
    const result = step.page === 'home' ? runHome(url.href) : runApp(url.href);
    if (result.error)
      return { end: 'error', error: result.error, at: url.href, trail };
    if (result.stopped)
      return {
        end: 'stopped',
        stopped: result.stopped,
        at: result.at ?? url.href,
        trail,
      };
    if (result.redirect !== null && result.redirect !== undefined) {
      const next = target(result.redirect, result.at ?? url);
      if (!next)
        return {
          end: 'stopped',
          stopped: `location.replace(${result.redirect})`,
          at: url.href,
          trail,
        };
      url = next;
      trail.push(`${step.page === 'home' ? 'home.js' : 'app.js'}: ${url.href}`);
      continue;
    }
    if (step.page === 'home') return { end: 'home', at: url.href, trail };
    return {
      end: 'panel',
      panel: result.panel,
      question: result.question,
      at: result.at,
      trail,
    };
  }
  return { end: 'error', error: 'more than eight hops', at: url.href, trail };
}

const outcomes = [];
for (const address of input.addresses)
  outcomes.push({ address, ...(await follow(address)) });
process.stdout.write(JSON.stringify(outcomes));
