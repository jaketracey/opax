/* wombat.js — the OPAX loading menagerie.
   A small mob of quietly animated, line-drawn native animals for the site's
   waits — a wombat, an echidna, a platypus, an emu. Bronze ink on a soft
   bronze-and-paper fill, one stroke weight, in the site's broadsheet
   register: an engraving with some charm, not a mascot. Each mount draws
   lots. Plain browser ES module, no dependencies; inline SVG, with every
   style and keyframe in /loader.css, which this module links on first use
   (the import resolves once the sheet has loaded, so no mount is unstyled).

     import { mountWombat } from "/wombat.js";
     const w = mountWombat(container, { label: "Checking the record…" });
     w.setLabel("Checking the record — 12s.");
     w.destroy();

   Pass { animal: "wombat" | "echidna" | "platypus" | "emu" } to force one
   (handy in tests); otherwise the pick is random. { phase: -5.5 } starts the
   loop that many seconds in, so a short wait opens with the animal on stage.

   The caller owns aria (role="status" on the container); the SVG is
   aria-hidden and the label is plain text. */

const STYLE_ID = "wombat-styles";
const STYLESHEET = "/loader.css?v=9eafbed3f1";

/* Every animal lives in the same 65×42px trundle box (viewBox 0 0 120 78),
   feet on y≈68 so they land on the stage's hairline ground rule. Legs are
   drawn behind the body and reach up into it, so the body's own contour runs
   across their tops and they read as attached. */

/* A short-legged animal's leg: an open arch whose top is hidden in the body. */
const legArch = (x, t) =>
  `M ${x} ${t} L ${x} 65.3 Q ${x} 68.6 ${x + 3} 68.6 L ${x + 5} 68.6 Q ${x + 8} 68.6 ${x + 8} 65.3 L ${x + 8} ${t}`;

/* A limb that narrows from a (radius ra) to b (radius rb), round at both ends. */
function taper([ax, ay], [bx, by], ra, rb) {
  const len = Math.hypot(bx - ax, by - ay);
  const [ux, uy] = [(bx - ax) / len, (by - ay) / len];
  const [nx, ny] = [-uy, ux];
  const p = (x, y) => `${+x.toFixed(2)} ${+y.toFixed(2)}`;
  return `M ${p(ax + nx * ra, ay + ny * ra)} L ${p(bx + nx * rb, by + ny * rb)}`
    + ` A ${rb} ${rb} 0 0 0 ${p(bx - nx * rb, by - ny * rb)}`
    + ` L ${p(ax - nx * ra, ay - ny * ra)} A ${ra} ${ra} 0 0 0 ${p(ax + nx * ra, ay + ny * ra)} Z`;
}

/* The emu's leg at rest: hip, backward-bending joint, heel. The gait in
   loader.css turns about these points (scripts/build_loader_gait.mjs, EMU). */
const HIP = [47, 45.5];
const KNEE = [42.41, 56.59];
const HEEL = [47.5, 68];
const emuLeg = (cls, shift = 0) => `
          <g class="wb-leg ${cls}"${shift ? ` transform="translate(${shift} 0)"` : ""}>
            <g class="wb-thigh">
              <path class="wb-solid" d="${taper(HIP, KNEE, 2.9, 1.45)}"/>
              <g class="wb-shin">
                <path class="wb-line" d="M ${KNEE.join(" ")} L ${HEEL.join(" ")}"/>
                <g class="wb-toes"><path class="wb-line" d="M ${HEEL.join(" ")} L ${HEEL[0] + 5.6} ${HEEL[1]}"/></g>
              </g>
            </g>
          </g>`;

/* A soft contact shadow on the ground line, under the body; it stays on the
   ground while the body bobs, and narrows a touch as the body rises. */
const shadow = (n, cx, rx) => `
        <defs>
          <radialGradient class="wb-shade" id="wb-shade-${n}">
            <stop offset="0" stop-opacity="0.2"/><stop offset="0.6" stop-opacity="0.08"/><stop offset="1" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <ellipse class="wb-shadow" cx="${cx}" cy="68.4" rx="${rx}" ry="2.4" fill="url(#wb-shade-${n})"/>`;

