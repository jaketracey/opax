export const FORMATS = {
  landscape: { viewport: { width: 1600, height: 800 }, contentSize: { width: 1920, height: 960 }, output: { width: 1920, height: 1080 }, deviceScaleFactor: 1.2 },
  portrait: { viewport: { width: 540, height: 840 }, contentSize: { width: 1080, height: 1680 }, output: { width: 1080, height: 1920 }, deviceScaleFactor: 2 },
};

export function validateScene(scene) {
  if (!/^[a-z0-9-]+$/.test(scene.id || '')) throw Error('Scene needs a lowercase, hyphenated id.');
  if (!scene.path?.startsWith('/') || scene.path.startsWith('//')) throw Error('Scene path must be relative to the site.');
  if (!scene.ready || !Array.isArray(scene.steps) || !scene.steps.length) throw Error('Scene needs a ready selector and steps.');
  const actions = new Set(['hold', 'scroll', 'type', 'click', 'hover', 'select', 'range']);
  if (scene.setup != null && !Array.isArray(scene.setup)) throw Error('Scene setup must be an array.');
  for (const step of [...(scene.setup || []), ...scene.steps]) {
    if (!actions.has(step.action)) throw Error(`Unknown action: ${step.action}`);
    if (scene.steps.includes(step) && (typeof step.caption !== 'string' || !step.caption.trim())) throw Error('Every step needs a caption.');
    if (step.action !== 'hold' && !step.target) throw Error(`${step.action} needs a target selector.`);
    if (['type', 'select', 'range'].includes(step.action) && step.value == null) throw Error(`${step.action} needs a value.`);
    if (step.holdMs != null && (!Number.isFinite(step.holdMs) || step.holdMs < 0 || step.holdMs > 30000)) throw Error('holdMs must be 0–30000.');
    if (step.frame && step.frame !== 'map-and-timeline') throw Error('Unknown frame composition.');
  }
  for (const guard of scene.evidence || []) {
    if (!/^\/research\/[a-z-]+\.json$/.test(guard.path) || typeof guard.recordId !== 'string') throw Error('Evidence needs a public dataset path and record id.');
    if (!Object.keys(guard.equals || {}).length && !Object.keys(guard.includes || {}).length) throw Error('Evidence needs at least one fact check.');
  }
  return scene;
}

export function verifyEvidence(dataset, guard) {
  const matches = dataset?.records?.filter(record => record.id === guard.recordId) || [];
  if (matches.length !== 1) throw Error(`Evidence: ${guard.recordId} must exist exactly once in ${guard.path}.`);
  const record = matches[0];
  for (const [field, value] of Object.entries(guard.equals || {})) {
    if (record[field] !== value) throw Error(`Evidence changed: ${guard.recordId}.${field}. Review the caption before recording.`);
  }
  for (const [field, phrases] of Object.entries(guard.includes || {})) {
    if (!Array.isArray(phrases) || !phrases.length || phrases.some(phrase => typeof phrase !== 'string' || !phrase.trim())) throw Error('Evidence excerpts must be non-empty text.');
    for (const phrase of phrases) {
      if (typeof record[field] !== 'string' || !record[field].includes(phrase)) throw Error(`Evidence excerpt changed: ${guard.recordId}.${field}. Review the caption before recording.`);
    }
  }
  return { path: guard.path, recordId: guard.recordId, datasetAsOf: dataset.as_of, checked: { equals: guard.equals || {}, includes: guard.includes || {} } };
}

export function ease(t) { return t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2; }

function stamp(ms, separator) {
  const total = Math.max(0, Math.round(ms));
  return `${String(Math.floor(total / 3600000)).padStart(2, '0')}:${String(Math.floor(total / 60000) % 60).padStart(2, '0')}:${String(Math.floor(total / 1000) % 60).padStart(2, '0')}${separator}${String(total % 1000).padStart(3, '0')}`;
}

export function subtitleFiles(captions) {
  // SRT and WebVTT players can interpret markup. Escape it in both formats;
  // replacing individual tag delimiters is not sufficient sanitisation.
  const text = value => value.replace(/\r/g, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return {
    srt: captions.map((c, i) => `${i + 1}\n${stamp(c.startMs, ',')} --> ${stamp(c.endMs, ',')}\n${text(c.text)}\n`).join('\n'),
    vtt: 'WEBVTT\n\n' + captions.map(c => `${stamp(c.startMs, '.')} --> ${stamp(c.endMs, '.')}\n${text(c.text)}\n`).join('\n'),
  };
}

// Run in the isolated recording browser. Nothing is added to the public site.
export function installOverlay() {
  const host = document.createElement('div');
  host.id = 'opax-recording-overlay';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host { pointer-events:none; }
    .pointer { position:fixed;left:0;top:0;width:23px;height:30px;filter:drop-shadow(0 1px 2px #142a4360);will-change:transform; }
    .click { position:fixed;width:16px;height:16px;border:2px solid #c79831;border-radius:50%;margin:-8px;box-sizing:border-box; }
  </style><svg class="pointer" viewBox="0 0 32 42"><path d="M3 2v31l8-8 7 14 6-3-7-14h12Z" fill="#142a43" stroke="white" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
  document.documentElement.append(host);
  const pointer = root.querySelector('.pointer');
  const move = (x, y) => {
    pointer.style.transform = `translate(${x - 3}px,${y - 2}px)`;
  };
  const click = (x, y) => {
    const ring = document.createElement('div'); ring.className = 'click'; ring.style.left = `${x}px`; ring.style.top = `${y}px`; root.append(ring);
    ring.animate([{ transform: 'scale(.5)', opacity: 1 }, { transform: 'scale(2.5)', opacity: 0 }], { duration: 350, easing: 'ease-out' }).finished.then(() => ring.remove());
  };
  document.addEventListener('mousemove', event => move(event.clientX, event.clientY), true);
  document.addEventListener('mousedown', event => click(event.clientX, event.clientY), true);
  const cursorStyle = document.createElement('style'); cursorStyle.textContent = '* { cursor: none !important; } #opax-voice { display:none !important; }'; document.head.append(cursorStyle);
  move(innerWidth * .78, innerHeight * .4);
}
