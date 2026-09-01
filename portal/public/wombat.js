/* wombat.js — the OPAX loading wombat.
   A waddling wombat for the Ask page's "checking the record" wait.
   Plain browser ES module, no dependencies; inline SVG + CSS keyframes only.

     import { mountWombat } from "/wombat.js";
     const w = mountWombat(container, { label: "Checking the record…" });
     w.setLabel("Checking the record — 12s.");
     w.destroy();

   The caller owns aria (role="status" on the container); the SVG is
   aria-hidden and the label is plain text. */

const STYLE_ID = "wombat-styles";

/* One gait cycle is 12s: trundle on (0–42%), stop and sniff the ground
   (42–58%), trundle off (58–100%). The rock and leg keyframes are generated
   over the same 12s so the shuffle freezes exactly while the walk pauses;
   the seam at 100%→0% is offscreen, so phase there doesn't matter. */
const SPANS = [[0, 42], [58, 100]];
const STEP = 2; // % of cycle per half-stride (0.24s)

function gait(extreme, mid, rest) {
  const rows = [];
  for (const [a, b] of SPANS) {
    const n = Math.round((b - a) / STEP);
    for (let i = 0; i <= n; i++) {
      const p = a + i * STEP;
      rows.push(`${p}% { ${extreme(i % 2 === 0)} }`);
      if (mid && i < n) rows.push(`${p + STEP / 2}% { ${mid} }`);
    }
  }
  rows.push(`44% { ${rest} }`, `56% { ${rest} }`);
  return rows.join("\n    ");
}

function css() {
  const rock = gait(
    (even) => `transform: rotate(${even ? -2.6 : 2.6}deg) translateY(0)`,
    `transform: rotate(0deg) translateY(-1.2px)`, // mid-swing lift
    `transform: rotate(0deg) translateY(0)`
  );
  const legA = gait(
    (even) => `transform: rotate(${even ? -14 : 14}deg)`,
    null,
    `transform: rotate(0deg)`
  );
  const legB = gait(
    (even) => `transform: rotate(${even ? 14 : -14}deg)`,
    null,
    `transform: rotate(0deg)`
  );

  return `
.wb-wrap { display: inline-block; vertical-align: top; }
.wb-stage {
  position: relative;
  width: min(280px, 100%);
  height: 58px;
  overflow: hidden;
}
.wb-stage::after {
  content: "";
  position: absolute; left: 4px; right: 4px; bottom: 4px;
  height: 1px;
  background: var(--line-strong, #CFCABB);
}
.wb-trundle {
  position: absolute; bottom: 1px; left: 0;
  width: 86px; height: 56px;
  animation: wb-trundle 12s linear infinite;
}
.wb-svg { display: block; width: 100%; height: 100%; overflow: visible; }

.wb-fur     { fill: var(--bronze, #A0761B); }
.wb-fur-far { fill: var(--bronze-ink, #8A5A12); }
.wb-belly   { fill: var(--bronze-bright, #D9A84A); opacity: 0.55; }
.wb-earin   { fill: var(--bronze-ink, #8A5A12); }
.wb-dark    { fill: var(--ink, #23271F); }
.wb-eye     { fill: var(--ink, #23271F); }
.wb-mouth   { fill: none; stroke: var(--ink, #23271F); stroke-width: 1.2; stroke-linecap: round; opacity: 0.65; }
.wb-shadow  { fill: var(--ink, #23271F); opacity: 0.08; }

.wb-sniff, .wb-rock, .wb-leg-i, .wb-eye { transform-box: fill-box; }
.wb-sniff { transform-origin: 70% 100%; animation: wb-sniff 12s ease-in-out infinite; }
.wb-rock  { transform-origin: 50% 100%; animation: wb-rock 12s ease-in-out infinite; }
.wb-leg-i { transform-origin: 50% 8%; }
.wb-ph-a  { animation: wb-lega 12s ease-in-out infinite; }
.wb-ph-b  { animation: wb-legb 12s ease-in-out infinite; }
.wb-eye   { transform-origin: center; animation: wb-blink 4.6s linear infinite; }

.wb-label {
  margin: 6px 0 0;
  max-width: 280px;
  font: 400 0.9375rem/1.4 var(--sans, "Public Sans", -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
  color: var(--ink-soft, #575C52);
  text-align: center;
}

@keyframes wb-trundle {
  0%   { transform: translateX(-100px); }
  42%  { transform: translateX(105px); }
  58%  { transform: translateX(105px); }
  100% { transform: translateX(300px); }
}
/* The funny beat: mid-walk it stops, sniffs the ground twice (whole body
   pivots over the front feet, nose down), pops back up, walks on. */
@keyframes wb-sniff {
  0%, 44% { transform: rotate(0deg); }
  46.5%   { transform: rotate(9deg); }
  48.5%   { transform: rotate(3deg); }
  51%     { transform: rotate(9.5deg); }
  53.5%   { transform: rotate(-2deg); }
  55.5%, 100% { transform: rotate(0deg); }
}
@keyframes wb-rock {
    ${rock}
}
@keyframes wb-lega {
    ${legA}
}
@keyframes wb-legb {
    ${legB}
}
@keyframes wb-blink {
  0%, 91%, 100% { opacity: 1; }
  93%, 95%      { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .wb-trundle { animation: none; left: calc(50% - 43px); }
  .wb-sniff, .wb-rock, .wb-leg-i { animation: none; }
  /* the eye keeps its opacity-only blink, so it still reads as alive */
}
`;
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = css();
  document.head.appendChild(style);
}