/* A round eye with a pinpoint of light, which is what makes it look back. */
const eye = (cx, cy, r) => {
  const at = (n) => +n.toFixed(2);
  return `
            <g class="wb-eye"><circle class="wb-solid" cx="${cx}" cy="${cy}" r="${r}"/><circle class="wb-glint" cx="${at(cx + r * 0.32)}" cy="${at(cy - r * 0.34)}" r="${at(r * 0.32)}"/></g>`;
};

const ANIMALS = {

  /* Side view; one low chunky contour where the head is simply the front of
     the body, small round ears on the outline, a solid blunt nose, a single
     interior haunch line. Its beat: a single slow sniff of the ground. */
  wombat: (n) => `${shadow(n, 58, 44)}
        <g class="wb-beat">
          <g class="wb-leg wb-ph-b wb-far"><path class="wb-shape" d="${legArch(67.5, 57)}"/></g>
          <g class="wb-leg wb-ph-a wb-far"><path class="wb-shape" d="${legArch(38, 57)}"/></g>
          <g class="wb-leg wb-ph-a"><path class="wb-shape" d="${legArch(81, 57)}"/></g>
          <g class="wb-leg wb-ph-b"><path class="wb-shape" d="${legArch(26, 57)}"/></g>
          <g class="wb-rock">
            <path class="wb-shape" d="M 80.5 16.8 C 80.8 10.4 88.8 10.6 88.3 18.7"/>
            <path class="wb-shape" d="M 90 19.6 C 90.2 12.8 99 13.2 98.6 22.2"/>
            <path class="wb-shape" d="M 26 63
              C 12 62 7 52 8 42
              C 9 28 20 18 40 16
              C 55 14.5 70 14 82 17
              C 94 20 103 26 107 35
              C 109.5 41 109.5 49 106 54
              C 102 60 94 62.5 86 63
              Z"/>
            <path class="wb-line wb-soft" d="M 20.5 33 C 15 41 15.5 52 23 58.5"/>${eye(96, 32.8, 2.2)}
            <ellipse class="wb-solid" cx="105.6" cy="46.8" rx="5.6" ry="5"/>
          </g>
        </g>`,

  /* A low dome with the spines as a single row of swept-back strokes, a
     slender pointed snout off the front, and the same tucked leg arches set
     a little shorter. It rolls more than the wombat. Its beat: a probe, tipped
     well forward, working the snout at the ground. */
  echidna: (n) => `${shadow(n, 63, 38)}
        <g class="wb-beat">
          <g class="wb-leg wb-ph-b wb-far"><path class="wb-shape" d="${legArch(64, 58)}"/></g>
          <g class="wb-leg wb-ph-a wb-far"><path class="wb-shape" d="${legArch(38, 58)}"/></g>
          <g class="wb-leg wb-ph-a"><path class="wb-shape" d="${legArch(76, 58)}"/></g>
          <g class="wb-leg wb-ph-b"><path class="wb-shape" d="${legArch(27, 58)}"/></g>
          <g class="wb-rock">
            <path class="wb-line" d="M 25 45 L 16 39.8"/>
            <path class="wb-line" d="M 29.5 37 L 21.6 30"/>
            <path class="wb-line" d="M 37 31.5 L 31 23"/>
            <path class="wb-line" d="M 46.5 28.5 L 42.4 19.6"/>
            <path class="wb-line" d="M 57 27 L 54.8 17.6"/>
            <path class="wb-line" d="M 68 27 L 67.6 17.6"/>
            <path class="wb-line" d="M 78.5 28.5 L 80.3 19.6"/>
            <path class="wb-line" d="M 87.5 32 L 91.2 24"/>
            <path class="wb-line" d="M 94.5 37.5 L 100 30.6"/>
            <path class="wb-shape" d="M 89 64.5
              C 99 63.5 104 57 102.5 50
              C 100 36.5 85.5 27.5 64 27.5
              C 43 27.5 27 36.5 23 48.5
              C 20 58 27.5 63.7 37 64.5
              Z"/>
            <path class="wb-shape" d="M 96 49.5 C 103 50 109 53 113.5 57.5 C 108.5 58.8 102 58.3 95.5 56.3"/>${eye(92.4, 44.6, 2)}
          </g>
        </g>`,

  /* Long and low to the ground: a streamlined body, a broad flat tail off
     the back that sways lazily as it goes, and a spatulate bill off the
     front. It glides rather than trundles. Its beat: a dabble, the bill
     nosing along the ground. */
  platypus: (n) => `${shadow(n, 56, 36)}
        <g class="wb-beat">
          <g class="wb-leg wb-ph-b wb-far"><path class="wb-shape" d="${legArch(60, 59)}"/></g>
          <g class="wb-leg wb-ph-a wb-far"><path class="wb-shape" d="${legArch(42, 59)}"/></g>
          <g class="wb-leg wb-ph-a"><path class="wb-shape" d="${legArch(74, 59)}"/></g>
          <g class="wb-leg wb-ph-b"><path class="wb-shape" d="${legArch(30, 59)}"/></g>
          <g class="wb-rock">
            <g class="wb-aux"><path class="wb-shape" d="M 28 52.5 C 18 50 8.5 51.5 5 56 C 8.5 60.5 18 62.5 29 60.5"/></g>
            <path class="wb-shape" d="M 34 66.2
              C 23 65.5 16.5 59.5 18.5 52.5
              C 21 45.5 33 41.8 51 41.8
              C 69 42 83.5 45.5 90 50.5
              C 95.5 55 94.5 61.5 87 64.5
              C 77 67.5 55 67.2 34 66.2
              Z"/>
            <path class="wb-shape" d="M 89 51 C 96.5 49.6 104 50 109.5 51.8 C 111.4 52.6 111.4 55 109.5 55.9 C 104 58 96.5 58.3 89 57.2"/>${eye(85.8, 50.1, 1.8)}
          </g>
        </g>`,

  /* The tall one: a round shaggy body with a soft skirt of feathers at the
     rump, sturdy two-jointed legs, and one unbroken line up the neck and
     round the head to a short beak. It strides with its feet planted, the
     body bobbing twice a stride and the head nodding just behind it. Its
     beat: it leans back on its hips for a look about, blinks, gives one small
     nod and walks on. */
  emu: (n) => `${shadow(n, 46, 16)}
        <g class="wb-body">${emuLeg("wb-ph-b wb-far", -3.5)}${emuLeg("wb-ph-a")}
          <g class="wb-lean">
            <path class="wb-fill" d="${EMU_BODY} Z"/>
            <path class="wb-line" d="${EMU_BODY}"/>
            <path class="wb-line wb-soft" d="M 31.8 31.8 C 29 35.6 29 40.6 31.8 43.8"/>
            <g class="wb-neck">
              <path class="wb-fill" d="${EMU_NECK} L 54 31 L 57 37 L 60.4 36.2 Z"/>
              <path class="wb-line" d="${EMU_NECK}"/>
              <path class="wb-solid" d="M 77 6.8 C 79 7.1 81 7.7 82.4 8.7 C 81 9.5 79 10.1 77.1 10.3 Z"/>${eye(74.5, 7.3, 1.6)}
            </g>
          </g>
        </g>`,
};

