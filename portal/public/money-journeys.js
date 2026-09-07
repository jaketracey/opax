import { buildMoneyJourneys } from './money-journeys-data.js?v=selectors-1';

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
  controls.innerHTML = journeys.length ? `<div class="journey-intro"><h2>Take a closer look.</h2><p>Choose a lens. Follow the connections in 3D.</p></div><div class="journey-lenses" role="group" aria-label="Guided money map journeys">${journeys.map((journey) => `<button type="button" data-journey="${esc(journey.id)}" aria-pressed="false"><span>${esc(journey.title)}</span><small>${esc(journey.description)}</small></button>`).join('')}</div>` : '';

  function render() {
    if (destroyed) return;
    for (const button of controls.querySelectorAll('[data-journey]')) button.setAttribute('aria-pressed', String(button.dataset.journey === active?.id));
    story.hidden = !active;
    stage.classList.toggle('has-journey', Boolean(active));
    if (!active) { story.innerHTML = ''; return; }
    const header = `<div class="journey-story-top"><span>${esc(active.title)}</span><button type="button" data-action="exit" aria-label="End guided journey">×</button></div>`;
    const chooser = active.choices ? `<div class="journey-selector"><label for="journey-focus">${esc(active.selectorLabel || 'Focus')}</label><select id="journey-focus" data-focus="true" aria-label="${esc(active.selectorLabel || 'Focus')}"><option value="">Choose ${active.selectorLabel === 'Industry' ? 'an industry' : active.selectorLabel === 'Recipient' ? 'a recipient' : 'an organisation'}…</option>${active.choices.map(choice => `<option value="${esc(choice.value)}"${choice.value === active.selection ? ' selected' : ''}>${esc(choice.label)}</option>`).join('')}</select></div>` : '';
    if (!active.steps.length) {
      story.innerHTML = `${header}${chooser}<div class="journey-choice-empty"><h3>Where would you like to start?</h3><p>Choose from the dropdown to build your journey.</p><p class="journey-help">${esc(active.id === 'public-money' ? 'Recipients with both public-money and party-funding connections in this map.' : active.id === 'over-time' ? 'Organisations with dated receipts in both comparison windows.' : 'Choices reflect the connections available in this map.')}</p></div>`;
      return;
    }
    const current = active.steps[step];
    const metric = current.metric;
    story.innerHTML = `${header}${chooser}
      <div class="journey-steps" role="group" aria-label="Journey steps">${active.steps.map((item, i) => `<button type="button" data-step="${i}" aria-label="Step ${i + 1}: ${esc(item.title)}"${i === step ? ' aria-current="step"' : ''}>${i + 1}</button>`).join('')}</div>
      <div class="journey-narrative" aria-live="polite" aria-atomic="true"><p class="journey-step-label">${step + 1} of ${active.steps.length}</p><h3>${esc(current.title)}</h3><p>${esc(current.body)}</p>${metric && Number.isFinite(Number(metric.value)) ? `<div class="journey-metric"><strong>${esc(metric.format === 'currency' ? money(metric.value) : Number(metric.value).toLocaleString('en-AU'))}</strong><span>${esc(metric.label)}</span></div>` : ''}</div>
      <div class="journey-source-links">${(current.links || []).filter((link) => safeLink(link.href)).map((link) => `<a href="${esc(link.href)}">${esc(link.label)} <span aria-hidden="true">↗</span></a>`).join('')}</div>
      <div class="journey-playback"><button type="button" data-action="previous" aria-label="Previous step"${step === 0 ? ' disabled' : ''}>←</button><button type="button" data-action="play"${reduced.matches ? ' disabled' : ''}>${playing ? 'Pause' : step === active.steps.length - 1 ? 'Replay journey' : reason ? 'Continue journey' : 'Play journey'}</button><button type="button" data-action="next" aria-label="Next step"${step === active.steps.length - 1 ? ' disabled' : ''}>→</button></div>
      <div class="journey-progress" aria-hidden="true">${playing ? '<span></span>' : ''}</div><p class="journey-help">${esc(reason || (reduced.matches ? 'Animation is off. Use the arrows to explore each step.' : playing ? 'The next view opens in 7 seconds. Touch the map to pause.' : 'Step through, or play the journey. Drag the map to explore.'))}</p>`;
  }

  function present() {
    if (!active?.steps.length || destroyed) return;
    const shown = map.presentScene(active.steps[step].scene);
    if (shown === false) { playing = false; reason = 'This view is unavailable in the 3D map. You can still read each step and open its records.'; stopTimer(); render(); }
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
    if (destroyed || !active) return;
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
    if (active.steps.length) present(); else map.clearScene();
    if (announce) options.onRoute?.(active.id, step, active.selection || '');
  }
  function exit() {
    stopTimer(); playing = false; active = null; reason = ''; render(); map.clearScene(); options.onRoute?.(null, 0, '');
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
        if (step === active.steps.length - 1) step = 0;
        playing = true; reason = ''; render(); present(); schedule(); options.onRoute?.(active.id, step, active.selection || ''); break;
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
      else if (active) { stopTimer(); playing = false; active = null; render(); map.clearScene(); }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true; stopTimer(); observer?.disconnect();
      controls.removeEventListener('click', onLens); story.removeEventListener('click', onAction); story.removeEventListener('change', onFocus); story.removeEventListener('focusin', onPickerOpen); story.removeEventListener('pointerdown', onPickerOpen); story.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', visibility); reduced.removeEventListener('change', motion);
      if (active) map.clearScene();
      controls.innerHTML = ''; story.innerHTML = ''; story.hidden = true; stage.classList.remove('has-journey');
    },
  };
}
