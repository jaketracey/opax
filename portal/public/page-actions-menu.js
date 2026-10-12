/* ⋯: the page-actions menu (principle 5: one primary action, the rest under ⋯).
   One component for every ⋯ on the site: the page heads (bill, person,
   witness, party and donor entries, electorates), a division's actions, a
   report section's head and the search and money toolbars.

   A menu button and a list of links and buttons. The list always floats over
   the page, anchored to its button: opening it moves nothing in the document
   flow, at any width (the details sheet it replaces opened in place on a
   phone and pushed the page down). This module writes the markup
   (labels.js's moreMenuHTML is this) and, once per document, adds the
   behaviour:
   - the button carries aria-haspopup="menu" and aria-expanded; the list is
     role="menu" and its rows role="menuitem";
   - a click, Enter or Space on the button opens it and focuses the first
     item; ArrowDown and ArrowUp on the button open it at an end;
   - in the menu the arrows move between items and wrap, Home and End go to
     the ends; Tab closes it and moves on from the button;
   - Escape closes it and returns focus to the button; a click or tap
     outside closes it; so does focus leaving it;
   - one menu is open at a time, and opening one closes an open source sheet;
   - the list aligns to the button's end, shifts, or opens upward so it stays
     inside the viewport, down to 320px wide.
   page-actions.css draws it. A link closes the menu as it goes; a button item
   keeps it open, so its own feedback ("Copied") stays in view. */

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** A same-site path or an http(s) URL; anything else draws no row. */
function linkTarget(href) {
  if (typeof href !== 'string' || !href) return null;
  if (/^https?:\/\//i.test(href)) return { href, external: true };
  if (href.startsWith('/') && !href.startsWith('//')) return { href, external: false };
  return null;
}

export const MORE_GLYPH = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="4.5" cy="10" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="15.5" cy="10" r="1.5"/></svg>';

let seq = 0;

/** ⋯ and its menu. Items are links ({ href, label, detail }) or buttons
 *  ({ action, label, detail }) a page wires through `data-more-action`;
 *  `detail` is a short second line. `id` names the menu for a page that wires
 *  it. No safe item, no menu. */
export function pageMenuHTML(items, label = 'More actions', { id = '' } = {}) {
  const line = (it) => it.detail ? `<span>${esc(it.label)}</span><small>${esc(it.detail)}</small>` : esc(it.label);
  const rows = items.filter(Boolean).map((it) => {
    if (it.action) return `<li role="none"><button type="button" class="page-menu-item" role="menuitem" tabindex="-1" data-more-action="${esc(it.action)}">${line(it)}</button></li>`;
    const target = linkTarget(it.href);
    return target ? `<li role="none"><a class="page-menu-item" role="menuitem" tabindex="-1" href="${esc(target.href)}"${target.external ? ' rel="noopener" target="_blank"' : ''}>${
      line(it)}${target.external ? ' <span aria-hidden="true">↗︎</span><span class="visually-hidden">, opens a new tab</span>' : ''}</a></li>` : '';
  }).filter(Boolean);
  if (!rows.length) return '';
  const listId = id ? `${id}-menu` : `page-menu-${++seq}`;
  return `<div class="page-menu"${id ? ` id="${esc(id)}"` : ''}>` +
    `<button type="button" class="page-menu-button" aria-haspopup="menu" aria-expanded="false" aria-controls="${esc(listId)}" aria-label="${esc(label)}" title="${esc(label)}">${MORE_GLYPH}</button>` +
    `<ul class="page-menu-list" id="${esc(listId)}" role="menu" aria-label="${esc(label)}" hidden>${rows.join('')}</ul></div>`;
}

const MENU = '.page-menu';
const EDGE = 8; // px kept clear of the viewport's edges
const GAP = 6; // px between the button and the list

/** The behaviour, on the document: menus rendered later need no wiring.
 *  Returns the controls a page may call (open, close, closeAll). */
export function installPageMenus(doc, win) {
  if (doc.opaxPageMenus) return doc.opaxPageMenus;
  const buttonOf = (menu) => menu.querySelector(':scope > .page-menu-button');
  const listOf = (menu) => menu.querySelector(':scope > .page-menu-list');
  const itemsOf = (menu) => [...(listOf(menu)?.querySelectorAll('.page-menu-item') || [])]
    .filter((el) => !el.disabled);
  const isOpen = (menu) => !!menu && listOf(menu)?.hidden === false;
  const openMenus = () => [...doc.querySelectorAll(MENU)].filter(isOpen);

  function close(menu, { focus = false } = {}) {
    if (!menu) return;
    const button = buttonOf(menu);
    const list = listOf(menu);
    // Focus inside a list that is about to hide would fall to the body.
    const held = !!list && list.contains(doc.activeElement);
    if (list) list.hidden = true;
    button?.setAttribute('aria-expanded', 'false');
    menu.classList.remove('is-open');
    if (focus || held) button?.focus({ preventScroll: true });
  }

  function closeAll(except) {
    for (const menu of openMenus()) if (menu !== except && !menu.contains(except)) close(menu);
  }

  /** Inside the viewport: under the button and aligned to its start, or to
   *  its end, or shifted in; above it when there is no room below. */
  function place(menu) {
    const list = listOf(menu);
    if (!list) return;
    delete menu.dataset.align;
    delete menu.dataset.side;
    list.style.removeProperty('--page-menu-shift');
    const width = doc.documentElement?.clientWidth || win.innerWidth;
    let box = list.getBoundingClientRect();
    if (!box.width) return; // not laid out (a test document, a hidden panel)
    if (box.right > width - EDGE) {
      menu.dataset.align = 'end';
      box = list.getBoundingClientRect();
    }
    const shift = box.left < EDGE ? EDGE - box.left : box.right > width - EDGE ? width - EDGE - box.right : 0;
    if (shift) list.style.setProperty('--page-menu-shift', `${Math.round(shift)}px`);
    const button = buttonOf(menu).getBoundingClientRect();
    if (box.bottom > win.innerHeight - EDGE && button.top - GAP - box.height >= EDGE) menu.dataset.side = 'top';
  }

  function open(menu, { focus = 'first' } = {}) {
    if (!menu) return;
    closeAll(menu);
    for (const pop of doc.querySelectorAll('details.ui-pop[open]')) if (!pop.contains(menu)) pop.open = false;
    const list = listOf(menu);
    if (!list) return;
    list.hidden = false;
    buttonOf(menu)?.setAttribute('aria-expanded', 'true');
    menu.classList.add('is-open');
    place(menu);
    const items = itemsOf(menu);
    if (focus && items.length) (focus === 'last' ? items[items.length - 1] : items[0]).focus({ preventScroll: true });
  }

  function onClick(e) {
    const target = e.target;
    const button = target?.closest?.('.page-menu-button');
    const own = button?.closest(MENU);
    if (own && buttonOf(own) === button) {
      if (isOpen(own)) close(own, { focus: true });
      else open(own);
      return;
    }
    for (const menu of openMenus()) if (!menu.contains(target)) close(menu);
    const link = target?.closest?.('a.page-menu-item');
    if (link) close(link.closest(MENU));
  }

  function onKeydown(e) {
    const target = e.target;
    const menu = target?.closest?.(MENU);
    if (!menu) return;
    const onButton = target === buttonOf(menu);
    if (onButton && !isOpen(menu)) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      open(menu, { focus: e.key === 'ArrowUp' ? 'last' : 'first' });
      return;
    }
    if (!isOpen(menu)) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(menu, { focus: true });
      return;
    }
    if (e.key === 'Tab') {
      // Back on the button, the browser's Tab moves on from there.
      close(menu, { focus: true });
      return;
    }
    const items = itemsOf(menu);
    if (!items.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const at = items.indexOf(target);
    const last = items.length - 1;
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? last
      : at < 0 ? (e.key === 'ArrowUp' ? last : 0)
      : e.key === 'ArrowDown' ? (at === last ? 0 : at + 1) : (at === 0 ? last : at - 1);
    items[next].focus();
  }

  // Only a move to another element closes it: a click on the list's own
  // padding sends focus nowhere (relatedTarget null) and must not.
  function onFocusout(e) {
    const menu = e.target?.closest?.(MENU);
    const next = e.relatedTarget;
    if (!menu || !next || menu.contains(next) || !isOpen(menu)) return;
    close(menu);
  }

  function onResize() { for (const menu of openMenus()) place(menu); }

  doc.addEventListener('click', onClick, true);
  // On the window, capturing: ahead of every page's own keys (the header
  // search and the docked assistant also close on Escape), so the innermost
  // open thing closes first.
  win.addEventListener('keydown', onKeydown, true);
  doc.addEventListener('focusout', onFocusout);
  win.addEventListener('resize', onResize);
  const api = { open, close, closeAll, place, isOpen };
  doc.opaxPageMenus = api;
  win.opaxPageMenus = api;
  return api;
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') installPageMenus(document, window);