/* The emu's outline, as two open strokes that meet tangent at the base of
   the neck (fills close them out of sight), so the neck can nod on its own
   without a seam: the body from the back of the neck round the rump's skirt
   to the chest, and the neck from the chest round the head to the nape. */
const EMU_BODY = `M 56 26.2
            C 51.5 23.2 42 22.6 35 25.6
            C 30 27.8 26.8 31.6 25.2 35.2
            C 23.6 38.8 24.6 41.6 26.8 42.6
            Q 27.6 45.6 30.8 45.6
            Q 32.6 48.4 36.4 48
            C 42 49.8 52 49.6 57.4 46.4
            C 60.4 44.6 61.2 38.2 61.8 36`;
const EMU_NECK = `M 61.8 36
              C 62.6 33 64.8 25.6 66.8 21.4
              C 68.6 17.8 70.2 15.2 71.2 12.7
              C 73.2 13.4 75.6 12.6 76.8 10.6
              C 77.9 8.6 77.5 5.9 75.6 4.6
              C 73.6 3.2 70.6 3.5 69.1 5.4
              C 67.7 7.2 67.8 9.8 68.6 11.6
              C 69.2 13.8 66.2 16.4 64.4 19.2
              C 62.4 22.4 59.8 25 56 26.2`;

const QUAD = new Set(["wombat", "echidna", "platypus"]);

