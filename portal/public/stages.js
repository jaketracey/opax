/* stages.js — the steps an answer moves through, drawn while the reader waits.
   A short vertical run of hairline bronze marks joined by a rule, in the
   site's engraving register: a hollow ring for a step still to come, a slow
   watch-hand sweep for the step in progress, a wash and a drawn tick for one
   done. The run is driven by the events the ask already streams, never by a
   clock: a step the Worker never reports stays pending, so the run can never
   claim work that did not happen. Plain browser ES module, no dependencies;
   inline SVG + CSS keyframes only.

     import { mountStages } from "/stages.js";
     const run = mountStages(container);
     run.set("search");             // this step in progress; earlier steps done
     run.complete();                // every step done (a cached answer)
     run.reading(["title", ...]);   // the passages being read, named under the run
     run.note("Still digging (12s).");
     await run.exit();              // the run lifts away; resolves after the beat
     run.reset();                   // back on stage (an attempt was withdrawn)
     run.destroy();

   Motion: rows fade up 4px on entry, each a beat after the one above; on
   exit they lift 10px away in the same order and the caller lets the answer
   rise into the space. Everything stops under prefers-reduced-motion: the
   states still show, the sweep holds still, the tick is simply drawn. */

const STYLE_ID = "stages-styles";

export const STEPS = [
  { key: "question", label: "Reading your question" },
  { key: "search", label: "Searching the record" },
  { key: "write", label: "Writing the answer" },
];

const STATE_TEXT = { pending: "", active: "in progress", done: "done" };

function css() {
  return `
.st-wrap {
  display: block; max-width: 30rem; margin: 0.2rem 0 0;
  font: 400 0.9375rem/1.4 var(--sans, "Public Sans", -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
  color: var(--ink-soft, #575C52);
}
.st-run { list-style: none; margin: 0; padding: 0; }
.st-row { display: grid; grid-template-columns: 22px minmax(0, 1fr); column-gap: 0.75rem; align-items: start; }
.st-col { display: flex; flex-direction: column; align-items: center; align-self: stretch; }
.st-mark { display: block; width: 22px; height: 22px; margin-top: 1px; flex: 0 0 auto; }
.st-mark svg { display: block; width: 100%; height: 100%; overflow: visible; }

/* The ring: a faint dial while a step waits or runs, washed and full once
   done. The running step is told by its hand, not by a darker dial. */
.st-ring {
  fill: transparent; stroke: var(--bronze-ink, #8A5A12); stroke-width: 1.1; opacity: 0.38;
  transition: opacity 260ms ease, fill 260ms ease;
}
.st-row[data-state="active"] .st-ring { opacity: 0.45; }
.st-row[data-state="done"] .st-ring { opacity: 1; fill: var(--bronze-wash, rgba(160, 118, 27, 0.16)); }

/* The hand: one short dark arc of the dial, turning at pocket-watch pace. */
.st-arc {
  fill: none; stroke: var(--bronze-ink, #8A5A12); stroke-width: 1.7; stroke-linecap: round;
  opacity: 0; transform-box: fill-box; transform-origin: 50% 50%;
}
.st-row[data-state="active"] .st-arc { opacity: 1; animation: st-turn 1.8s linear infinite; }

/* The tick draws itself on as a step completes. */
.st-tick {
  fill: none; stroke: var(--bronze-ink, #8A5A12); stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round;
  stroke-dasharray: 15; stroke-dashoffset: 15; opacity: 0;
}
.st-row[data-state="done"] .st-tick { opacity: 1; animation: st-draw 320ms cubic-bezier(0.22, 0.7, 0.3, 1) 80ms forwards; }

.st-rule {
  flex: 1; width: 1px; min-height: 10px; margin: 3px 0;
  background: var(--line, #E4E0D5); transition: background-color 260ms ease;
}
.st-row[data-state="done"] .st-rule { background: var(--bronze-rule, rgba(160, 118, 27, 0.55)); }
.st-row:last-child .st-rule { display: none; }

.st-label { padding: 2px 0 10px; color: var(--ink-faint, #6F7468); transition: color 260ms ease; }
.st-row[data-state="active"] .st-label { color: var(--ink, #23271F); font-weight: 500; }
.st-row[data-state="done"] .st-label { color: var(--ink-soft, #575C52); }

/* Under the run: the passages being read, and a word on a long wait. */
.st-reading, .st-note { margin: 0 0 0.4rem; font-size: 0.8125rem; line-height: 1.5; color: var(--ink-faint, #6F7468); }
.st-reading b { font-weight: 500; color: var(--ink-soft, #575C52); }
.st-reading i { font-style: italic; }
.st-reading .st-sep { margin: 0 0.35em; }
.st-vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

@keyframes st-turn { to { transform: rotate(360deg); } }
@keyframes st-draw { to { stroke-dashoffset: 0; } }

@media (prefers-reduced-motion: no-preference) {
  /* Entrance: each row a beat after the one above; the last has settled inside 0.4s. */
  .st-row, .st-reading, .st-note {
    animation: st-in 260ms cubic-bezier(0.22, 0.7, 0.3, 1) both;
    animation-delay: calc(var(--st-i, 0) * 40ms);
  }
  /* Handoff: the rows lift away in the same order and the answer takes the space. */
  .st-wrap.is-exiting .st-row, .st-wrap.is-exiting .st-reading, .st-wrap.is-exiting .st-note {
    animation: st-out 260ms cubic-bezier(0.22, 0.7, 0.3, 1) both;
    animation-delay: calc(var(--st-i, 0) * 45ms);
  }
  @keyframes st-in { from { opacity: 0; transform: translateY(4px); } }
  @keyframes st-out { to { opacity: 0; transform: translateY(-10px); } }
}
@media (prefers-reduced-motion: reduce) {
  .st-row[data-state="active"] .st-arc { animation: none; }
  .st-row[data-state="done"] .st-tick { animation: none; stroke-dashoffset: 0; }
  .st-ring, .st-rule, .st-label { transition: none; }
}`;
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = css();
  document.head.appendChild(style);
}

