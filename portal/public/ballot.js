import { personUrl, partyUrl } from './canonical-urls.js';
/* A self-directed, historical House ballot. Preferences never leave this module. */
export const PRACTICE_DATE = '2025-05-03';
export const HOUSE_GUIDE = 'https://www.aec.gov.au/Voting/How_to_Vote/Voting_HOR.htm';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const assetPath = (p) => typeof p === 'string' && /^\/electorates\/[a-zA-Z0-9_./-]+\.json$/.test(p) && !p.includes('..');
const external = (url) => { try { const u = new URL(url); return u.protocol === 'https:' ? u.href : null; } catch { return null; } };
// The AEC's party names to the shared party dots (ui-controls.css .ui-party). The label prints the AEC's own
// name; a party the palette does not carry takes the "other" dot, and no party gets no dot.
const PARTY_DOTS = [[/^(australian )?labor\b/i, 'alp'], [/^(lnp|liberal national)\b/i, 'lnp'], [/^(the )?nationals?\b|^national party|^(nt )?clp$|^country liberal/i, 'nat'],
  [/^liberal( party)?$/i, 'lib'], [/^(the |australian )?greens\b/i, 'grn'], [/one nation/i, 'onp'], [/^independent$/i, 'ind']];
const partyHTML = (party) => {
  const name = String(party ?? '').trim();
  if (!name || /^(unknown|not recorded|none)$/i.test(name)) return `<span>${esc(name || 'No party recorded')}</span>`;
  return `<span class="ui-party party-${PARTY_DOTS.find(([re]) => re.test(name))?.[1] || 'oth'}"><i aria-hidden="true"></i>${esc(name)}</span>`;
};

export function practiceContest(detail) {
  if (detail?.jurisdiction !== 'federal' || detail.chamber !== 'representatives') throw new Error('This practice tool covers the federal House of Representatives.');
  const contests = (detail.elections || []).filter((c) => c.election?.poll_date === PRACTICE_DATE && c.election?.kind === 'general');
  if (contests.length !== 1) throw new Error('A verified 2025 practice ballot is not available for this electorate.');
  const contest = contests[0];
  const candidates = [...(contest.candidates || [])].sort((a, b) => a.ballot_position - b.ballot_position);
  if (!candidates.length || candidates.some((c, i) => !c.candidate_id || !c.name || c.ballot_position !== i + 1) || new Set(candidates.map((c) => c.candidate_id)).size !== candidates.length) {
    throw new Error('The candidate list could not be verified. Please check the AEC record.');
  }
  const source = (contest.sources || []).map((id) => detail.sources?.[id]).find((s) => s && /candidates/i.test(s.label) && external(s.url) && new URL(s.url).hostname === 'results.aec.gov.au');
  if (!source) throw new Error('The candidate source is not available for this practice ballot.');
  return { ...contest, candidates, source };
}

export function validPreferences(order, candidates, complete = false) {
  if (!Array.isArray(order) || !Array.isArray(candidates) || !candidates.length) return false;
  const allowed = new Set(candidates.map((c) => c.candidate_id));
  return allowed.size === candidates.length && new Set(order).size === order.length && order.every((id) => allowed.has(id)) && (!complete || order.length === candidates.length);
}

export function changePreference(order, candidates, action, id) {
  if (!validPreferences(order, candidates)) throw new Error('Invalid preference order');
  const next = [...order];
  if (action === 'reset') return [];
  if (!candidates.some((c) => c.candidate_id === id)) throw new Error('Unknown candidate');
  const at = next.indexOf(id);
  if (action === 'add') { if (at < 0) next.push(id); }
  else if (action === 'remove') { if (at >= 0) next.splice(at, 1); }
  else if (action === 'up' || action === 'down') {
    const target = at + (action === 'up' ? -1 : 1);
    if (at >= 0 && target >= 0 && target < next.length) [next[at], next[target]] = [next[target], next[at]];
  } else throw new Error('Unknown preference action');
  return next;
}