/* The sheet, linked once per page; resolves when it has loaded (or failed:
   the label still carries the state, and the SVG has a size of its own). */
function loadStyles() {
  const have = document.getElementById(STYLE_ID);
  if (have?.sheet) return Promise.resolve();
  const link = have ?? Object.assign(document.createElement("link"), { id: STYLE_ID, rel: "stylesheet", href: STYLESHEET });
  const done = new Promise((resolve) => {
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", resolve, { once: true });
  });
  if (!have) document.head.appendChild(link);
  // A link that failed before this module ran fires nothing more: don't wait on it forever.
  let timer;
  const late = new Promise((resolve) => { timer = setTimeout(resolve, 4000); });
  return Promise.race([done, late]).finally(() => clearTimeout(timer));
}
await loadStyles();

/* Without registered custom properties the joints would jump from keyframe
   to keyframe, so such a browser gets the still pose. */
const SMOOTH = typeof CSS !== "undefined" && typeof CSS.registerProperty === "function";
let mounts = 0;

function markup(name) {
  return `
  <div class="wb-stage">
    <div class="wb-trundle wb-a-${name}${QUAD.has(name) ? " wb-quad" : ""}">
      <svg class="wb-svg" viewBox="0 0 120 78" width="65" height="42" aria-hidden="true" focusable="false">${ANIMALS[name](++mounts)}
      </svg>
    </div>
  </div>
  <p class="wb-label"><span class="wb-label-text"></span><span class="wb-dots" aria-hidden="true" hidden><i>.</i><i>.</i><i>.</i></span></p>`;
}

export function mountWombat(container, { label = "Checking the record. This can take up to a minute.", animal, phase } = {}) {
  if (!container) throw new TypeError("mountWombat: container is required");
  if (animal !== undefined && !Object.hasOwn(ANIMALS, animal)) {
    throw new TypeError(`mountWombat: unknown animal "${animal}"`);
  }
  const kinds = Object.keys(ANIMALS);
  const wrap = document.createElement("div");
  wrap.className = SMOOTH ? "wb-wrap" : "wb-wrap wb-still";
  /* `phase`, in seconds, starts the loop part-way through: every moving part
     shares the delay, so the gait stays in step with the walk. A wait that
     lasts a second or two would otherwise end before the animal had walked
     on; -5.5 puts it on stage mid-stride, a few steps from its pause. */
  if (typeof phase === "number" && Number.isFinite(phase)) wrap.style.setProperty("--wb-phase", `${phase}s`);
  wrap.innerHTML = markup(animal ?? kinds[Math.floor(Math.random() * kinds.length)]);
  const labelEl = wrap.querySelector(".wb-label-text");
  const dotsEl = wrap.querySelector(".wb-dots");
  /* One short sentence gets counting dots in place of its full stop. A label
     that carries a second sentence keeps its punctuation: dots after "Long
     questions can take a minute." would read as a truncation, not as progress.
     The dots are aria-hidden and the announced text keeps the sentence whole,
     so a screen reader is not told the same thing four times a second. */
  const setLabel = (text) => {
    const body = String(text ?? "").trim();
    const stem = body.replace(/[.…]+$/, "");
    const counts = stem !== body && !stem.includes(".");
    labelEl.textContent = counts ? stem : body;
    dotsEl.hidden = !counts;
  };
  setLabel(label);
  container.appendChild(wrap);
  return {
    setLabel,
    destroy() { wrap.remove(); },
  };
}
