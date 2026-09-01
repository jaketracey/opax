/* wombat.js — the OPAX loading menagerie.
   A small mob of quietly animated, line-drawn native animals for the Ask
   page's "checking the record" wait — a wombat, an echidna, a platypus, an
   emu. Hairline bronze stroke work on paper, in the site's broadsheet
   register — closer to an engraving than a mascot. Each mount draws lots.
   Plain browser ES module, no dependencies; inline SVG + CSS keyframes only.

     import { mountWombat } from "/wombat.js";
     const w = mountWombat(container, { label: "Checking the record…" });
     w.setLabel("Checking the record — 12s.");
     w.destroy();

   Pass { animal: "wombat" | "echidna" | "platypus" | "emu" } to force one
   (handy in tests); otherwise the pick is random.

   The caller owns aria (role="status" on the container); the SVG is
   aria-hidden and the label is plain text. */

const STYLE_ID = "wombat-styles";

/* One cycle is 16s for every animal: move on (0–44%), pause for a single
   unhurried beat — the wombat sniffs the ground, the echidna probes it, the
   platypus dabbles, the emu bows for a look (44–56%) — then move off
   (56–100%). The rock and leg keyframes are generated over the same 16s so
   the gait stills exactly while the walk pauses; the seam at 100%→0% is
   offscreen, so phase there is moot. */
const SPANS = [[0, 44], [56, 100]];

function gait(step, extreme, mid, rest) {
  const rows = [];
  for (const [a, b] of SPANS) {
    const n = Math.round((b - a) / step);
    for (let i = 0; i <= n; i++) {
      const p = a + i * step;
      rows.push(`${p}% { ${extreme(i % 2 === 0)} }`);
      if (mid && i < n) rows.push(`${p + step / 2}% { ${mid} }`);
    }
  }
  rows.push(`45.5% { ${rest} }`, `54.5% { ${rest} }`);
  return rows.join("\n    ");
}

/* Legs are short open arches tucked under the body's bottom edge so each
   contour stays unbroken; t is where the arch tops vanish behind the body. */
const legArch = (x, t = 62.5) =>
  `M ${x} ${t} L ${x} 65.3 Q ${x} 68.6 ${x + 3} 68.6 L ${x + 5} 68.6 Q ${x + 8} 68.6 ${x + 8} 65.3 L ${x + 8} ${t}`;

/* Every animal lives in the same 65×42px trundle box (viewBox 0 0 120 78),
   feet on y≈68.6 so they land on the stage's hairline ground rule. Each
   defines its walking manner (step = % of cycle per half-stride, rock = the
   body's roll and mid-swing lift, legs = swing in degrees) and its one
   pause beat, then draws itself facing right. */
