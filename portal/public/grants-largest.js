// /money/grants?jur=federal&largest=YYYY-MM: the month's largest grant agreements, one per
// recipient, from /social/grants-largest.json (scripts/build_social_catalog.mjs). The daily
// edition's "largest" kind posts the top of this list and links here, so the page and the
// post read the same file. Styles: .grant-recipient-page and .grants-largest-* in style.css.

const MONEY = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const monthLabel = (month) => {
  const m = /^(\d{4})-(\d{2})$/.exec(month || '');
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
};
const dayLabel = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${Number(m[3])} ${DAY_MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
};
/** The recipient page with the award open above the overview. */
export const awardHref = (row) => row && /^abn:\d{11}$/.test(row.recipientId || '') && /^GA\d+(?:-A\d+)?$/.test(row.id || '') ? `/money/grants/federal/recipient/${encodeURIComponent(row.recipientId)}?award=${encodeURIComponent(row.id)}` : null;

/** The rows the page lists for a month: well-formed awards only, in the file's order. */
export function largestRows(data, month) {
  const rows = data && data.months && Array.isArray(data.months[month]) ? data.months[month] : [];
  return rows.filter((r) => r && /^GA\d+/.test(r.id) && /^abn:\d{11}$/.test(r.recipientId) && Number.isFinite(r.amount) && r.amount > 0);
}

const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text != null) element.textContent = String(text);
  if (className) element.className = className;
  return element;
};
const link = (href, text) => { if (!href) return node('span', text); const a = node('a', text); a.href = href; return a; };

export function mountLargestGrants(root, { month, onTitle } = {}) {
  let destroyed = false;
  const aborter = new AbortController();
  const page = node('div', null, 'grant-recipient-page');
  root.replaceChildren(page);
  const load = async () => {
    page.setAttribute('aria-busy', 'true');
    page.replaceChildren(node('p', 'Loading the month’s largest grants…', 'status'));
    let data = null, failed = false;
    try {
      const res = await fetch('/social/grants-largest.json', { signal: aborter.signal });
      if (!res.ok) throw new Error(String(res.status));
      data = await res.json();
    } catch { failed = true; }
    if (destroyed) return;
    page.removeAttribute('aria-busy');
    page.replaceChildren();
    // A list that could not load is not a month without a list.
    if (failed) {
      const status = node('p', 'The largest grants could not be loaded. ', 'status');
      status.setAttribute('role', 'alert');
      const retry = node('button', 'Try again', 'ui-button');
      retry.type = 'button'; retry.dataset.uiSize = 'compact';
      retry.addEventListener('click', () => { void load(); });
      status.append(retry);
      page.append(status);
      onTitle?.('Largest grants');
      return;
    }
    const rows = largestRows(data, month);
    const label = monthLabel(month);
    if (!rows.length || !label) {
      page.append(node('h1', 'No list for this month'));
      const p = node('p', 'OPAX lists a month once every award in it must have been published. ');
      p.append(link('/money/grants?jur=federal', 'Browse all grants'), document.createTextNode('.'));
      page.append(p);
      onTitle?.('Largest grants');
      return;
    }
    const h1 = node('h1', `Where did the money go in ${label}?`);
    h1.tabIndex = -1;
    page.append(h1, node('p', `The largest grant agreements that started in ${label}, one per recipient, as published on GrantConnect by ${dayLabel(data.asOf)}.`, 'grant-recipient-lede'));
    const list = node('ol', null, 'grants-largest-list');
    list.setAttribute('aria-label', `The ${rows.length} largest grants of ${label}`);
    rows.forEach((r) => {
      const li = node('li');
      li.append(node('p', MONEY.format(r.amount), 'grants-largest-amount'));
      const who = node('h2');
      who.append(link(awardHref(r), r.recipient));
      li.append(who);
      if (r.more) li.append(node('p', `And ${r.more} more award${r.more === 1 ? '' : 's'} to the same recipient that month.`, 'grants-largest-meta'));
      if (r.purpose) li.append(node('p', r.purpose));
      const facts = [r.program, r.agency, r.selection ? `Selection: ${r.selection.toLowerCase()}` : '', `Agreement from ${dayLabel(r.start)}`, r.id].filter(Boolean).join(' · ');
      const meta = node('p', `${facts} · `, 'grants-largest-meta');
      meta.append(link(r.sourceUrl, 'GrantConnect record'));
      li.append(meta);
      list.append(li);
    });
    page.append(list);
    const basis = node('ul', null, 'grant-recipient-notes');
    for (const line of data.basis || []) basis.append(node('li', line));
    page.append(basis);
    const others = Object.keys(data.months || {}).filter((m) => m !== month).sort().reverse();
    if (others.length) {
      const nav = node('p', 'Other months: ');
      others.forEach((m, i) => { if (i) nav.append(document.createTextNode(' · ')); nav.append(link(`/money/grants?jur=federal&largest=${m}`, monthLabel(m))); });
      page.append(nav);
    }
    onTitle?.(`The largest grants of ${label}`);
  };
  void load();
  return { destroy() { destroyed = true; aborter.abort(); root.replaceChildren(); } };
}
