/* ask-steps.js — the lookups behind a counted answer, listed as they run.
   Some questions (who speaks most about X, how a topic has moved over the
   years) are answered by a short run of record lookups rather than one
   search. The Worker reports each lookup as it starts and ends (status
   events with phase "step"); this draws them as a compact list in the
   site's hairline register, one row per lookup: a ring that turns while it
   works, a washed ring and a tick once done, a dashed ring when it failed.
   Rows only ever come from those events, never from a clock.

     import { mountSteps, renderStepsLine } from "/ask-steps.js";
     const run = mountSteps(container);   // the live list ({ centred })
     run.step({ id, label, arg, state }); // a row added or moved on
     run.writing();                       // "Writing the answer", last
     run.destroy();
     renderStepsLine(slot, done.agentic); // "6 steps · 11 s", opens the list

   Under prefers-reduced-motion nothing turns or fades: the states change
   and that is all. Plain browser ES module, no dependencies. */

const STYLE_ID = "ask-steps-styles";
const STATE_SPOKEN = { running: "working", done: "done", failed: "failed" };

function css() {
  return `
.as-list { list-style: none; margin: 0; padding: 0; font: var(--type-fine); color: var(--ink-soft); }
.as-live { max-width: 30rem; margin: var(--space-tight) 0 0; }
/* Under a centred animal the column is centred at a fixed width, so a wider
   row arriving never pulls the rows above it sideways. */
.as-live.as-centred { width: min(22rem, 100%); margin-inline: auto; }
.as-row {
  display: grid; grid-template-columns: 16px minmax(0, 1fr); column-gap: var(--space-tight);
  align-items: center; min-height: 1.75rem;
}
/* One line per row, whatever its width: a long argument is cut short, never
   wrapped, so a row never grows and nothing under it moves. */
.as-text { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.as-label { color: var(--ink-soft); transition: color var(--duration-standard) var(--ease-standard); }
.as-row[data-state="running"] .as-label { color: var(--ink); }
.as-row[data-state="failed"] .as-label { color: var(--ink-faint); }
.as-sep { margin: 0 0.4em; color: var(--ink-faint); }
.as-arg { color: var(--ink-faint); }
.as-vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.as-mark { display: block; width: 16px; height: 16px; }
.as-mark svg { display: block; width: 100%; height: 100%; overflow: visible; }
.as-ring { fill: transparent; stroke: var(--bronze-ink); stroke-width: 1.1; opacity: 0.38; }
.as-row[data-state="done"] .as-ring { opacity: 1; fill: var(--bronze-wash); }
.as-row[data-state="failed"] .as-ring { stroke: var(--ink-faint); opacity: 1; stroke-dasharray: 2.2 2.2; }
.as-arc {
  fill: none; stroke: var(--bronze-ink); stroke-width: 1.6; stroke-linecap: round;
  opacity: 0; transform-box: fill-box; transform-origin: 50% 50%;
}
.as-row[data-state="running"] .as-arc { opacity: 1; }
.as-tick { fill: none; stroke: var(--bronze-ink); stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; opacity: 0; }
.as-row[data-state="done"] .as-tick { opacity: 1; }
.as-dash { stroke: var(--ink-faint); stroke-width: 1.3; stroke-linecap: round; opacity: 0; }
.as-row[data-state="failed"] .as-dash { opacity: 1; }

/* The finished run: one quiet line that opens the list. */
.as-done { margin: 0 0 var(--space-tight); }
.as-toggle {
  display: inline-flex; align-items: center; gap: var(--space-tight);
  min-height: var(--size-target); padding: 0 var(--space-tight) 0 0; margin: 0;
  background: none; border: 0; border-radius: var(--radius-sm); cursor: pointer;
  font: var(--type-fine); color: var(--ink-soft);
}
.as-toggle:hover { color: var(--ink); }
/* Two drawn chevrons, one shown: right while folded, down once open. */
.as-chev { width: 14px; height: 14px; flex: 0 0 auto; overflow: visible; }
.as-chev-open, .as-toggle[aria-expanded="true"] .as-chev-shut { display: none; }
.as-toggle[aria-expanded="true"] .as-chev-open { display: inline; }
.as-done .as-list { margin: 0 0 var(--space-tight); }

@media (prefers-reduced-motion: no-preference) {
  .as-row[data-state="running"] .as-arc { animation: as-turn 1.8s linear infinite; }
  .as-live .as-row { animation: as-in var(--duration-standard) var(--ease-standard) both; }
  @keyframes as-turn { to { transform: rotate(360deg); } }
  @keyframes as-in { from { opacity: 0; } }
}
@media (prefers-reduced-motion: reduce) {
  .as-label { transition: none; }
}`;
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = css();
  document.head.appendChild(style);
}

/* The ring, the hand, the tick and the dash share one box; the row's
   data-state decides which show. Same box in every state, so a row keeps
   its size as it moves on. */
const MARK = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
  <circle class="as-ring" cx="8" cy="8" r="6.5"/>
  <circle class="as-arc" cx="8" cy="8" r="6.5" pathLength="100" stroke-dasharray="26 74"/>
  <path class="as-tick" d="M4.9 8.3 L7.1 10.5 L11.2 6"/>
  <path class="as-dash" d="M5.5 8 H10.5"/>
