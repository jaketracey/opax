/* The five labels, the source line and ⋯ (docs/design/DESIGN-REVIEW-2026-10.md §5.2),
   in one place. app.js imports this at boot, before its first render; the
   homepage (home-data.js) and the electorate pages (electorates.js) import it
   as modules. The markup pairs with ui-controls.css (the labels) and
   ui-source.css (the source line, the machine-written pill and ⋯);
   ui-source.js gives the popovers Escape, light dismiss and arrow keys. */
import { shortDate } from './format.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** Only http(s) URLs from the corpus may render as links. */
const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);
/** A site path or an http(s) URL, and whether it leaves OPAX; anything else is null. */
function linkTarget(href) {
  const external = safeUrl(href);
  if (external) return { href: external, external: true };
  return /^\/(?!\/)/.test(href || '') ? { href, external: false } : null;
}
/** Missing entity IDs are text, never a URL segment (app.js entityHrefAttr). */
function entityHrefAttr(href) {
  if (typeof href !== 'string' || !href.trim() || /^(null|undefined)$/i.test(href.trim())) return '';
  try {
    const path = new URL(href, 'https://opax.com.au').pathname;
    if (/^\/(doc|bill)\/?$/.test(path)) return '';
    if (path.split('/').some((part) => /^(null|undefined)$/i.test(decodeURIComponent(part).trim()))) return '';
  } catch { return ''; }
  return `href="${esc(href)}"`;
}

// --- party ----------------------------------------------------------------------

/** A party's name, lowercased, to [its colour class, its code]. Party identity
 *  is a dot and a name, always together: never colour alone. */
export const PARTY_MAP = {
  'labor': ['alp', 'ALP'], 'liberal': ['lib', 'LIB'], 'nationals': ['nat', 'NAT'],
  'lnp': ['lnp', 'LNP'], 'country liberal party': ['nat', 'CLP'],
  'greens': ['grn', 'GRN'], 'one nation': ['onp', 'ONP'], 'independent': ['ind', 'IND'],
  'centre alliance': ['oth', 'CA'], "katter's australian party": ['oth', 'KAP'],
  'united australia party': ['oth', 'UAP'], 'australian democrats': ['oth', 'AD'],
  'family first': ['oth', 'FF'], 'dlp': ['oth', 'DLP'], 'jln': ['oth', 'JLN'],
};
/** A code to [the name a label shows, the name it says]. The short form is the
 *  name itself where that is short; where it is a code, the full name is what a
 *  screen reader hears. */
export const PARTY_NAMES = {
  ALP: ['Labor', 'Australian Labor Party'], LIB: ['Liberal', 'Liberal Party'],
  NAT: ['Nationals', 'The Nationals'], LNP: ['LNP', 'Liberal National Party'],
  CLP: ['CLP', 'Country Liberal Party'], GRN: ['Greens', 'Australian Greens'],
  ONP: ['One Nation', "Pauline Hanson's One Nation"], IND: ['Independent', 'Independent'],
  CA: ['Centre Alliance', 'Centre Alliance'], KAP: ['KAP', "Katter's Australian Party"],
  UAP: ['UAP', 'United Australia Party'], AD: ['Democrats', 'Australian Democrats'],
  FF: ['Family First', 'Family First'], DLP: ['DLP', 'Democratic Labour Party'],
  JLN: ['JLN', 'Jacqui Lambie Network'],
};
/* A party field that says there is no party is not a party: no dot, no label. */
const PARTY_PLACEHOLDER = /^(?:not recorded|unknown|none|n\/?a|-|—)$/i;

/** PartyLabel: a dot beside the party's name, no fill. `full` for a profile's
 *  own header; the short name elsewhere, with the full name spoken. */
