/* not-found.js: the one block every empty address shows.

   The site's own 404 and the seven record routes that can be asked for a
   record the data does not hold (a parliamentarian, a donor, a bill, a
   division or other document, an electorate, a grant recipient) all draw
   this block, from the Worker (src/index.ts, where the page is served
   without the app) and from the app when an in-app link lands on nothing.

   The block: the house wombat standing still, a title in the reader's terms,
   one plain line, a search field holding the address turned back into words
   (never a raw identifier), and one pill to the matching directory. No source
   line, no profile shell and no alarm colour: nothing failed, the address is
   simply empty.

   notFoundHTML() is a pure string so the Worker can print it; mountNotFoundArt()
   draws the wombat in the browser. Loading this module in a page mounts the
   art for any block already on it (the server-rendered page). */

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

/** Per kind: the title, the directory pill, and whether the address holds words worth searching. */
export const NOT_FOUND_KINDS = {
  page: { title: 'Nothing at this address', pill: ['Go to the home page', '/'], words: true },
  person: { title: 'No parliamentarian at this address', pill: ['Browse parliamentarians', '/subject/person'], words: true },
  donor: { title: 'No donor by this name', pill: ['Browse receipt sources', '/subject/donor'], words: true },
  bill: { title: 'No bill at this address', pill: ['Browse bills', '/bills'], words: false },
  division: { title: 'No division at this address', pill: ['Browse bills', '/bills'], words: false },
  document: { title: 'No document at this address', pill: ['Search the speeches', '/ask?view=search&q=*&kind=speech'], words: false },
  electorate: { title: 'No electorate at this address', pill: ['Browse electorates', '/subject/electorate'], words: true },
  recipient: { title: 'No grant recipient at this address', pill: ['Browse government grants', '/money/grants'], words: false },
};

export const NOT_FOUND_LINE = 'The link may be old, or the record may not be published yet.';

/* An electorate slug starts with where it is ("federal-representatives-nsw-",
   "vic-vic-la-vic-"); the place is what follows. */
const PLACE_PREFIX = /^(?:(?:federal|act|nsw|nt|qld|sa|tas|vic|wa|representatives|senate|la|lc|ha)-)+/;

/** The address turned back into the words a reader would search for, or ''. */
export function notFoundWords(kind, slug) {
  const spec = NOT_FOUND_KINDS[kind] || NOT_FOUND_KINDS.page;
  if (!spec.words) return '';
  let text;
  try { text = decodeURIComponent(String(slug ?? '')); } catch { text = String(slug ?? ''); }
  // A whole address: its last segment names the page; a query or anchor is not part of the name.
  // A record's name is already one segment, and may hold a slash of its own ("A/B Pty Ltd").
  if (kind === 'page') text = text.split(/[?#]/)[0].split('/').filter(Boolean).pop() || '';
  if (kind === 'electorate') text = text.toLowerCase().replace(PLACE_PREFIX, '');
  // A donor keeps its own spelling ("Zzqx Nobody Pty Ltd"); a slug's hyphens become spaces.
  if (kind !== 'donor') text = text.replace(/[-_+.]+/g, ' ');
  const words = text.replace(/\s+/g, ' ').trim()
    .split(' ')
    // An identifier is not a word: drop tokens with digits in them (ids, ABNs, years in slugs).
    .filter((word) => word && !/\d/.test(word));
  return words.join(' ').slice(0, 120);
}

/**
 * The block's markup. `headingId` keeps the page's own focus target ("subject-title",
 * "bill-title") where the app's route moves focus to it.
 */
export function notFoundHTML({ kind = 'page', slug = '', headingId = 'not-found-title', query } = {}) {
  const spec = NOT_FOUND_KINDS[kind] || NOT_FOUND_KINDS.page;
  const words = query ?? notFoundWords(kind, slug);
  const field = `${headingId}-q`;
  const [pill, href] = spec.pill;
  return `<section class="not-found" data-not-found="${esc(kind)}" aria-labelledby="${esc(headingId)}">`
    + '<div class="not-found-art" aria-hidden="true"></div>'
    + `<h1 id="${esc(headingId)}" tabindex="-1">${esc(spec.title)}</h1>`
    + `<p class="not-found-line">${esc(NOT_FOUND_LINE)}</p>`
    + '<form class="not-found-search" action="/ask" method="get" role="search">'
    + '<input type="hidden" name="view" value="search">'
    + `<label class="visually-hidden" for="${field}">Search the record</label>`
    + `<input class="ui-input" id="${field}" name="q" type="search" value="${esc(words)}" placeholder="Search the record" autocomplete="off" enterkeyhint="search">`
    + '<button class="ui-button" data-variant="primary" type="submit">Search</button>'
    + '</form>'
    + `<p class="not-found-more"><a class="ui-button" href="${esc(href)}">${esc(pill)}</a></p>`
    + '</section>';
}

const STYLESHEET = '/not-found.css';
const WOMBAT = '/wombat.js?v=cb89a88dad';

function linkStyles() {
  if (typeof document === 'undefined' || document.querySelector('link[data-not-found-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = STYLESHEET; link.dataset.notFoundStyle = '';
  document.head.append(link);
}

/** Draw the wombat, standing still and unlabelled, in every block under `root` that has none yet. */
export function mountNotFoundArt(root = typeof document === 'undefined' ? null : document) {
  if (!root) return Promise.resolve();
  linkStyles();
  const slots = [...root.querySelectorAll('.not-found-art')].filter((slot) => !slot.childElementCount);
  if (!slots.length) return Promise.resolve();
  return import(WOMBAT).then((mod) => {
    for (const slot of slots) {
      if (!slot.isConnected || slot.childElementCount) continue;
      mod.mountWombat(slot, { label: '', animal: 'wombat' });
      slot.lastElementChild?.classList.add('wb-still');
    }
  }).catch(() => {});
}

/** Replace `container`'s content with the block, and draw its art. Returns the heading. */
export function renderNotFound(container, options = {}) {
  container.innerHTML = notFoundHTML(options);
  mountNotFoundArt(container);
  return container.querySelector('h1');
}

if (typeof document !== 'undefined' && document.querySelector('.not-found-art')) mountNotFoundArt();
