import { buildMoneyJourneys } from './money-journeys-data.js?v=story-1';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (value) => Number(value).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', notation: 'compact', maximumFractionDigits: 1 });
const safeLink = (url) => typeof url === 'string' && /^\/(?!\/)[^\s\\]*$/.test(url);
const STEP_MS = 7000;

/** A guide owns the camera only while a reader asks it to. The map remains interactive. */
export function mountMoneyJourneys(controls, story, stage, data, map, options = {}) {
  const selections = {};
  if (options.initialJourney && options.initialFocus) selections[options.initialJourney] = options.initialFocus;
  let journeys = buildMoneyJourneys(data, selections);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let active = null, step = 0, playing = false, timer = null, destroyed = false, reason = '';
  const stopTimer = () => { if (timer !== null) clearTimeout(timer); timer = null; };
  controls.innerHTML = journeys.length ? `<div class="journey-lenses" role="group" aria-label="Guided money map journeys">${journeys.map((journey) => `<button type="button" data-journey="${esc(journey.id)}" aria-pressed="false"><span>${esc(journey.title)}</span><small>${esc(journey.description)}</small></button>`).join('')}</div>` : '';

  const stories = new Map();
  let pendingStory = null;
  const storyKey = () => active?.selection ? `${active.id}:${active.selection}` : '';
  const narration = () => stories.get(storyKey())?.steps?.[step];
  const storyStatus = () => !active?.steps.length || !options.loadStory ? '' : stories.get(storyKey())?.steps ? 'AI-written guide · Based on these map records' : stories.get(storyKey())?.error ? 'Showing the map guide. The written story is unavailable.' : 'Finding the story in these records…';
  function loadStory() {
    if (!options.loadStory || !active?.steps.length) return;
    const key = storyKey();
    if (stories.has(key) || pendingStory?.key === key) return;
    pendingStory?.controller.abort();
    const expectedSteps = active.steps.length;
    const controller = new AbortController();
    pendingStory = {key,controller};
    Promise.resolve(options.loadStory(active.id,active.selection,controller.signal)).then(result => {
      if (destroyed || controller.signal.aborted) return;
      if (!Array.isArray(result?.steps) || result.steps.length !== expectedSteps || result.steps.some(s=>typeof s.title!=='string' || typeof s.body!=='string')) throw new Error('Invalid story');
      stories.set(key,result);
      if (storyKey() === key) {
        const current = narration();
        const heading = story.querySelector('.journey-narrative h3');
        const body = story.querySelector('.journey-narrative > p');
        if (heading && current) heading.textContent = current.title;
        if (body && current) body.textContent = current.body;
        const status = story.querySelector('.journey-story-status');
        if (status) status.textContent = storyStatus();
      }
    }).catch(() => {
      if (destroyed || controller.signal.aborted) return;
      stories.set(key,{error:true});
      if (storyKey() === key) { const status=story.querySelector('.journey-story-status'); if(status) status.textContent=storyStatus(); }
    }).finally(() => { if(pendingStory?.controller===controller) pendingStory=null; });
  }
  let disposePicker = () => {};
  function render() {
    disposePicker();
    if (destroyed) return;
    for (const button of controls.querySelectorAll('[data-journey]')) button.setAttribute('aria-pressed', String(button.dataset.journey === active?.id));
    story.hidden = !active;
    stage.classList.toggle('has-journey', Boolean(active));
    if (!active) { story.innerHTML = ''; return; }
    const header = `<div class="journey-story-top"><h2 class="journey-title">${esc(active.title)}</h2><button type="button" data-action="exit" aria-label="End guided journey">×</button></div>`;
    const chooser = active.choices ? `<div class="journey-selector"><label for="journey-focus">${esc(active.selectorLabel || 'Focus')}</label><select id="journey-focus" data-focus="true" aria-label="${esc(active.selectorLabel || 'Focus')}"><option value="">Choose ${active.selectorLabel === 'Industry' ? 'an industry' : active.selectorLabel === 'Recipient' ? 'a recipient' : 'an organisation'}…</option>${active.choices.map(choice => `<option value="${esc(choice.value)}"${choice.value === active.selection ? ' selected' : ''}>${esc(choice.label)}</option>`).join('')}</select></div>` : '';
    if (!active.steps.length) {
      story.innerHTML = `${header}<div class="journey-choice-empty">${chooser}<p class="journey-help">${esc(active.id === 'public-money' ? 'Recipients with both public-money and party-funding connections in this map.' : active.id === 'over-time' ? 'Organisations with dated receipts in both comparison windows.' : 'Choices reflect the connections available in this map.')}</p></div>`;
      enhancePicker();
      return;
    }
    const generated = narration();
    const current = { ...active.steps[step], ...(generated ? {title:generated.title,body:generated.body} : {}) };
    const metric = current.metric;
    const breakdown = (current.breakdown || []).filter(row => Number.isFinite(row.value) && row.value > 0);
    const maximum = Math.max(1, ...breakdown.map(row => row.value));
    const chart = breakdown.length ? `<figure class="journey-connections"><figcaption>Recorded receipts by party</figcaption><ul>${breakdown.map(row => `<li><div class="journey-connection-label"><a class="journey-party-link" href="/subject/party/${esc(encodeURIComponent(row.label))}"><i aria-hidden="true" style="background:${/^#[0-9a-f]{6}$/i.test(row.colour) ? row.colour : '#778b9b'}"></i><span>${esc(row.label)}</span></a><strong>${esc(money(row.value))}</strong></div><div class="journey-connection-track" aria-hidden="true"><span style="width:${row.value / maximum * 100}%"></span></div></li>`).join('')}</ul></figure>` : '';
    story.innerHTML = `${header}${chooser}
      <div class="journey-steps" role="group" aria-label="Journey steps">${active.steps.map((item, i) => `<button type="button" data-step="${i}" aria-label="Step ${i + 1}: ${esc(item.title)}"${i === step ? ' aria-current="step"' : ''}>${i + 1}</button>`).join('')}</div>
      <div class="journey-narrative" aria-live="polite" aria-atomic="true"><h3>${esc(current.title)}</h3><p>${esc(current.body)}</p>${chart}${!chart && metric && Number.isFinite(Number(metric.value)) ? `<div class="journey-metric"><strong>${esc(metric.format === 'currency' ? money(metric.value) : Number(metric.value).toLocaleString('en-AU'))}</strong><span>${esc(metric.label)}</span></div>` : ''}</div>
      <p class="journey-story-status" role="status">${esc(storyStatus())}</p><div class="journey-source-links">${(current.links || []).filter((link) => safeLink(link.href)).map((link) => `<a href="${esc(link.href)}">${esc(link.label)} <span aria-hidden="true">↗</span></a>`).join('')}</div>
      <div class="journey-playback"><button type="button" data-action="previous" aria-label="Previous step"${step === 0 ? ' disabled' : ''}>←</button><button type="button" data-action="play"${reduced.matches ? ' disabled' : ''}>${playing ? 'Pause' : step === active.steps.length - 1 ? 'Replay journey' : reason ? 'Continue journey' : 'Play journey'}</button><button type="button" data-action="next" aria-label="Next step"${step === active.steps.length - 1 ? ' disabled' : ''}>→</button></div>
      <div class="journey-progress" aria-hidden="true">${playing ? '<span></span>' : ''}</div><p class="journey-help">${esc(reason || (reduced.matches ? 'Animation is off. Use the arrows to explore each step.' : playing ? 'The next view opens in 7 seconds. Touch the map to pause.' : 'Step through, or play the journey. Drag the map to explore.'))}</p>`;
    enhancePicker();
  }

  function enhancePicker() {
    const select = story.querySelector('[data-focus]');
    if (!select?.options) return;
    const choices = active.choices;
    const names = choices.map(c => {
      const name = c.label.replace(/ — Commonwealth (contracts|grants)$/, '');
      return active.id === 'industry' ? name.replace(/\b\w/g, letter => letter.toUpperCase()) : name;
    });
    const detail = c => {
      const i = choices.indexOf(c);
      return names.filter(n => n === names[i]).length > 1 ? (/contracts$/.test(c.label) ? 'Contracts' : /grants$/.test(c.label) ? 'Grants' : '') : '';
    };
    const selected = choices.find(c => c.value === active.selection);
    const label = selected ? names[choices.indexOf(selected)] : select.options[0].textContent;
    select.hidden = true;
    select.insertAdjacentHTML('afterend', `<div class="journey-picker"><button type="button" class="journey-picker-trigger" aria-haspopup="dialog" aria-expanded="false" aria-label="${esc(active.selectorLabel)}: ${esc(label)}"><span>${esc(label)}</span><span aria-hidden="true">⌄</span></button><div class="journey-picker-panel" role="dialog" aria-label="Choose ${esc(active.selectorLabel.toLowerCase())}" hidden><input type="search" class="journey-picker-search" aria-label="Search ${esc(active.selectorLabel.toLowerCase())}" placeholder="Search…" autocomplete="off"><div class="journey-picker-results"></div><p class="journey-picker-count" role="status"></p></div></div>`);
    const root = story.querySelector('.journey-picker');
    const trigger = root.querySelector('button');
    const panel = root.querySelector('.journey-picker-panel');
    const input = root.querySelector('input');
    const results = root.querySelector('.journey-picker-results');
    const count = root.querySelector('.journey-picker-count');
    story.querySelector('label[for="journey-focus"]')?.setAttribute('for', 'journey-picker-trigger');
    trigger.id = 'journey-picker-trigger';
    const close = (focus = false) => { panel.hidden = true; trigger.setAttribute('aria-expanded', 'false'); if (focus) trigger.focus(); };
    const filter = () => {
      const query = input.value.trim().toLocaleLowerCase();
      const matches = choices.filter((c, i) => `${names[i]} ${detail(c)}`.toLocaleLowerCase().includes(query));
      results.innerHTML = matches.map(c => `<button type="button" data-choice="${esc(c.value)}" class="journey-picker-option"${c.value === active.selection ? ' aria-current="true"' : ''}><span>${esc(names[choices.indexOf(c)])}</span>${detail(c) ? `<small>${detail(c)}</small>` : ''}</button>`).join('');
      count.textContent = matches.length ? `${matches.length} ${matches.length === 1 ? 'result' : 'results'}` : 'No matches. Try another name.';
    };
    // Commit touch choices before Safari moves focus and dismisses the panel.
    // A scrolling gesture must never select the option under the finger.
    const commitChoice = option => {
      select.value = option.dataset.choice;
      onFocus({ target: select });
      story.querySelector('.journey-picker-trigger')?.focus({ preventScroll: true });
    };
    let touchChoice = null;
    root.addEventListener('touchstart', event => {
      const option = event.target.closest('[data-choice]');
      const touch = event.touches[0];
      touchChoice = option && event.touches.length === 1 ? {option,x:touch.clientX,y:touch.clientY} : null;
    }, {passive:true});
    root.addEventListener('touchmove', event => {
      const touch = event.touches[0];
      if (touchChoice && (!touch || Math.hypot(touch.clientX-touchChoice.x,touch.clientY-touchChoice.y)>10)) touchChoice=null;
    }, {passive:true});
    root.addEventListener('touchcancel', () => { touchChoice=null; });
    root.addEventListener('touchend', event => {
      const choice=touchChoice; touchChoice=null;
      if (!choice || !event.cancelable) return;
      event.preventDefault();
      commitChoice(choice.option);
    }, {passive:false});
    root.addEventListener('mousedown', event => {
      if (event.target.closest('[data-choice]')) event.preventDefault();
    });
    root.addEventListener('click', event => {
      event.stopPropagation();
      const option = event.target.closest('[data-choice]');
      if (option) {
        commitChoice(option);
      } else if (event.target.closest('.journey-picker-trigger')) {
        if (!panel.hidden) { close(); return; }
        onPickerOpen({ target: select });
        input.value = ''; filter(); panel.hidden = false; trigger.setAttribute('aria-expanded', 'true'); input.focus();
      }
    });
    input.addEventListener('input', filter);
    root.addEventListener('keydown', event => {
      if (panel.hidden) return;
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); event.stopPropagation();
        const items = [...results.querySelectorAll('button')];
        const index = items.indexOf(document.activeElement);
        const next = event.key === 'ArrowDown' ? index + 1 : index < 0 ? items.length - 1 : index - 1;
        (items[next] || input).focus();
      }
      if (event.key === 'Enter' && event.target === input) { event.preventDefault(); results.querySelector('button')?.click(); }
    });
    const outside = event => { if (!root.contains(event.target)) close(); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    disposePicker = () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside); };
  }

  function trackJourney(action) {
    if (!active) return;
    try { dispatchEvent(new CustomEvent('opax:analytics', { detail: {
      event: 'opax_journey', properties: { action, lens: active.id, step: step + 1, step_count: active.steps.length },
    } })); } catch { /* optional measurement */ }
  }
  function present() {
    if (!active?.steps.length || destroyed) return;
    const shown = map.presentScene(active.steps[step].scene);
    if (shown === false) { trackJourney('unavailable'); playing = false; reason = 'This view is unavailable in the 3D map. You can still read each step and open its records.'; stopTimer(); render(); }
    else trackJourney(step === active.steps.length - 1 ? 'completed' : 'step');
  }
  function schedule() {
    stopTimer();
    if (!playing || !active || destroyed) return;
    timer = setTimeout(() => {
      timer = null;
      if (destroyed || !playing || !active) return;
      if (document.hidden || reduced.matches) { pause(); return; }
      step += 1;
      if (step >= active.steps.length - 1) { step = active.steps.length - 1; playing = false; }
      reason = ''; render(); present(); schedule(); options.onRoute?.(active.id, step, active.selection || '');
    }, STEP_MS);
  }
  function pause(why = '') {
    if (destroyed || !active || (!playing && !why)) return;
    trackJourney('paused');
    playing = false; stopTimer(); map.pauseScene?.();
    reason = why === 'map' ? 'Map paused for you to explore. Continue to return to this step.' : '';
    render();
  }
  function choose(id, requestedStep = 0, announce = true) {
    if (destroyed) return;
    const journey = journeys.find((item) => item.id === id);
    if (!journey) return;
    stopTimer(); playing = false; reason = ''; active = journey;
    step = Math.max(0, Math.min(journey.steps.length - 1, Math.trunc(Number(requestedStep)) || 0));
    render();
    if (active.steps.length) { present(); loadStory(); } else { pendingStory?.controller.abort(); pendingStory=null; map.clearScene(); }
    if (!active.steps.length) trackJourney('opened');
    if (announce) options.onRoute?.(active.id, step, active.selection || '');
  }
  function exit() {
    trackJourney('exited');
    pendingStory?.controller.abort(); pendingStory=null; stopTimer(); playing = false; active = null; reason = ''; render(); map.clearScene(); options.onRoute?.(null, 0, '');
  }
  function move(next) {
    if (!active || next < 0 || next >= active.steps.length) return;
    choose(active.id, next);
  }
  function onLens(event) {
    const button = event.target.closest('[data-journey]');
    if (button && controls.contains(button)) { choose(button.dataset.journey); if (matchMedia("(max-width: 700px)").matches) stage.scrollIntoView?.({ block: "start", behavior: reduced.matches ? "instant" : "smooth" }); }
  }
  function onAction(event) {
    const button = event.target.closest('button');
    if (!button || !story.contains(button) || button.disabled) return;
    if (button.dataset.step !== undefined) { move(Number(button.dataset.step)); story.querySelector(`[data-step="${step}"]`)?.focus({ preventScroll: true }); return; }
    switch (button.dataset.action) {
      case 'exit': exit(); break;
      case 'previous': move(step - 1); break;
      case 'next': move(step + 1); break;
      case 'play':
        if (playing) { pause(); break; }
        if (!active?.steps.length || reduced.matches || document.hidden) break;
        trackJourney('played');
        if (step === active.steps.length - 1) step = 0;
        else if (step === 0 && !reason) step = 1;
        playing = step < active.steps.length - 1; reason = ''; render(); present(); schedule(); options.onRoute?.(active.id, step, active.selection || ''); break;
    }
    // Keep keyboard focus on its control after the story's content changes.
    const selector = button.dataset.step !== undefined ? `[data-step="${button.dataset.step}"]` : `[data-action="${button.dataset.action}"]`;
    if (active) story.querySelector(selector)?.focus({ preventScroll: true });
    else controls.querySelector('[data-journey]')?.focus({ preventScroll: true });
  }
  function onPickerOpen(event) {
    if (event.target.id !== 'journey-focus' || !playing) return;
    // Keep the native dropdown mounted while the reader is choosing.
    playing = false; stopTimer(); map.pauseScene?.();
    const play = story.querySelector('[data-action="play"]');
    if (play) play.textContent = 'Play journey';
    const progress = story.querySelector('.journey-progress');
    if (progress) progress.innerHTML = '';
    const help = story.querySelector('.journey-help');
    if (help) help.textContent = 'Choose another focus, or play the journey.';
  }
  function onFocus(event) {
    const select = event.target;
    if (!active || select.id !== 'journey-focus' || !story.contains(select)) return;
    const id = active.id;
    selections[id] = active.choices.some(choice => choice.value === select.value) ? select.value : '';
    journeys = buildMoneyJourneys(data, selections);
    choose(id, 0);
    trackJourney('focus_selected');
    story.querySelector('[data-focus]')?.focus({ preventScroll: true });
  }
  function onKey(event) {
    if (!active || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); move(step + 1); story.querySelector(`[data-step="${step}"]`)?.focus({ preventScroll: true }); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(step - 1); story.querySelector(`[data-step="${step}"]`)?.focus({ preventScroll: true }); }
    if (event.key === 'Escape') { event.preventDefault(); exit(); }
  }
  const visibility = () => { if (document.hidden) pause(); };
  const motion = () => { if (reduced.matches) pause(); else render(); };
  const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => { if (!entries.at(-1)?.isIntersecting) pause(); });
  observer?.observe(stage);
  controls.addEventListener('click', onLens);
  story.addEventListener('click', onAction);
  story.addEventListener('change', onFocus);
  story.addEventListener('focusin', onPickerOpen);
  story.addEventListener('pointerdown', onPickerOpen);
  story.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', visibility);
  reduced.addEventListener('change', motion);
  render();
  if (options.initialJourney) choose(options.initialJourney, options.initialStep, false);
  return {
    pause,
    setRoute(id, requestedStep = 0, focus = '') {
      if (destroyed) return;
      if (id === active?.id && Number(requestedStep) === step && (active.selection || '') === (focus || '')) return;
      if (id) { selections[id] = focus || ''; journeys = buildMoneyJourneys(data, selections); }
      if (id) choose(id, requestedStep, false);
      else if (active) { pendingStory?.controller.abort(); pendingStory=null; stopTimer(); playing = false; active = null; render(); map.clearScene(); }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true; pendingStory?.controller.abort(); pendingStory=null; disposePicker(); stopTimer(); observer?.disconnect();
      controls.removeEventListener('click', onLens); story.removeEventListener('click', onAction); story.removeEventListener('change', onFocus); story.removeEventListener('focusin', onPickerOpen); story.removeEventListener('pointerdown', onPickerOpen); story.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', visibility); reduced.removeEventListener('change', motion);
      if (active) map.clearScene();
      controls.innerHTML = ''; story.innerHTML = ''; story.hidden = true; stage.classList.remove('has-journey');
    },
  };
}
