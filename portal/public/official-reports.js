import { reportState, queryReports, reportResultsHTML, reportCount } from './official-reports-model.js';
const root = document.querySelector('[data-official-reports]');
if (root) {
  const type = root.dataset.officialReports, form = root.querySelector('form');
  const results = root.querySelector('[data-or-results]'), count = root.querySelector('[data-or-count]');
  // The GET form and page links remain usable if the enhancement cannot load.
  fetch(root.dataset.orIndex).then(r => { if (!r.ok) throw Error('Index unavailable'); return r.json(); }).then(index => {
    if (index.schema !== 1 || index.type !== type) return;
    let timer;
    const render = (url, push = true) => {
      const state = reportState(url.searchParams, type), result = queryReports(index, state);
      if (push && url.href !== location.href) history.pushState(null, '', url);
      for (const control of form.elements) if (control.name && control.name in state) control.value = state[control.name] || (control.name === 'sort' ? 'newest' : '');
      results.innerHTML = reportResultsHTML(result, type, state);
      count.textContent = reportCount(result, type);
      root.querySelector('.or-results-head [data-or-clear]').hidden = !Object.entries(state).some(([key, value]) => value && key !== 'page' && !(key === 'sort' && value === 'newest'));
      let robots = document.querySelector('meta[name="robots"]');
      if (url.search && !robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.append(robots); }
      if (robots) { if (url.search) robots.content = 'noindex'; else robots.remove(); }
    };
    const update = () => {
      const url = new URL(form.action);
      for (const [key, value] of new FormData(form)) if (value && !(key === 'sort' && value === 'newest')) url.searchParams.set(key, value);
      render(url);
    };
    form.addEventListener('submit', e => { e.preventDefault(); clearTimeout(timer); update(); });
    form.querySelector('[name="q"]').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(update, 150); });
    form.addEventListener('change', () => { clearTimeout(timer); update(); });
    root.addEventListener('click', e => {
      const link = e.target.closest('[data-or-page], [data-or-clear]');
      if (!link || e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      e.preventDefault(); clearTimeout(timer); render(new URL(link.href));
      if (link.hasAttribute('data-or-page')) { const heading = root.querySelector('#or-results-title'); heading.tabIndex = -1; heading.focus({ preventScroll: true }); heading.scrollIntoView({ block: 'start' }); }
    });
    addEventListener('popstate', () => { clearTimeout(timer); render(new URL(location.href), false); });
  }).catch(() => {});
}