export function partyLabelHTML(party, { full = false } = {}) {
  const name = String(party ?? '').trim();
  if (!name || PARTY_PLACEHOLDER.test(name)) return '';
  const hit = PARTY_MAP[name.toLowerCase()];
  const [short, long] = (hit && PARTY_NAMES[hit[1]]) || [name, name];
  const shown = full ? long : short;
  const text = shown === long ? esc(shown)
    : `<span aria-hidden="true">${esc(shown)}</span><span class="visually-hidden">${esc(long)}</span>`;
  return `<span class="ui-party party party-${hit ? hit[0] : 'oth'}"${shown === long ? '' : ` title="${esc(long)}"`}><i aria-hidden="true"></i>${text}</span>`;
}

// --- status, tag, machine ---------------------------------------------------------

/** StatusLabel: one word with a tone: done, active, ended or draft. */
export function statusLabelHTML(word, tone = 'ended') {
  return word ? `<span class="ui-status" data-tone="${esc(tone)}">${esc(word)}</span>` : '';
}

/** Tag: a topic, in bronze; a link when it has somewhere to go. */
export function tagHTML(label, href) {
  const attr = href ? entityHrefAttr(href) : '';
  return attr ? `<a class="ui-tag" ${attr}>${esc(label)}</a>` : `<span class="ui-tag">${esc(label)}</span>`;
}

export const MACHINE_NOTE = 'Written by a language model from the records it draws on. It is not part of the record: check it against the original.';
const MACHINE_NOT_RECORD = 'Written by a model, not by a person. Not part of the record.';
const MACHINE_GLYPH = '<span class="ui-machine-glyph" aria-hidden="true">✦</span>';

/** MachineLabel: one phrase, once at the top of a machine-written block; it
 *  opens what wrote the text, from what. Two forms have no sheet, because a
 *  details cannot sit inside a summary, a paragraph or a link:
 *  - `pill`: the same pill, drawn still, for a row whose own summary opens the
 *    machine-written text (its sheet is the text itself);
 *  - `inline`: the quiet form for a row in a list of briefs.
 *  `className` keeps a block's layout hook. `notRecord` stands in for the
 *  sentence a block used to print ("written by a model, not part of the
 *  record"): the label's title says it, and so does its name for a screen
 *  reader, with nothing more on the page. */
export function machineLabelHTML({ note = MACHINE_NOTE, inline = false, pill = false, className = '', notRecord = false } = {}) {
  const cls = className ? ` ${esc(className)}` : '';
  const title = notRecord ? ` title="${MACHINE_NOT_RECORD}"` : '';
  const text = `${MACHINE_GLYPH}Machine-written${notRecord ? '<span class="visually-hidden">, not part of the record</span>' : ''}`;
  if (inline) return `<span class="ui-machine-inline${cls}"${title}>${text}</span>`;
  if (pill) return `<span class="ui-machine-pill${cls}"${title}>${text}</span>`;
  return `<details class="ui-pop ui-machine${cls}"><summary${title}>${text}</summary>` +
    `<div class="ui-sheet"><p>${esc(note)}</p></div></details>`;
}

// --- source line ---------------------------------------------------------------------

const SOURCE_GLYPH = '<svg class="ui-source-glyph" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.75h5.25L12.5 5v9.25h-8.5z"/><path d="M9 1.75V5.25h3.5M6.25 8.5h4M6.25 11h4"/></svg>';

/** SourceLine, one per block: "Updated 4 Oct 2026 · AEC annual returns" and a
 *  state where there is one ("partial", "saved copy"). It opens a sheet with
 *  the originals, as-at and coverage, facts, notes and caveats, and the licence.
 *  - `dateLabel` names the date: "Updated" (the default), "Written", "As at".
 *  - `facts` are [label, value] pairs, drawn as one key/value list; `notes` are
 *    paragraphs. Fact values, `notes` and `licence` are HTML the caller has
 *    escaped; the rest is text.
 *  - Originals are http(s) or site paths; anything else is dropped. */