export function ballotPlan(detail, contest, order) {
  if (!validPreferences(order, contest.candidates, true)) throw new Error('Number every candidate before downloading your practice plan.');
  return ['OPAX — 2025 practice ballot', 'Historical election: 3 May 2025', 'Federal House of Representatives', `${detail.name}, ${String(detail.state_code).toUpperCase()}`, '',
    'For practice only. This is not a current ballot or an official voting document.',
    'Your preference numbers, beside candidates in the original AEC ballot order:', '',
    ...contest.candidates.map((c) => `${order.indexOf(c.candidate_id) + 1}. ${c.name}${c.party ? ` (${c.party})` : ''}`), '',
    `Candidate source: ${contest.source.url}`, `How House voting works: ${HOUSE_GUIDE}`, '',
    'You chose this order. Opax does not recommend candidates or preferences.'].join('\n');
}

let instance = 0;
export function mountBallot(root, opts = {}) {
  const doc = root.ownerDocument;
  if (!doc.querySelector('link[data-opax-ballot-style]')) {
    const css = doc.createElement('link'); css.rel = 'stylesheet'; css.href = '/ballot.css'; css.dataset.opaxBallotStyle = ''; doc.head.append(css);
  }
  const prefix = `ballot-${++instance}`;
  const controller = new AbortController();
  let destroyed = false, sequence = 0, seats = [], detail = null, contest = null, order = [], view = 'candidates', lastSeat = null;
  // A failed request reads as one plain sentence ("Failed to fetch" never reaches the page) and offers a retry.
  const fetchJSON = async (url) => {
    if (!assetPath(url)) throw new Error('The election reference could not be loaded.');
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(response.statusText);
      return await response.json();
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw Object.assign(new Error('The election reference could not be loaded. Check your connection and try again.'), { retry: true });
    }
  };
  root.innerHTML = `<div class="ballot-tool ph-no-capture" data-private>
    <div class="ballot-intro"><h2>Build your ballot</h2><p>Read the record. Put the candidates in your own order.</p><p class="ballot-dated">2025 practice ballot <span>Federal House of Representatives · 3 May 2025</span></p></div>
    <details class="ballot-choose" open><summary><span data-seat-label>Choose an electorate</span><span class="ballot-change">Change</span></summary>
      <div class="ballot-finder"><label for="${prefix}-search">Find an electorate</label><input type="search" class="ui-input" id="${prefix}-search" placeholder="Electorate name or state" autocomplete="off" spellcheck="false" aria-controls="${prefix}-seats"><p class="ballot-small">Use the electorate from the 2025 election. <a href="https://electorate.aec.gov.au/" target="_blank" rel="noopener">Check with the AEC</a>.</p><div id="${prefix}-seats" class="ballot-seats" aria-label="Electorates"><p>Loading electorates…</p></div><p class="ballot-small" data-seat-count></p></div>
    </details><p class="ballot-status" role="status" aria-live="polite" aria-atomic="true"></p><div data-workspace></div>
    <p class="ballot-footer">A way to practise with historical candidates. For an upcoming election, check the official candidate list. Your order stays in this tab unless you download it.</p>
  </div>`;
  const $ = (s) => root.querySelector(s);
  const status = (message, announceOnly = false) => { $('.ballot-status').textContent = message; $('.ballot-status').classList.toggle('is-announcement', announceOnly); };
  const renderSeats = () => {
    const query = $(`#${prefix}-search`).value.trim().toLowerCase();
    const states = { nsw: 'New South Wales', vic: 'Victoria', qld: 'Queensland', sa: 'South Australia', wa: 'Western Australia', tas: 'Tasmania', nt: 'Northern Territory', act: 'Australian Capital Territory' };
    const matches = seats.filter((e) => `${e.name} ${e.state_code} ${states[e.state_code] || ''}`.toLowerCase().includes(query));
    $(`#${prefix}-seats`).innerHTML = matches.length ? matches.map((e) => `<button type="button" data-seat="${esc(e.electorate_id)}"><span>${esc(e.name)}</span><small>${esc(String(e.state_code).toUpperCase())}</small></button>`).join('') : '<p>No electorates match. Try a name or state.</p>';
    $('[data-seat-count]').textContent = `${matches.length} electorates`;
  };
  const recordHTML = (c) => {
    const person = c.person_id && detail.people?.[c.person_id];
    const profile = person?.name ? personUrl(person.name) : null;
    const search = `/ask?view=search&q=${encodeURIComponent('"' + c.name + '"')}`;
    return `<details class="ballot-record"><summary>Read the record</summary><div>${profile ? `<a href="${esc(profile)}" data-ballot-route>Open parliamentary profile</a><p>May include records from before or after this election.</p>` : '<p>No linked parliamentary profile in Opax. Some candidates have never served in parliament.</p>'}<a href="${esc(search)}" data-ballot-route>Search records for ${esc(c.name)}</a><p>A name search may include other people. Check each source.</p></div></details>`;
  };
  function renderWorkspace(focus) {
    if (!contest) return;
    const complete = validPreferences(order, contest.candidates, true);
    const remaining = contest.candidates.length - order.length;
    const guidance = complete ? 'Every candidate has a number. Your practice plan is ready.' : order.length ? `${remaining} choice${remaining === 1 ? '' : 's'} left. You can change your order.` : 'Start with your first choice, then add the others.';
    const byID = new Map(contest.candidates.map((c) => [c.candidate_id, c]));
    const chosen = new Map(order.map((id, i) => [id, i + 1]));
    const openRecords = new Set([...root.querySelectorAll('[data-candidate] .ballot-record[open]')].map((el) => el.closest('[data-candidate]').dataset.candidate));
    $('[data-workspace]').innerHTML = `<div class="ballot-progress"><div><strong>${order.length} of ${contest.candidates.length} choices made</strong><span>${guidance}</span></div><progress max="${contest.candidates.length}" value="${order.length}" aria-label="Candidates given a preference"></progress></div>
      <div class="ballot-mobile-tabs ui-segmented" role="tablist" aria-label="Ballot view"><button type="button" class="ui-button" id="${prefix}-candidates-tab" role="tab" aria-selected="${view === 'candidates'}" aria-controls="${prefix}-candidates" tabindex="${view === 'candidates' ? 0 : -1}" data-view="candidates">Candidates</button><button type="button" class="ui-button" id="${prefix}-order-tab" role="tab" aria-selected="${view === 'order'}" aria-controls="${prefix}-order" tabindex="${view === 'order' ? 0 : -1}" data-view="order">Your order (${order.length})</button></div>
      <div class="ballot-columns" data-view="${view}"><section class="ballot-candidates" id="${prefix}-candidates" role="tabpanel" aria-labelledby="${prefix}-candidates-tab"><h3 id="${prefix}-candidate-heading">The candidates</h3><p class="ballot-small">In their original order on the 2025 ballot.</p><ol class="ballot-paper" data-ui-size="compact">${contest.candidates.map((c) => `<li data-candidate="${esc(c.candidate_id)}"><div class="ballot-candidate-top"><span class="ballot-number" aria-label="${chosen.has(c.candidate_id) ? `Your preference ${chosen.get(c.candidate_id)}` : 'No preference yet'}">${chosen.get(c.candidate_id) || ''}</span><div class="ballot-name"><strong>${esc(c.name)}</strong>${partyHTML(c.party)}</div><button type="button" class="ui-button ballot-add"${chosen.has(c.candidate_id) ? ' data-variant="quiet"' : ''} data-action="${chosen.has(c.candidate_id) ? 'remove' : 'add'}" data-candidate-id="${esc(c.candidate_id)}" aria-label="${chosen.has(c.candidate_id) ? 'Remove' : 'Add'} ${esc(c.name)} ${chosen.has(c.candidate_id) ? 'from' : 'to'} your order">${chosen.has(c.candidate_id) ? 'Added ✓' : 'Add'}</button></div>${recordHTML(c)}</li>`).join('')}</ol>${order.length ? `<button type="button" class="ui-button ballot-review" data-variant="primary" data-view="order">Review your order (${order.length})</button>` : ''}</section>
      <section class="ballot-order" id="${prefix}-order" role="tabpanel" aria-labelledby="${prefix}-order-tab"><h3 id="${prefix}-order-heading">Your order</h3><p class="ballot-small">Your first choice is at the top.</p><ol class="ballot-order-list">${order.length ? order.map((id, i) => { const c = byID.get(id); return `<li><span class="ballot-number">${i + 1}</span><div class="ballot-name"><strong>${esc(c.name)}</strong>${partyHTML(c.party)}</div><div class="ballot-move" data-ui-size="compact"><button type="button" class="ui-button ui-icon-button" data-action="up" data-candidate-id="${esc(id)}" aria-label="Move ${esc(c.name)} up" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" class="ui-button ui-icon-button" data-action="down" data-candidate-id="${esc(id)}" aria-label="Move ${esc(c.name)} down" ${i === order.length - 1 ? 'disabled' : ''}>↓</button><button type="button" class="ui-button ui-icon-button" data-action="remove" data-candidate-id="${esc(id)}" aria-label="Remove ${esc(c.name)} from your order">×</button></div></li>`; }).join('') : '<li class="ballot-empty">Add a candidate to begin. You decide the order.</li>'}</ol><div class="ballot-actions"><button type="button" class="ui-button ballot-download" data-variant="primary" data-action="download" ${complete ? '' : 'disabled'}>Download practice plan</button><button type="button" class="ui-button ballot-reset" data-action="reset" ${order.length ? '' : 'disabled'}>Start again</button></div><p class="ballot-small">Download adds your numbers beside candidates in the original ballot order.</p></section></div>
      <details class="ballot-sources"><summary>How it works &amp; sources</summary><div><p>For the federal House, number every box in your chosen order. <a href="${HOUSE_GUIDE}" target="_blank" rel="noopener">Read the AEC’s voting instructions</a>.</p><p>These candidates stood on 3 May 2025. The original candidate order came from the AEC’s ballot draw, and does not indicate a recommendation.</p><a href="${esc(contest.source.url)}" target="_blank" rel="noopener">AEC 2025 candidate list</a><p><a href="${esc(detail.url)}" data-ballot-route>${esc(detail.name)} election history and sources</a></p><p>Opax does not score or recommend candidates. Parliamentary records can be incomplete and do not establish a candidate’s current views.</p></div></details>`;
    for (const element of root.querySelectorAll('[data-candidate]')) if (openRecords.has(element.dataset.candidate)) element.querySelector('.ballot-record').open = true;
    if (focus) {
      const scope = focus.scope === 'order' ? $('.ballot-order') : $('.ballot-candidates');
      const buttons = [...scope.querySelectorAll('button')].filter((b) => !b.disabled && b.getClientRects().length);
      let target = buttons.find((b) => b.dataset.action === focus.action && b.dataset.candidateId === focus.id);
      if (!target && focus.id) target = buttons.find((b) => b.dataset.candidateId === focus.id);
      target ||= buttons[0] || $(`[data-view="${view}"][role="tab"]`) || $('.ballot-choose summary');
      if (!target?.getClientRects().length) target = $('.ballot-choose summary');
      focusControl(target);
    }
  }
  function focusControl(target) {
    target?.focus({ preventScroll: true });
    const dialog = root.closest('dialog'), head = dialog?.querySelector('.game-dialog-head');
    if (!target || !dialog || !head) return;
    const box = target.getBoundingClientRect();
    if (box.top < head.getBoundingClientRect().bottom + 26 || box.bottom > dialog.getBoundingClientRect().bottom - 8) target.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }
  function showView() {
    renderWorkspace();
    focusControl($(`[data-view="${view}"][role="tab"]`));
    if (doc.defaultView.matchMedia('(max-width: 700px)').matches) $('.ballot-progress').scrollIntoView({ block: 'start', behavior: 'auto' });
  }
  async function chooseSeat(seat) {
    if (detail?.electorate_id === seat.electorate_id) { $('.ballot-choose').open = false; return; }
    if (order.length && !doc.defaultView.confirm('Start a new practice ballot for this electorate? Your current order will be cleared.')) return;
    const request = ++sequence;
    lastSeat = seat;
    detail = null; contest = null; order = []; view = 'candidates';
    $('[data-seat-label]').textContent = `${seat.name}, ${String(seat.state_code).toUpperCase()}`;
    $('.ballot-choose').open = false;
    $('[data-workspace]').innerHTML = ''; status('Loading the 2025 candidates…');
    try {
      const data = await fetchJSON(seat.detail_url);
      if (destroyed || request !== sequence) return;
      const next = practiceContest(data);
      detail = data; contest = next; renderWorkspace(); status(`${seat.name} is ready. ${contest.candidates.length} candidates from the 2025 election.`, true);
      $('.ballot-choose summary').focus({ preventScroll: true });
    } catch (error) {
      if (destroyed || request !== sequence) return;
      status(error.message); $('.ballot-choose').open = true;
      if (!error.retry) return;
      $('[data-workspace]').innerHTML = '<button type="button" class="ui-button" data-action="retry-seat">Try again</button>';
      if (!root.contains(doc.activeElement)) $('[data-action="retry-seat"]').focus({ preventScroll: true }); // a retry that failed again
    }
  }
  const onClick = (event) => {
    const link = event.target.closest('a[data-ballot-route]');
    if (link && !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !link.target && link.origin === doc.defaultView.location.origin) {
      root.closest('dialog')?.close();
      return; // The shell router follows the link after the modal leaves the top layer.
    }
    const button = event.target.closest('button'); if (!button || !root.contains(button)) return;
    if (button.dataset.seat) { const seat = seats.find((s) => s.electorate_id === button.dataset.seat); if (seat) void chooseSeat(seat); return; }
    if (button.dataset.view) { view = button.dataset.view; showView(); return; }
    if (button.dataset.action === 'retry') { void load(true); return; }
    if (button.dataset.action === 'retry-seat') { if (lastSeat) void chooseSeat(lastSeat); return; }
    if (!contest || !button.dataset.action) return;
    const action = button.dataset.action, id = button.dataset.candidateId;
    if (action === 'download') {
      const blob = new Blob([ballotPlan(detail, contest, order)], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob), link = doc.createElement('a'); link.href = url;
      link.download = `opax-2025-practice-${detail.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.txt`; link.hidden = true; root.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); status('Your practice plan has been downloaded.'); return;
    }
    if (action === 'reset' && order.length && !doc.defaultView.confirm('Clear your order and start again?')) return;
    const name = contest.candidates.find((c) => c.candidate_id === id)?.name;
    order = changePreference(order, contest.candidates, action, id);
    renderWorkspace({ action: action === 'add' ? 'remove' : action === 'remove' ? 'add' : action, id, scope: button.closest('.ballot-order') ? 'order' : 'candidates' });
    status(action === 'reset' ? 'Your order has been cleared.' : action === 'remove' ? `${name} removed. ${order.length} choices made.` : `${name} is choice ${order.indexOf(id) + 1}. ${order.length} of ${contest.candidates.length} choices made.`, true);
  };
  const onKey = (event) => {
    if (!event.target.matches('[role="tab"]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); view = event.key === 'Home' ? 'candidates' : event.key === 'End' ? 'order' : view === 'candidates' ? 'order' : 'candidates'; showView();
  };
  async function load(retry = false) {
    status('');
    try {
      const manifest = await fetchJSON('/electorates/manifest.json');
      const index = await fetchJSON(manifest.index_url);
      if (destroyed) return;
      seats = index.electorates.filter((e) => e.jurisdiction === 'federal' && e.chamber === 'representatives' && e.latest_election >= PRACTICE_DATE && e.election_count > 0).sort((a, b) => a.name.localeCompare(b.name));
      if (!seats.length) throw new Error('The 2025 electorates could not be loaded.');
      renderSeats();
      if (retry && !root.contains(doc.activeElement)) $(`#${prefix}-search`).focus({ preventScroll: true }); // the Try again button is gone
    } catch (error) {
      if (destroyed) return;
      $(`#${prefix}-seats`).innerHTML = '<p>The electorates could not load. Check your connection and try again.</p><button type="button" class="ui-button" data-action="retry">Try again</button>';
      status('The electorates could not load.', true);
      if (retry && !root.contains(doc.activeElement)) $('[data-action="retry"]').focus({ preventScroll: true });
    }
  }
  root.addEventListener('click', onClick); root.addEventListener('keydown', onKey); $(`#${prefix}-search`).addEventListener('input', renderSeats);
  return { ready: load(), destroy() { destroyed = true; sequence++; controller.abort(); root.removeEventListener('click', onClick); root.removeEventListener('keydown', onKey); $(`#${prefix}-search`)?.removeEventListener('input', renderSeats); order = []; root.innerHTML = ''; } };
}
