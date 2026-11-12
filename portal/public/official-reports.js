import { reportState, queryReports, reportResultsHTML, reportCount, reportFilterCount, reportFilterLabel } from './official-reports-model.js';
const root = document.querySelector('[data-official-reports]');
if (root) {
  const type = root.dataset.officialReports, form = root.querySelector('form');
  const results = root.querySelector('[data-or-results]'), count = root.querySelector('[data-or-count]');
  const more = root.querySelector('.or-more'), input = form.querySelector('[name="q"]');
  const mobile = matchMedia('(max-width:600px)');
  let index, loading, timer, revision = 0;
  root.classList.add('or-live');
  const disclosure = (state, reset = false) => {
    more.querySelector('summary').textContent = reportFilterLabel(state, type);
    if (reportFilterCount(state, type)) more.open = true;
    else if (reset && mobile.matches) more.open = false;
  };
  disclosure(reportState(new URL(location.href).searchParams, type), true);
  // Keep the server-rendered list untouched until a reader uses the finder.
  // A failed enhancement falls back to the same GET page as the native form.
  const loadIndex = () => {
    if (!loading) loading = fetch(root.dataset.orIndex).then(r => {
      if (!r.ok) throw Error('Index unavailable');
      return r.json();
    }).then(data => {
      if (data.schema !== 1 || data.type !== type) throw Error('Invalid index');
      index = data;
      return data;
    }).catch(error => { loading = null; throw error; });
    return loading;
  };
  const render = (url, mode = 'push') => {
    const state = reportState(url.searchParams, type), result = queryReports(index, state);
    if (mode !== 'none' && url.href !== location.href) history[mode === 'replace' ? 'replaceState' : 'pushState'](null, '', url);
    for (const control of form.elements) if (control.name && control.name in state) control.value = state[control.name] || (control.name === 'sort' ? 'newest' : '');
    results.innerHTML = reportResultsHTML(result, type, state);
    count.textContent = reportCount(result, type);
    root.querySelector('.or-results-head [data-or-clear]').hidden = !state.q?.trim() && !reportFilterCount(state, type);
    disclosure(state);
    let robots = document.querySelector('meta[name="robots"]');
    if (url.search && !robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.append(robots); }
    if (robots) { if (url.search) robots.content = 'noindex'; else robots.remove(); }
  };
  const apply = async (url, mode = 'push') => {
    const current = ++revision;
    try {
      await loadIndex();
      if (current !== revision) return false;
      render(url, mode);
      return true;
    } catch {
      if (current === revision) location.assign(url.href);
      return false;
    }
  };
  const update = (mode = 'push') => {
    const url = new URL(form.action);
    for (const [key, value] of new FormData(form)) if (value && !(key === 'sort' && value === 'newest')) url.searchParams.set(key, value);
    return apply(url, mode);
  };
  const warm = () => { void loadIndex().catch(() => {}); };
  form.addEventListener('focusin', warm);
  form.addEventListener('pointerdown', warm);
  if (location.search) warm();
  form.addEventListener('submit', e => { e.preventDefault(); clearTimeout(timer); void update(); });
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { void update('replace'); }, 150); });
  input.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    e.preventDefault(); e.stopPropagation(); clearTimeout(timer); input.value = ''; void update('replace');
  });
  form.addEventListener('change', () => { clearTimeout(timer); void update(); });
  root.addEventListener('click', async e => {
    const link = e.target.closest('[data-or-page], [data-or-clear]');
    if (!link || e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    e.preventDefault(); clearTimeout(timer);
    if (!await apply(new URL(link.href))) return;
    if (link.hasAttribute('data-or-clear')) disclosure(reportState(new URL(location.href).searchParams, type), true);
    if (link.hasAttribute('data-or-page')) { const heading = root.querySelector('#or-results-title'); heading.tabIndex = -1; heading.focus({ preventScroll: true }); heading.scrollIntoView({ block: 'start' }); }
  });
  addEventListener('popstate', () => { clearTimeout(timer); void apply(new URL(location.href), 'none'); });
}