/* One mark: the ring, the sweep and the tick share a box; data-state on the
   row decides which of them shows. pathLength normalises the sweep's dash to
   a fraction of the ring whatever its radius. */
const MARK = `<svg viewBox="0 0 22 22" aria-hidden="true" focusable="false">
  <circle class="st-ring" cx="11" cy="11" r="9"/>
  <circle class="st-arc" cx="11" cy="11" r="9" pathLength="100" stroke-dasharray="26 74"/>
  <path class="st-tick" d="M6.6 11.4 L9.7 14.5 L15.6 8.2"/>
</svg>`;

export function mountStages(container, { steps = STEPS } = {}) {
  if (!container) throw new TypeError("mountStages: container is required");
  ensureStyles();
  const wrap = document.createElement("div");
  wrap.className = "st-wrap";
  const run = document.createElement("ol");
  run.className = "st-run";
  run.setAttribute("aria-label", "Progress");
  const rows = steps.map((step, i) => {
    const li = document.createElement("li");
    li.className = "st-row";
    li.dataset.state = "pending";
    li.style.setProperty("--st-i", String(i));
    const col = document.createElement("span");
    col.className = "st-col";
    const mark = document.createElement("span");
    mark.className = "st-mark";
    mark.innerHTML = MARK;
    const rule = document.createElement("span");
    rule.className = "st-rule";
    rule.setAttribute("aria-hidden", "true");
    col.append(mark, rule);
    const label = document.createElement("span");
    label.className = "st-label";
    label.textContent = step.label;
    const state = document.createElement("span");
    state.className = "st-vh";
    label.appendChild(state);
    li.append(col, label);
    run.appendChild(li);
    return { li, state };
  });
  const reading = document.createElement("p");
  reading.className = "st-reading";
  reading.style.setProperty("--st-i", String(steps.length));
  reading.hidden = true;
  const note = document.createElement("p");
  note.className = "st-note";
  note.style.setProperty("--st-i", String(steps.length + 1));
  note.hidden = true;
  wrap.append(run, reading, note);
  container.appendChild(wrap);

  const paint = (activeIndex) => {
    rows.forEach((row, i) => {
      const state = i < activeIndex ? "done" : i === activeIndex ? "active" : "pending";
      if (row.li.dataset.state === state) return;
      row.li.dataset.state = state;
      row.state.textContent = STATE_TEXT[state] ? `, ${STATE_TEXT[state]}` : "";
    });
  };

  return {
    set(key) {
      const at = steps.findIndex((step) => step.key === key);
      if (at >= 0) paint(at);
    },
    complete() { paint(steps.length); },
    reading(titles) {
      const list = (titles || []).map((t) => String(t || "").trim()).filter(Boolean).slice(0, 3);
      reading.replaceChildren();
      if (!list.length) { reading.hidden = true; return; }
      const lead = document.createElement("b");
      lead.textContent = "Reading";
      reading.append(lead, " ");
      list.forEach((title, i) => {
        if (i) {
          const sep = document.createElement("span");
          sep.className = "st-sep";
          sep.setAttribute("aria-hidden", "true");
          sep.textContent = "·";
          reading.appendChild(sep);
        }
        const em = document.createElement("i");
        em.textContent = title;
        reading.appendChild(em);
      });
      reading.hidden = false;
    },
    note(text) {
      const body = String(text || "").trim();
      note.textContent = body;
      note.hidden = !body;
    },
    exit() {
      wrap.classList.add("is-exiting");
      const motion = matchMedia("(prefers-reduced-motion: no-preference)").matches;
      return new Promise((resolve) => setTimeout(resolve, motion ? 340 : 0));
    },
    reset() { wrap.classList.remove("is-exiting"); },
    destroy() { wrap.remove(); },
  };
}