const ANIMALS = {

  /* Side view; one low chunky contour where the head is simply the front of
     the body, small round ears on the outline, a solid blunt nose, a single
     interior haunch line. */
  wombat: {
    step: 2,
    rock: { tilt: 1.6, lift: 0.8 },
    legs: 9,
    beat: {
      /* Mid-walk it pauses and takes a single slow sniff of the ground —
         the body pivots gently over the front feet, holds a moment, lifts
         just past level, and walks on. */
      origin: "70% 100%",
      frames: `
  0%, 45% { transform: rotate(0deg); }
  48%     { transform: rotate(7deg); }
  50.5%   { transform: rotate(6.6deg); }
  53.5%   { transform: rotate(-0.8deg); }
  55.5%, 100% { transform: rotate(0deg); }`,
    },
    svg: () => `
        <g class="wb-beat">
          <g class="wb-rock">
            <g class="wb-leg-i wb-ph-b wb-far"><path class="wb-shape" d="${legArch(67.5)}"/></g>
            <g class="wb-leg-i wb-ph-a wb-far"><path class="wb-shape" d="${legArch(38)}"/></g>

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

            <g class="wb-leg-i wb-ph-a"><path class="wb-shape" d="${legArch(81)}"/></g>
            <g class="wb-leg-i wb-ph-b"><path class="wb-shape" d="${legArch(26)}"/></g>
          </g>
        </g>`,
  },

  /* A low dome with the spines as a single row of fine swept-back strokes,
     a slender pointed snout off the front, and the same tucked leg arches
     set a little shorter. It rolls more than the wombat as it walks. */
  echidna: {
    step: 2,
    rock: { tilt: 2.3, lift: 0.5 },
    legs: 7,
    beat: {
      /* The pause is a probe: it tips well forward over the front feet and
         works the snout at the ground with one small double-dip. */
      origin: "72% 100%",
      frames: `
  0%, 45% { transform: rotate(0deg); }
  47.5%   { transform: rotate(9deg); }
  49.5%   { transform: rotate(7.4deg); }
  51%     { transform: rotate(9.4deg); }
  53.5%   { transform: rotate(-1deg); }
  55.5%, 100% { transform: rotate(0deg); }`,
    },
    svg: () => `
        <g class="wb-beat">
          <g class="wb-rock">
            <g class="wb-leg-i wb-ph-b wb-far"><path class="wb-shape" d="${legArch(64, 63.5)}"/></g>
            <g class="wb-leg-i wb-ph-a wb-far"><path class="wb-shape" d="${legArch(38, 63.5)}"/></g>

            <path class="wb-shape" d="M 89 64.5
              C 99 63.5 104 57 102.5 50
              C 100 36.5 85.5 27.5 64 27.5
              C 43 27.5 27 36.5 23 48.5
              C 20 58 27.5 63.7 37 64.5
              Z"/>

            <path class="wb-line wb-fine" d="M 25 45 L 15.5 39.5"/>
            <path class="wb-line wb-fine" d="M 29.5 37 L 21 29.5"/>
            <path class="wb-line wb-fine" d="M 37 31.5 L 30.5 22.5"/>
            <path class="wb-line wb-fine" d="M 46.5 28.5 L 42 19"/>
            <path class="wb-line wb-fine" d="M 57 27 L 54.5 17"/>
            <path class="wb-line wb-fine" d="M 68 27 L 67.5 17"/>
            <path class="wb-line wb-fine" d="M 78.5 28.5 L 80.5 19"/>
            <path class="wb-line wb-fine" d="M 87.5 32 L 91.5 23.5"/>
            <path class="wb-line wb-fine" d="M 94.5 37.5 L 100.5 30"/>

            <path class="wb-shape" d="M 96 49.5 C 103 50 109 53 113.5 57.5 C 108.5 58.8 102 58.3 95.5 56.3"/>

            <circle class="wb-eye wb-solid" cx="93" cy="45" r="1.6"/>

            <g class="wb-leg-i wb-ph-a"><path class="wb-shape" d="${legArch(76, 63.5)}"/></g>
            <g class="wb-leg-i wb-ph-b"><path class="wb-shape" d="${legArch(27, 63.5)}"/></g>
          </g>
        </g>`,
  },

  /* Long and low to the ground: a streamlined body, a broad flat tail off
     the back that sways lazily as it goes, and a spatulate bill off the
     front. It glides rather than trundles — barely any roll. */
  platypus: {
    step: 2,
    rock: { tilt: 0.9, lift: 0.5 },
    legs: 8,
    beat: {
      /* The pause is a dabble: the front dips so the bill noses along the
         ground, wavers once, and lifts away. */
      origin: "72% 100%",
      frames: `
  0%, 45% { transform: rotate(0deg); }
  48%     { transform: rotate(5.6deg); }
  50%     { transform: rotate(4.5deg); }
  51.5%   { transform: rotate(5.9deg); }
  54%     { transform: rotate(-0.7deg); }
  56%, 100% { transform: rotate(0deg); }`,
    },
    extraCss: (name) => `
.wb-a-${name} .wb-aux { transform-origin: 96% 45%; animation: wb-aux-${name} 16s ease-in-out infinite; }
@keyframes wb-aux-${name} {
    ${gait(11, (even) => `transform: rotate(${even ? -2.5 : 2.5}deg)`, null, `transform: rotate(0deg)`)}
}`,
    svg: () => `
        <g class="wb-beat">
          <g class="wb-rock">
            <g class="wb-aux"><path class="wb-shape" d="M 28 52.5 C 18 50 8.5 51.5 5 56 C 8.5 60.5 18 62.5 29 60.5"/></g>

            <g class="wb-leg-i wb-ph-b wb-far"><path class="wb-shape" d="${legArch(60, 64)}"/></g>
            <g class="wb-leg-i wb-ph-a wb-far"><path class="wb-shape" d="${legArch(42, 64)}"/></g>

            <path class="wb-shape" d="M 34 66.2
              C 23 65.5 16.5 59.5 18.5 52.5
              C 21 45.5 33 41.8 51 41.8
              C 69 42 83.5 45.5 90 50.5
              C 95.5 55 94.5 61.5 87 64.5
              C 77 67.5 55 67.2 34 66.2
              Z"/>

            <path class="wb-shape" d="M 89 51 C 96.5 49.6 104 50 109.5 51.8 C 111.4 52.6 111.4 55 109.5 55.9 C 104 58 96.5 58.3 89 57.2"/>

            <circle class="wb-eye wb-solid" cx="86.5" cy="50.3" r="1.4"/>

            <g class="wb-leg-i wb-ph-a"><path class="wb-shape" d="${legArch(74, 64)}"/></g>
            <g class="wb-leg-i wb-ph-b"><path class="wb-shape" d="${legArch(30, 64)}"/></g>
          </g>
        </g>`,
  },

  /* The tall one: a round shaggy body held high on two long thin legs, a
     couple of plume strokes drooping off the rump, and the neck rising to a
     small head and solid beak. It strides — a slower step with a clear bob —
     and only the neck moves for its beat. */
  emu: {
    step: 2.75,
    rock: { tilt: 0.8, lift: 1.3 },
    legs: 12,
    beat: {
      /* The pause is a survey: the neck cranes up and back to look about,
         holds, gives one small forward nod, and settles as it walks off. */
      origin: "30% 85%",
      frames: `
  0%, 45.5% { transform: rotate(0deg); }
  48%     { transform: rotate(-8deg); }
  51%     { transform: rotate(-6.8deg); }
  53.5%   { transform: rotate(3deg); }
  56%, 100% { transform: rotate(0deg); }`,
    },
    svg: () => `
        <g class="wb-rock">
          <g class="wb-leg-i wb-ph-b wb-far"><path class="wb-line" d="M 55 49 L 53.8 58.5 L 52 68.4 L 57.5 68.4"/></g>

          <path class="wb-shape" d="M 35.5 49.5
            C 28.5 44 29.5 32 40.5 26.5
            C 50 21.8 63 23.5 69 30
            C 74 35.5 73 44 66 48.5
            C 57.5 54 42.5 53.8 35.5 49.5
            Z"/>

          <path class="wb-line wb-soft" d="M 37 50.5 C 33 53.5 30.5 57 29 61"/>
          <path class="wb-line wb-soft" d="M 43 52.5 C 40.5 55.5 39 58.5 38.2 62"/>

          <g class="wb-beat">
            <path class="wb-shape" d="M 59 31
              C 64.5 28 66.5 22.5 67 14.5
              C 67.2 10.2 69.4 8.4 71.9 8.7
              C 74.4 9 75.8 11 75.4 13.8
              C 75 17 73.3 20 72 24
              C 70.8 27.6 70.2 31 69.8 34.5"/>
            <path class="wb-solid" d="M 75 10.6 L 80.6 12.4 L 74.8 14 Z"/>
            <circle class="wb-eye wb-solid" cx="72.3" cy="11.2" r="1.15"/>
          </g>

          <g class="wb-leg-i wb-ph-a"><path class="wb-line" d="M 47 49 L 45.8 58.5 L 44 68.4 L 49.5 68.4"/></g>
        </g>`,
  },
};