export function sourceLineHTML({ updated = '', dateLabel = 'Updated', source = '', state = '', originals = [], asAt = '', facts = [], notes = [], licence = '' } = {}) {
  const when = updated ? esc(`${dateLabel} ${shortDate(updated)}`) : '';
  const what = source ? `<span class="ui-source-name">${esc(source)}</span>` : '';
  const line = [when, what].filter(Boolean).join(' · ') || '<span class="ui-source-name">Sources and notes</span>';
  const links = originals.map((o) => {
    const target = linkTarget(o?.href);
    return target && `<li><a href="${esc(target.href)}"${target.external ? ' rel="noopener" target="_blank"' : ''}>${
      esc(o.label || 'View original')}${target.external ? ' ↗︎' : ''}</a></li>`;
  }).filter(Boolean);
  const pairs = facts.filter((f) => f && f[1] != null && f[1] !== '');
  const kept = notes.filter(Boolean);
  const sheet = [
    links.length ? `<ul class="ui-sheet-originals">${links.join('')}</ul>` : '',
    asAt ? `<p class="ui-sheet-asat">${esc(asAt)}</p>` : '',
    pairs.length ? `<dl class="ui-sheet-facts">${pairs.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>` : '',
    kept.length ? `<div class="ui-sheet-notes">${kept.map((n) => `<p>${n}</p>`).join('')}</div>` : '',
    licence ? `<p class="ui-sheet-licence">${licence}</p>` : '',
  ].join('');
  // The state runs on in the line's own text, so a narrow line wraps as one
  // sentence instead of standing the state beside it as a second column.
  return `<details class="ui-pop ui-source"${state ? ` data-state="${esc(state)}"` : ''}><summary>${SOURCE_GLYPH}` +
    `<span class="ui-source-text">${line}${state ? ` <span class="ui-source-state">· ${esc(state)}</span>` : ''}</span></summary>` +
    `<div class="ui-sheet">${sheet || '<p>No further notes for this source.</p>'}</div></details>`;
}

/** The adapter for fine print a block already writes: its paragraph becomes the
 *  notes of the block's source line, so a page moves over by wrapping what it
 *  has. `<p class="fineprint">${html}</p>` becomes
 *  `${fineprintSourceHTML(html, { source, updated, originals })}`. */
export function fineprintSourceHTML(html, opts = {}) {
  return sourceLineHTML({ ...opts, notes: [html, ...(opts.notes || [])] });
}

// --- ⋯ ------------------------------------------------------------------------------

const MORE_GLYPH = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="4.5" cy="10" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="15.5" cy="10" r="1.5"/></svg>';

/** ⋯: what a view keeps but does not draw (principle 5: one primary action, the
 *  rest under ⋯). A details popover like the source sheets, so ui-source.js
 *  gives it Escape, light dismiss, one open at a time and arrow keys between
 *  its items. Items are links ({ href, label, detail }) or buttons
 *  ({ action, label, detail }) a page wires through `data-more-action`;
 *  `detail` is a short second line. `id` names the menu for a page that
 *  wires it. */
export function moreMenuHTML(items, label = 'More actions', { id = '' } = {}) {
  const line = (it) => it.detail ? `<span>${esc(it.label)}</span><small>${esc(it.detail)}</small>` : esc(it.label);
  const rows = items.filter(Boolean).map((it) => {
    if (it.action) return `<li><button type="button" class="ui-more-item" data-more-action="${esc(it.action)}">${line(it)}</button></li>`;
    const target = linkTarget(it.href);
    return target ? `<li><a class="ui-more-item" href="${esc(target.href)}"${target.external ? ' rel="noopener" target="_blank"' : ''}>${
      line(it)}${target.external ? ' <span aria-hidden="true">↗︎</span><span class="visually-hidden">, opens a new tab</span>' : ''}</a></li>` : '';
  }).filter(Boolean);
  if (!rows.length) return '';
  return `<details class="ui-pop ui-more"${id ? ` id="${esc(id)}"` : ''}><summary aria-label="${esc(label)}" title="${esc(label)}">${MORE_GLYPH}</summary>` +
    `<div class="ui-sheet"><ul class="ui-more-list" role="list">${rows.join('')}</ul></div></details>`;
}
