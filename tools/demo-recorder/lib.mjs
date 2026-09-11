export const FORMATS = {
  landscape: { viewport: { width: 1600, height: 900 }, output: { width: 1920, height: 1080 }, deviceScaleFactor: 1.2 },
  portrait: { viewport: { width: 540, height: 960 }, output: { width: 1080, height: 1920 }, deviceScaleFactor: 2 },
};

export function validateScene(scene) {
  if (!/^[a-z0-9-]+$/.test(scene.id || '')) throw Error('Scene needs a lowercase, hyphenated id.');
  if (!scene.path?.startsWith('/') || scene.path.startsWith('//')) throw Error('Scene path must be relative to the site.');
  if (!scene.ready || !Array.isArray(scene.steps) || !scene.steps.length) throw Error('Scene needs a ready selector and steps.');
  const actions = new Set(['hold', 'scroll', 'type', 'click', 'hover', 'select', 'range']);
  for (const step of scene.steps) {
    if (!actions.has(step.action)) throw Error(`Unknown action: ${step.action}`);
    if (typeof step.caption !== 'string' || !step.caption.trim()) throw Error('Every step needs a caption.');
    if (step.action !== 'hold' && !step.target) throw Error(`${step.action} needs a target selector.`);
    if (['type', 'select', 'range'].includes(step.action) && step.value == null) throw Error(`${step.action} needs a value.`);
    if (step.holdMs != null && (!Number.isFinite(step.holdMs) || step.holdMs < 0 || step.holdMs > 30000)) throw Error('holdMs must be 0–30000.');
  }
  return scene;
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
export function installOverlay({ captionsEnabled }) {
  const host = document.createElement('div');
  host.id = 'opax-recording-overlay';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host { pointer-events:none; }
    .pointer { position:fixed;left:0;top:0;width:34px;height:44px;filter:drop-shadow(0 2px 3px #142a4370);will-change:transform; }
    .halo { position:fixed;width:46px;height:46px;margin:-23px;border-radius:50%;background:#d8aa4430;border:2px solid #bd8c2460;box-sizing:border-box;will-change:transform; }
    .click { position:fixed;width:20px;height:20px;border:3px solid #c79831;border-radius:50%;margin:-10px;box-sizing:border-box; }
    .caption { position:fixed;bottom:48px;left:50%;transform:translateX(-50%);box-sizing:border-box;width:max-content;max-width:min(950px,82vw);padding:17px 27px 19px;background:#142a43f5;color:#fff;border-top:3px solid #d7aa48;border-radius:12px;box-shadow:0 10px 38px #142a4330;font:600 28px/1.4 Arial,sans-serif;text-align:center;text-wrap:balance; }
    .brand { display:block;margin-bottom:5px;font-size:11px;font-weight:700;letter-spacing:.14em;color:#e3bd6b; }
    @media(max-width:760px) { .caption { bottom:110px;max-width:88vw;padding:14px 20px 17px;font-size:23px;border-radius:10px; } .brand {font-size:10px;} .pointer {width:29px;height:38px;} }
  </style><div class="halo"></div><svg class="pointer" viewBox="0 0 32 42"><path d="M3 2v31l8-8 7 14 6-3-7-14h12Z" fill="#142a43" stroke="white" stroke-width="2.5" stroke-linejoin="round"/></svg><div class="caption" hidden><span class="brand">OPAX · EXPLORE THE RECORD</span><span class="words"></span></div>`;
  document.documentElement.append(host);
  const pointer = root.querySelector('.pointer'), halo = root.querySelector('.halo'), caption = root.querySelector('.caption');
  const move = (x, y) => {
    pointer.style.transform = `translate(${x - 3}px,${y - 2}px)`;
    halo.style.transform = `translate(${x}px,${y}px)`;
  };
  const click = (x, y) => {
    const ring = document.createElement('div'); ring.className = 'click'; ring.style.left = `${x}px`; ring.style.top = `${y}px`; root.append(ring);
    ring.animate([{ transform: 'scale(.5)', opacity: 1 }, { transform: 'scale(3.5)', opacity: 0 }], { duration: 560, easing: 'ease-out' }).finished.then(() => ring.remove());
  };
  document.addEventListener('mousemove', event => move(event.clientX, event.clientY), true);
  document.addEventListener('mousedown', event => click(event.clientX, event.clientY), true);
  const cursorStyle = document.createElement('style'); cursorStyle.textContent = '* { cursor: none !important; }'; document.head.append(cursorStyle);
  move(innerWidth * .78, innerHeight * .4);
  window.__opaxRecording = {
    caption(text) {
      root.querySelector('.words').textContent = text; caption.hidden = !captionsEnabled;
      if (captionsEnabled) caption.animate([{ opacity: 0, translate: '0 5px' }, { opacity: 1, translate: '0 0' }], { duration: 160, fill: 'both' });
      return Date.now();
    },
  };
}