function animalCss(name, a) {
  const swing = (deg) => (even) => `transform: rotate(${even ? -deg : deg}deg)`;
  const rock = gait(a.step,
    (even) => `transform: rotate(${even ? -a.rock.tilt : a.rock.tilt}deg) translateY(0)`,
    `transform: rotate(0deg) translateY(${-a.rock.lift}px)`, // mid-swing lift
    `transform: rotate(0deg) translateY(0)`
  );
  const legA = gait(a.step, swing(a.legs), null, `transform: rotate(0deg)`);
  const legB = gait(a.step, swing(-a.legs), null, `transform: rotate(0deg)`);

  return `
.wb-a-${name} .wb-beat { transform-origin: ${a.beat.origin}; animation: wb-beat-${name} 16s ease-in-out infinite; }
.wb-a-${name} .wb-rock { animation: wb-rock-${name} 16s ease-in-out infinite; }
.wb-a-${name} .wb-ph-a { animation: wb-lega-${name} 16s ease-in-out infinite; }
.wb-a-${name} .wb-ph-b { animation: wb-legb-${name} 16s ease-in-out infinite; }
${a.extraCss ? a.extraCss(name) : ""}
@keyframes wb-beat-${name} {${a.beat.frames}
}
@keyframes wb-rock-${name} {
    ${rock}
}
@keyframes wb-lega-${name} {
    ${legA}
}
@keyframes wb-legb-${name} {
    ${legB}
}`;
}