</svg>`;
const CHEVRON = `<svg class="as-chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path class="as-chev-shut" d="M6 3.5 L10.5 8 L6 12.5"/><path class="as-chev-open" d="M3.5 6 L8 10.5 L12.5 6"/></svg>`;

const clean = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const stateOf = (state) => (state === "done" || state === "failed" ? state : "running");

/** One row: the mark, then "Label · arg". The text is set once; a state
 *  change only moves data-state and the mark's spoken name. */
function rowEl(step) {
  const li = document.createElement("li");
  li.className = "as-row";
  const mark = document.createElement("span");
  mark.className = "as-mark";
  mark.setAttribute("role", "img");
  mark.innerHTML = MARK;
  const text = document.createElement("span");
  text.className = "as-text";
  const label = document.createElement("span");
  label.className = "as-label";
  label.textContent = clean(step.label, 60) || "Checking the record";
  text.appendChild(label);
  const arg = clean(step.arg, 40);
  if (arg) {
    const sep = document.createElement("span");
    sep.className = "as-sep";
    sep.setAttribute("aria-hidden", "true");
    sep.textContent = "·";
    const spoken = document.createElement("span");
    spoken.className = "as-vh";
    spoken.textContent = ", ";
    const a = document.createElement("span");
    a.className = "as-arg";
    a.textContent = arg;
    text.append(sep, spoken, a);
  }
  li.append(mark, text);
  setState(li, step.state);
  return li;
}
function setState(li, state) {
  const s = stateOf(state);
  li.dataset.state = s;
  li.firstChild.setAttribute("aria-label", STATE_SPOKEN[s]);
}

/**
 * The live list. Rows are keyed by step id and kept in id order; "Writing
 * the answer" is always last. The list is a polite live region that hears
 * additions only, so each row is announced once, when it appears.
 */
export function mountSteps(container, { centred = false } = {}) {
  if (!container) throw new TypeError("mountSteps: container is required");
  ensureStyles();
  const list = document.createElement("ol");
  list.className = `as-list as-live${centred ? " as-centred" : ""}`;
  list.setAttribute("aria-label", "Steps");
  list.setAttribute("aria-live", "polite");
  list.setAttribute("aria-relevant", "additions");
  container.appendChild(list);
  const rows = new Map();
  let writingRow = null;
  return {
    el: list,
    step(step) {
      const id = Number(step?.id);
      if (!Number.isFinite(id)) return;
      const have = rows.get(id);
      if (have) { setState(have, step.state); return; }
      const li = rowEl(step);
      li.dataset.id = String(id);
      rows.set(id, li);
      const after = [...rows.entries()].filter(([k]) => k > id).sort((a, b) => a[0] - b[0])[0];
      list.insertBefore(li, after ? after[1] : writingRow);
    },
    writing() {
      if (writingRow) return;
      writingRow = rowEl({ label: "Writing the answer", state: "running" });
      list.appendChild(writingRow);
    },
    /** The steps seen so far, for a line drawn before the done payload. */
    steps() {
      return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([id, li]) => ({
        id,
        label: li.querySelector(".as-label")?.textContent || "",
        arg: li.querySelector(".as-arg")?.textContent || "",
        state: li.dataset.state,
      }));
    },
    destroy() { list.remove(); },
  };
}

function secondsText(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  const s = Math.max(1, Math.round(n / 1000));
  return { shown: `${s} s`, spoken: `${s} second${s === 1 ? "" : "s"}` };
}

let lineSeq = 0;
/**
 * The finished run as one quiet line, "6 steps · 11 s", a button that opens
 * the list underneath. Drawn from done.agentic, so a cached answer has it
 * too. An empty or missing run clears the slot.
 */
export function renderStepsLine(slot, agentic, { open = false } = {}) {
  if (!slot) return null;
  const steps = (Array.isArray(agentic?.steps) ? agentic.steps : []).filter((s) => s && (s.label || s.arg));
  if (!steps.length) { slot.replaceChildren(); slot.hidden = true; return null; }
  ensureStyles();
  const id = `as-steps-${++lineSeq}`;
  const wrap = document.createElement("div");
  wrap.className = "as-done";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "as-toggle";
  button.setAttribute("aria-expanded", String(open));
  button.setAttribute("aria-controls", id);
  const count = document.createElement("span");
  count.textContent = `${steps.length} step${steps.length === 1 ? "" : "s"}`;
  button.appendChild(count);
  const time = secondsText(agentic.ms);
  if (time) {
    const sep = document.createElement("span");
    sep.setAttribute("aria-hidden", "true");
    sep.textContent = "·";
    const shown = document.createElement("span");
    shown.setAttribute("aria-hidden", "true");
    shown.textContent = time.shown;
    const spoken = document.createElement("span");
    spoken.className = "as-vh";
    spoken.textContent = `, ${time.spoken}`;
    button.append(sep, shown, spoken);
  }
  button.insertAdjacentHTML("beforeend", CHEVRON);
  const list = document.createElement("ol");
  list.className = "as-list";
  list.id = id;
  list.setAttribute("aria-label", "Steps");
  list.hidden = !open;
  [...steps].sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0)).forEach((s) => list.appendChild(rowEl(s)));
  button.addEventListener("click", () => {
    const next = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(next));
    list.hidden = !next;
  });
  wrap.append(button, list);
  slot.replaceChildren(wrap);
  slot.hidden = false;
  return wrap;
}
