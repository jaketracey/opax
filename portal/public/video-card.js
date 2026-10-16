// The Senate's own videos, click to play: one card the Worker prints (sitting weeks,
// a person's server answer) and app.js prints (the person page). Until a reader
// presses play nothing is requested from YouTube: no thumbnail, no preconnect, no
// script. Pressing play swaps in the Senate's player from youtube-nocookie.com, the
// one frame source the CSP allows (public/_headers, CSP_PAGE in src/index.ts).
// Rows come from /video/senate.json (scripts/senate_video/).
import { shortDate } from './format.js';

export const EMBED_ORIGIN = 'https://www.youtube-nocookie.com';
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const embedUrl = (id) => `${EMBED_ORIGIN}/embed/${id}?autoplay=1`;
export const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;

/** Question Time on the week's days, one per day (the newest upload wins), in day order. */
export function sittingVideos(videos, start, end) {
  const byDay = new Map();
  for (const v of videos || []) {
    if (v?.kind !== 'question_time' || v.chamber !== 'senate' || !v.date || v.date < start || v.date > end || !VIDEO_ID.test(v.id)) continue;
    const held = byDay.get(v.date);
    if (!held || String(v.published || '') > String(held.published || '')) byDay.set(v.date, v);
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const words = (s) => String(s ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z']+/).filter(Boolean);
/**
 * A person's first speech, by what the fetcher matched on the roster: this page's slug, or
 * this page's pid when the title also prints this person's surname (the site lists some
 * people under two rows, a bare-surname row and a full-name row, with one pid). Never by a
 * printed name alone.
 */
export function personVideos(videos, slug, person = null) {
  const pid = person?.pid ? String(person.pid) : '';
  const surname = words(person?.full || person?.name).at(-1) || '';
  return (videos || []).filter((v) => v?.kind === 'first_speech' && VIDEO_ID.test(v.id) && (
    (!!slug && v.person_slug === slug) ||
    (!!pid && !!surname && v.person_pid != null && String(v.person_pid) === pid && words(v.title).includes(surname))));
}

/** One card: the navy poster button, and "Watch on YouTube" beside it. */
export function videoCardHTML(v) {
  if (!v || !VIDEO_ID.test(v.id)) return '';
  const day = v.date ? shortDate(v.date) : '';
  const meta = [day, 'Australian Senate · YouTube'].filter(Boolean).join(' · ');
  return `<figure class="video-card" data-video-card>`
    + `<div class="video-frame"><button type="button" class="video-facade" data-video-id="${esc(v.id)}" data-video-title="${esc(v.title)}">`
    + `<svg class="video-play" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><circle cx="24" cy="24" r="23"/><path d="M19 14.5v19L34 24z"/></svg>`
    + `<span class="video-text"><span class="visually-hidden">Play video: </span><span class="video-title">${esc(v.title)}</span>`
    + `<span class="video-meta">${esc(meta)}</span></span></button></div>`
    + `<figcaption class="video-caption"><a href="${esc(watchUrl(v.id))}" rel="noopener">Watch on YouTube</a></figcaption></figure>`;
}

/** A titled block of cards, or nothing at all: no empty heading when there is no video. */
export function videoSectionHTML(title, rows, { id = '', note = '', after = '' } = {}) {
  const cards = rows.map(videoCardHTML).filter(Boolean);
  if (!cards.length) return '';
  return `<section class="ui-section video-section"${id ? ` id="${esc(id)}"` : ''}><h2 class="ui-section-title">${esc(title)}</h2>`
    + `${note ? `<p class="video-note">${esc(note)}</p>` : ''}<div class="video-cards">${cards.join('')}</div>${after}</section>`;
}

/** Swap one poster for the player. Focus moves to the frame so a keyboard reader carries on there. */
export function playVideo(button) {
  const id = button?.dataset?.videoId;
  if (!id || !VIDEO_ID.test(id)) return null;
  const frame = button.closest('.video-frame');
  const iframe = button.ownerDocument.createElement('iframe');
  iframe.src = embedUrl(id);
  iframe.title = `${button.dataset.videoTitle || 'Senate video'} (YouTube video player)`;
  iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
  iframe.setAttribute('allowfullscreen', '');
  iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  frame.replaceChildren(iframe);
  frame.closest('[data-video-card]')?.setAttribute('data-playing', '');
  iframe.focus();
  return iframe;
}

const wired = new WeakSet();
/** One delegated listener per document, so cards added later (the app's person page) play too. */
export function wireVideoCards(doc = document) {
  ensureVideoStyles(doc);
  if (wired.has(doc)) return;
  wired.add(doc);
  doc.addEventListener('click', (event) => {
    const button = event.target?.closest?.('.video-facade[data-video-id]');
    if (button) playVideo(button);
  });
}

/** The card's stylesheet, linked once: the Worker links it on its own pages; the app's routes get it here. */
export function ensureVideoStyles(doc = document) {
  if (doc.querySelector('link[data-video-card-style]')) return;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/video-card.css';
  link.dataset.videoCardStyle = '';
  doc.head.append(link);
}

if (typeof document !== 'undefined' && document.querySelector?.('[data-video-card]')) wireVideoCards(document);