function css() {
  return `
.wb-wrap { display: block; width: fit-content; margin: 1.5rem auto; }
.wb-stage {
  position: relative;
  width: 320px;      /* explicit so the fit-content wrap doesn't shrink-wrap a short label */
  max-width: 100%;
  height: 48px;
  overflow: hidden;
  /* the animal fades in entering and out leaving, rather than hard-clipping */
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
.wb-fine  { stroke-width: 1.5; }
.wb-far   { opacity: 0.5; }

.wb-beat, .wb-rock, .wb-leg-i, .wb-aux, .wb-eye { transform-box: fill-box; }
.wb-rock  { transform-origin: 50% 100%; }
.wb-leg-i { transform-origin: 50% 0; }
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
@keyframes wb-blink {
  0%, 92%, 100% { opacity: 1; }
  94%, 95.5%    { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .wb-trundle { animation: none; left: calc(50% - 33px); }
  .wb-beat, .wb-rock, .wb-leg-i, .wb-aux { animation: none; }
  /* the eye keeps its opacity-only blink, so it still reads as alive */
}
${Object.entries(ANIMALS).map(([name, a]) => animalCss(name, a)).join("\n")}`;
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = css();
  document.head.appendChild(style);
}

function markup(name) {
  return `
  <div class="wb-stage">
    <div class="wb-trundle wb-a-${name}">
      <svg class="wb-svg" viewBox="0 0 120 78" aria-hidden="true" focusable="false">${ANIMALS[name].svg()}
      </svg>
    </div>
  </div>
  <p class="wb-label"></p>`;
}

export function mountWombat(container, { label = "Checking the record. This can take up to a minute.", animal } = {}) {
  if (!container) throw new TypeError("mountWombat: container is required");
  if (animal !== undefined && !Object.hasOwn(ANIMALS, animal)) {
    throw new TypeError(`mountWombat: unknown animal "${animal}"`);
  }
  ensureStyles();
  const kinds = Object.keys(ANIMALS);
  const wrap = document.createElement("div");
  wrap.className = "wb-wrap";
  wrap.innerHTML = markup(animal ?? kinds[Math.floor(Math.random() * kinds.length)]);
  const labelEl = wrap.querySelector(".wb-label");
  labelEl.textContent = label;
  container.appendChild(wrap);
  return {
    setLabel(text) { labelEl.textContent = text; },
    destroy() { wrap.remove(); },
  };
}
