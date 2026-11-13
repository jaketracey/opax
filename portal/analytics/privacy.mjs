// Only fixed categories and counts cross the analytics boundary.
const fields = {
  opax_view: ['page_path', 'page_section'],
  opax_ask: ['question_length', 'from_section'],
  opax_search: ['query_length', 'search_kind', 'search_mode'],
  opax_chip: ['chip_kind'],
  opax_ask_followup_click: ['position', 'kind'],
  opax_game_open: ['game'],
  opax_download: ['format'],
  opax_outbound: ['host', 'partner', 'placement'],
  opax_community_open: ['placement'],
  opax_money_view: ['view'],
  opax_map_action: ['action', 'filter', 'format', 'row_count'],
  opax_journey: ['action', 'lens', 'step', 'step_count'],
  opax_source_open: ['from_section', 'placement'],
  opax_share: ['kind', 'record_type'],
  opax_press: ['action'],
  opax_ask_started: ['from_section', 'page_type'],
  opax_module_click: ['module', 'page_type', 'position'],
  opax_ask_completed: ['from_section', 'duration_ms', 'source_count', 'has_answer', 'is_overview_intent'],
  opax_ask_failed: ['from_section', 'duration_ms', 'cancelled'],
  opax_search_started: ['page', 'filter_count'],
  opax_search_completed: ['page', 'result_count', 'total_count', 'duration_ms', 'had_suggestion', 'suggestion_kind'],
  opax_search_failed: ['page', 'duration_ms'],
  opax_export: ['format', 'row_count'],
  table_sort: ['table_id', 'page_type'],
  table_filter: ['table_id', 'page_type'],
  table_export: ['table_id', 'page_type'],
};
// Properties that take one of a fixed set of words; anything else is dropped.
// A shared link says what sort of record it was (record_type), never which.
const CHOICES = {
  opax_source_open: { placement: ['inline', 'sources_pane', 'talk_sources', 'other'] },
  opax_share: { kind: ['record', 'question', 'answer', 'copy_link'], record_type: ['person', 'party', 'bill', 'electorate', 'doc', 'money', 'other'] },
  opax_press: { action: ['asset_download', 'boilerplate_copy'] },
};
// Pages with no record in their address, counted by name rather than as
// "/other". Their sub-pages (a sitting day, an audit report) stay "/other".
const STATIC_PAGES = 'press|today|sitting|budget|privacy|support|audit|estimates|instruments';
const KNOWN_PATH = new RegExp(String.raw`^\/(?:$|ask(?:\/|$)|chat(?:\/|$)|search(?:\/|$)|money(?:\/|$)|map(?:\/|$)|discover(?:\/|$)|connections\.html$|reports(?:\/|$)|explore(?:\/|$)|doc(?:\/|$)|subject(?:\/|$)|declared(?:\/|$)|about(?:\/|$)|methods(?:\/|$)|stats(?:\/|$)|expenses(?:\/|$)|bills?(?:\/|$)|(?:${STATIC_PAGES})\/?$)`);
export function safePath(value) {
  try {
    const url = new URL(value, 'https://opax.com.au');
    const path = url.hash.startsWith('#/') ? url.hash.slice(1).split('?')[0] : url.pathname;
    // Unknown paths can contain arbitrary reader input; never collect them.
    if (!KNOWN_PATH.test(path)) return '/other';
    return path;
  } catch { return '/other'; }
}
export function cleanEvent(event, props = {}) {
  if (!Object.hasOwn(fields, event)) return null;
  const clean = {};
  for (const key of fields[event]) {
    const value = props[key];
    if (key === 'had_suggestion') { if (typeof value === 'boolean') clean[key] = value; continue; }
    if (key === 'suggestion_kind') { if (['did_you_mean', 'scope', 'ask', 'none'].includes(value)) clean[key] = value; continue; }
    if (event === 'opax_ask_followup_click') {
      if (key === 'position' && Number.isInteger(value) && value >= 1 && value <= 4) clean[key] = value;
      if (key === 'kind' && ['speech', 'vote', 'recent', 'compare', 'detail'].includes(value)) clean[key] = value;
      continue;
    }
    const choices = CHOICES[event]?.[key];
    if (choices) { if (choices.includes(value)) clean[key] = value; continue; }
    if (key === 'is_overview_intent') { if (typeof value === 'boolean') clean[key] = value; continue; }
    if (key === 'page_path') clean[key] = safePath(value);
    else if (typeof value === 'number' && Number.isFinite(value)) clean[key] = value;
    else if (typeof value === 'boolean') clean[key] = value;
    else if (typeof value === 'string' && value.length <= 100 && /^[a-zA-Z0-9_.:-]+$/.test(value)) clean[key] = value;
  }
  return clean;
}
const CAMPAIGN_TAGS = new Set(['utm_source', 'utm_medium', 'utm_campaign']);
export function beforeSend(event) {
  if (!event) return null;
  const p = event.properties;
  delete p.$set;
  delete p.$set_once;
  // SDK enrichment includes referrers, initial URLs, titles and campaign/search
  // parameters even when the application captures no free text. The referring
  // domain alone (no path, no query) is kept so traffic sources are visible,
  // and so are the three campaign tags Opax puts on its own links (which
  // platform, social or referral, which campaign) when they are plain slugs:
  // Instagram and Facebook often send no referrer, so the tag is the only
  // way to see which channel a visit came from. Anything free-form is dropped.
  // PostHog also copies the landing page's tags into $session_entry_* and
  // collects a long list of ad click ids; the page title carries a reader's
  // search words ("Search: … · OPAX"), with or without a $.
  for (const key of Object.keys(p)) {
    if (key === '$current_url' || key === '$pathname' || key === '$referring_domain') continue;
    const tag = key.replace(/^\$session_entry_/, '');
    if (CAMPAIGN_TAGS.has(tag) && typeof p[key] === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(p[key])) continue;
    if (key === '$session_entry_host') continue;
    if (/pathname$/.test(key)) { if (key !== '$pathname') p[key] = safePath(p[key] || '/'); continue; }
    if (/^\$session_entry_|^\$.*(?:url|referr|initial|search|keyword)|title|^(?:utm_|gclid|gclsrc|gad_|gbraid|wbraid|dclid|fbclid|msclkid|twclid|li_fat_id|igshid|ttclid|rdt_cid|epik|qclid|sccid|irclid|_kx|mc_)/i.test(key)) delete p[key];
  }
  p.$pathname = safePath(p.$pathname || p.$current_url || '/');
  p.$current_url = `https://opax.com.au${p.$pathname}`;
  if (event.event === '$exception' && !cleanException(p)) return null;
  return event;
}