let uid = 0;

/* Side view, facing right. Wombats are basically bricks with legs: one long
   low blob where the head is just the front of the body, small round ears,
   a big blunt nose low on the face, stubby legs barely clearing the belly. */
function markup(id) {
  const leg = (x, w, phase, far) => `
      <g class="wb-leg-i wb-ph-${phase}">
        <rect x="${x}" y="50" width="${w}" height="${far ? 17 : 18}" rx="${far ? 4.5 : 5}" class="${far ? "wb-fur-far" : "wb-fur"}"/>
        <ellipse cx="${x + w / 2}" cy="${far ? 66.5 : 67.5}" rx="${far ? 5 : 5.4}" ry="${far ? 2.6 : 2.8}" class="wb-dark"/>
      </g>`;

  return `
  <div class="wb-stage">
    <div class="wb-trundle">
      <svg class="wb-svg" viewBox="0 0 120 78" aria-hidden="true" focusable="false">
        <defs>
          <path id="${id}-body" d="M 26 63
            C 12 62 7 52 8 42
            C 9 28 20 18 40 16
            C 55 14.5 70 14 82 17
            C 94 20 103 26 107 35
            C 109.5 41 109.5 49 106 54
            C 102 60 94 62.5 86 63
            Z"/>
          <clipPath id="${id}-clip"><use href="#${id}-body"/></clipPath>
        </defs>

        <ellipse class="wb-shadow" cx="58" cy="71.5" rx="46" ry="3.5"/>

        <g class="wb-sniff">
          <g class="wb-rock">
            ${leg(67, 10, "b", true)}
            ${leg(37, 10, "a", true)}

            <circle cx="84" cy="13" r="5" class="wb-fur-far"/>

            <use href="#${id}-body" class="wb-fur"/>
            <g clip-path="url(#${id}-clip)">
              <ellipse cx="60" cy="61" rx="34" ry="10" class="wb-belly"/>
            </g>

            <circle cx="95" cy="16" r="5.5" class="wb-fur"/>
            <circle cx="95.6" cy="16.4" r="2.4" class="wb-earin"/>

            <circle class="wb-eye" cx="93" cy="31" r="2.7"/>
            <ellipse class="wb-dark" cx="105" cy="46.5" rx="6.2" ry="5.4"/>
            <path class="wb-mouth" d="M 100 55.5 q 3.5 2 7 0.5"/>

            ${leg(80, 11, "a", false)}
            ${leg(25, 11, "b", false)}
          </g>
        </g>
      </svg>
    </div>
  </div>
  <p class="wb-label"></p>`;
}

export function mountWombat(container, { label = "Checking the record — this can take up to a minute." } = {}) {
  if (!container) throw new TypeError("mountWombat: container is required");
  ensureStyles();
  const wrap = document.createElement("div");
  wrap.className = "wb-wrap";
  wrap.innerHTML = markup(`wb${++uid}`);
  const labelEl = wrap.querySelector(".wb-label");
  labelEl.textContent = label;
  container.appendChild(wrap);
  return {
    setLabel(text) { labelEl.textContent = text; },
    destroy() { wrap.remove(); },
  };
}
