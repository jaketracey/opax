/* wombat.js — the OPAX loading wombat.
   A quietly waddling, line-drawn wombat for the Ask page's "checking the
   record" wait. Hairline bronze stroke work on paper, in the site's
   broadsheet register — closer to an engraving than a mascot.
   Plain browser ES module, no dependencies; inline SVG + CSS keyframes only.

     import { mountWombat } from "/wombat.js";
     const w = mountWombat(container, { label: "Checking the record…" });
     w.setLabel("Checking the record — 12s.");
     w.destroy();

   The caller owns aria (role="status" on the container); the SVG is
   aria-hidden and the label is plain text. */

const STYLE_ID = "wombat-styles";

/* One gait cycle is 16s: trundle on (0–44%), pause for a single slow sniff
   of the ground (44–56%), trundle off (56–100%). The rock and leg keyframes
   are generated over the same 16s so the shuffle stills exactly while the
   walk pauses; the seam at 100%→0% is offscreen, so phase there is moot. */
const SPANS = [[0, 44], [56, 100]];
const STEP = 2; // % of cycle per half-stride (0.32s)

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
  rows.push(`45.5% { ${rest} }`, `54.5% { ${rest} }`);
  return rows.join("\n    ");
}

function css() {
  const rock = gait(
    (even) => `transform: rotate(${even ? -1.6 : 1.6}deg) translateY(0)`,
    `transform: rotate(0deg) translateY(-0.8px)`, // mid-swing lift
    `transform: rotate(0deg) translateY(0)`
  );
  const legA = gait(
    (even) => `transform: rotate(${even ? -9 : 9}deg)`,
    null,
    `transform: rotate(0deg)`
  );
  const legB = gait(
    (even) => `transform: rotate(${even ? 9 : -9}deg)`,
    null,
    `transform: rotate(0deg)`
  );

  return `
.wb-wrap { display: block; width: fit-content; margin: 1.5rem auto; }
.wb-stage {
  position: relative;
  width: 320px;      /* explicit so the fit-content wrap doesn't shrink-wrap a short label */
  max-width: 100%;
  height: 48px;
  overflow: hidden;
  /* the wombat fades in entering and out leaving, rather than hard-clipping */
  mask-image: linear-gradient(to right,
    transparent, #000 30px, #000 calc(100% - 30px), transparent);
}
.wb-stage::after {
  content: "";
  position: absolute; left: 4px; right: 4px; bottom: 4px;
  height: 1px;
  background: var(--line-strong, #CFCABB);
}
.wb-trundle {
  position: absolute; bottom: 0; left: 0;
  width: 65px; height: 42px;
  animation: wb-trundle 16s linear infinite;
}
.wb-svg { display: block; width: 100%; height: 100%; overflow: visible; }

.wb-line  { fill: none; stroke: var(--bronze-ink, #8A5A12); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.wb-shape { fill: var(--bronze-wash, rgba(160, 118, 27, 0.16)); stroke: var(--bronze-ink, #8A5A12); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.wb-solid { fill: var(--bronze-ink, #8A5A12); }
.wb-soft  { stroke-width: 1.7; opacity: 0.55; }
.wb-far   { opacity: 0.5; }

.wb-sniff, .wb-rock, .wb-leg-i, .wb-eye { transform-box: fill-box; }
.wb-sniff { transform-origin: 70% 100%; animation: wb-sniff 16s ease-in-out infinite; }
.wb-rock  { transform-origin: 50% 100%; animation: wb-rock 16s ease-in-out infinite; }
.wb-leg-i { transform-origin: 50% 0; }
.wb-ph-a  { animation: wb-lega 16s ease-in-out infinite; }
.wb-ph-b  { animation: wb-legb 16s ease-in-out infinite; }
.wb-eye   { animation: wb-blink 5.2s linear infinite; }

.wb-label {
  margin: 2px 0 0;
  max-width: 320px;
  font: 400 0.9375rem/1.3 var(--sans, "Public Sans", -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
  color: var(--ink-soft, #575C52);
  text-align: center;
  text-wrap: balance;
}

@keyframes wb-trundle {
  0%   { transform: translateX(-80px); }
  44%  { transform: translateX(126px); }
  56%  { transform: translateX(126px); }
  100% { transform: translateX(340px); }
}
/* The one beat: mid-walk it pauses and takes a single unhurried sniff of
   the ground — the body pivots gently over the front feet, holds a moment,
   lifts just past level, and walks on. */
@keyframes wb-sniff {
  0%, 45% { transform: rotate(0deg); }
  48%     { transform: rotate(7deg); }
  50.5%   { transform: rotate(6.6deg); }
  53.5%   { transform: rotate(-0.8deg); }
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
  0%, 92%, 100% { opacity: 1; }
  94%, 95.5%    { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .wb-trundle { animation: none; left: calc(50% - 33px); }
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

/* Side view, facing right; one low chunky contour where the head is simply
   the front of the body, small round ears on the outline, a solid blunt
   nose, a single interior haunch line. Legs are short open arches tucked
   under the bottom edge so the contour stays unbroken. */
function markup() {
  const leg = (x) => `M ${x} 62.5 L ${x} 65.3 Q ${x} 68.6 ${x + 3} 68.6 L ${x + 5} 68.6 Q ${x + 8} 68.6 ${x + 8} 65.3 L ${x + 8} 62.5`;

  return `
  <div class="wb-stage">
    <div class="wb-trundle">
      <svg class="wb-svg" viewBox="0 0 120 78" aria-hidden="true" focusable="false">
        <g class="wb-sniff">
          <g class="wb-rock">
            <g class="wb-leg-i wb-ph-b wb-far"><path class="wb-shape" d="${leg(67.5)}"/></g>
            <g class="wb-leg-i wb-ph-a wb-far"><path class="wb-shape" d="${leg(38)}"/></g>

            <path class="wb-shape" d="M 26 63
              C 12 62 7 52 8 42
              C 9 28 20 18 40 16
              C 55 14.5 70 14 82 17
              C 94 20 103 26 107 35
              C 109.5 41 109.5 49 106 54
              C 102 60 94 62.5 86 63
              Z"/>

            <path class="wb-line wb-soft" d="M 20.5 33 C 15 41 15.5 52 23 58.5"/>

            <path class="wb-shape" d="M 80.5 16.8 C 80.8 10.4 88.8 10.6 88.3 18.7"/>
            <path class="wb-shape" d="M 90 19.6 C 90.2 12.8 99 13.2 98.6 22.2"/>

            <circle class="wb-eye wb-solid" cx="96" cy="33" r="1.8"/>
            <ellipse class="wb-solid" cx="105.6" cy="46.8" rx="5.6" ry="5"/>

            <g class="wb-leg-i wb-ph-a"><path class="wb-shape" d="${leg(81)}"/></g>
            <g class="wb-leg-i wb-ph-b"><path class="wb-shape" d="${leg(26)}"/></g>
          </g>
        </g>
      </svg>
    </div>
  </div>
  <p class="wb-label"></p>`;
}

export function mountWombat(container, { label = "Checking the record. This can take up to a minute." } = {}) {
  if (!container) throw new TypeError("mountWombat: container is required");
  ensureStyles();
  const wrap = document.createElement("div");
  wrap.className = "wb-wrap";
  wrap.innerHTML = markup();
  const labelEl = wrap.querySelector(".wb-label");
  labelEl.textContent = label;
  container.appendChild(wrap);
  return {
    setLabel(text) { labelEl.textContent = text; },
    destroy() { wrap.remove(); },
  };
}