// Error reports ($exception). posthog-js builds them from uncaught errors and
// unhandled rejections in the page. Only what helps find a bug in OPAX's own
// code is kept: the error type, a cleaned message, stack frames (function,
// file on opax.com.au, line and column) and a fingerprint. An error message
// can quote whatever the code was handling, including a reader's search or
// question, so quoted text, query strings and fragments are removed from it.
const OWN_HOSTS = new Set(['opax.com.au', 'www.opax.com.au']);
const EXTENSION_FILE = /^(?:chrome-extension|moz-extension|ms-browser-extension|safari-extension|safari-web-extension):/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const MECHANISMS = new Set(['generic', 'onunhandledrejection', 'onuncaughtexception', 'onconsole', 'middleware']);
const LEVELS = new Set(['fatal', 'error', 'warning', 'log', 'info', 'debug']);
const PLATFORMS = new Set(['web:javascript', 'node:javascript', 'hermes']);
const MAX_MESSAGE = 200, MAX_EXCEPTIONS = 5, MAX_FRAMES = 50;
const PLAIN_VALUE = /^(?:undefined|null|true|false|NaN|-?\d+(?:\.\d+)?)$/;
export function cleanMessage(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    // posthog-js copies a rejected or thrown non-error value into the message.
    .replace(/(captured with value: |captured as exception: )(.*)$/, (_, lead, rest) => lead + (PLAIN_VALUE.test(rest.trim()) ? rest.trim() : '<redacted>'))
    .replace(/"[^"]*"|'[^']*'|`[^`]*`|“[^”]*”|‘[^’]*’/g, '<redacted>')
    .replace(/["`“].*$/, '<redacted>') // an unclosed quote runs to the end
    .replace(/[?#]\S+/g, '')
    .replace(/%(?:3F|23)\S*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MESSAGE);
}
// The page's own scripts keep their path. An inline script reports the page's
// address, which goes through the same path allowlist as page views.
function ownFile(filename) {
  try {
    const url = new URL(filename);
    if (!/^https?:$/.test(url.protocol) || !OWN_HOSTS.has(url.hostname)) return null;
    return url.origin + (/^\/[\w./-]*\.m?js$/.test(url.pathname) ? url.pathname : safePath(url.pathname));
  } catch { return null; }
}
function cleanFrame(frame) {
  if (!frame || typeof frame !== 'object') return null;
  const file = typeof frame.filename === 'string' ? ownFile(frame.filename) : null;
  const fn = typeof frame.function === 'string' && /^[\w$.<>[\]/ ()?:@#-]{1,120}$/.test(frame.function) ? frame.function : '?';
  const clean = { platform: PLATFORMS.has(frame.platform) ? frame.platform : 'web:javascript', function: fn, in_app: !!file && frame.in_app !== false };
  if (file) clean.filename = file;
  if (Number.isInteger(frame.lineno) && frame.lineno >= 0) clean.lineno = frame.lineno;
  if (Number.isInteger(frame.colno) && frame.colno >= 0) clean.colno = frame.colno;
  if (typeof frame.chunk_id === 'string' && /^[\w-]{1,64}$/.test(frame.chunk_id)) clean.chunk_id = frame.chunk_id;
  return clean;
}
// Rewrites an $exception event's properties in place; false means drop it.
export function cleanException(p) {
  const list = Array.isArray(p.$exception_list) ? p.$exception_list.slice(0, MAX_EXCEPTIONS) : [];
  if (!list.length) return false;
  const framesOf = (e) => (Array.isArray(e?.stacktrace?.frames) ? e.stacktrace.frames : []);
  const located = list.flatMap(framesOf).map((f) => f?.filename).filter((f) => typeof f === 'string' && HAS_SCHEME.test(f));
  // Thrown in a browser extension, or only in other sites' scripts: not OPAX's to fix.
  if (located.some((f) => EXTENSION_FILE.test(f))) return false;
  if (located.length && !located.some(ownFile)) return false;
  // A cross-origin script's error reaches the page as a bare "Script error.".
  if (!located.length && list.every((e) => /^Script error\.?$/i.test(String(e?.value ?? '').trim()))) return false;
  const level = LEVELS.has(p.$exception_level) ? p.$exception_level : 'error';
  const fingerprint = typeof p.$exception_fingerprint === 'string' && /^[\w.:-]{1,128}$/.test(p.$exception_fingerprint) ? p.$exception_fingerprint : null;
  const exceptions = list.map((e) => {
    const clean = { type: typeof e?.type === 'string' && /^[A-Za-z_$][\w$.]{0,79}$/.test(e.type) ? e.type : 'Error', value: cleanMessage(e?.value) };
    const m = e?.mechanism;
    if (m && typeof m === 'object') clean.mechanism = { type: MECHANISMS.has(m.type) ? m.type : 'generic', handled: m.handled !== false, synthetic: m.synthetic === true };
    const frames = framesOf(e).slice(-MAX_FRAMES).map(cleanFrame).filter(Boolean);
    if (frames.length) clean.stacktrace = { type: 'raw', frames };
    return clean;
  });
  // Exception steps, sources and any other SDK copy of the message go.
  for (const key of Object.keys(p)) if (key.startsWith('$exception')) delete p[key];
  p.$exception_list = exceptions;
  p.$exception_level = level;
  if (fingerprint) p.$exception_fingerprint = fingerprint;
  return true;
}

// Automated browsers (scripted Chrome, audits, crawlers that run JavaScript)
// inflated every web metric. These checks read only fixed properties of the
// browser itself, never anything a reader typed or any identifier, and the
// result is either a drop or a single boolean.
const AUTOMATION_UA = /HeadlessChrome|PhantomJS|SlimerJS|Lighthouse|Puppeteer|Playwright|Selenium|crawler|spider|\w*bot\//i;
const zeroViewport = (win) => win.innerWidth === 0 || win.innerHeight === 0;
// A hidden or prerendering page may not have laid out yet (Android WebViews,
// background tabs), so its size only counts once it is on screen.
const onScreen = (doc) => doc?.visibilityState === 'visible' && !doc.prerendering;
// Clear signals: the event is not sent at all.
export function automationReason(nav = {}, win = {}, doc) {
  if (nav.webdriver === true) return 'webdriver';
  if (AUTOMATION_UA.test(nav.userAgent || '')) return 'automation_ua';
  try { if (nav.userAgentData?.brands?.some((b) => AUTOMATION_UA.test(b?.brand || ''))) return 'automation_ua'; } catch { /* optional API */ }
  // A real tab on screen always has a viewport; undefined (not a browser) is not zero.
  if (zeroViewport(win) && onScreen(doc)) return 'zero_viewport';
  return null;
}
// Runs start() once if the visit can be measured: now, or for a zero viewport
// while hidden or prerendering, when the page first comes on screen and still
// shows no automation signal. webdriver and the user agent decide at once.
export function whenMeasurable(nav, win, doc, start) {
  if (automationReason(nav, win, doc)) return;
  if (!zeroViewport(win) || onScreen(doc) || !doc?.addEventListener) return start();
  let decided = false;
  const check = () => {
    if (decided || !onScreen(doc)) return;
    decided = true;
    if (!automationReason(nav, win, doc)) start();
  };
  doc.addEventListener('visibilitychange', check);
  doc.addEventListener('prerenderingchange', check);
}
// Weaker signals, sent to PostHog as likely_bot so they can be filtered rather
// than dropped: no languages (old headless), or a page left without a single
// scroll, key, touch or pointer press.
export function likelyBot(nav = {}, { leaving = false, interacted = true } = {}) {
  if (Array.isArray(nav.languages) && nav.languages.length === 0) return true;
  return leaving && !interacted;
}
