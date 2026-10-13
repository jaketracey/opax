/* ask-steps.js — the lookups behind an answer, listed as they run.
   Ask answers by a short run of record lookups: the research loop (a few
   rounds of searches, reads and counts, each round chosen from what the last
   one found) or, as its fallback, the planner's fixed run. The Worker
   reports each lookup as it starts and ends (status events with phase
   "step"); this draws them as a compact list in the site's hairline
   register, one row per lookup: a ring that turns while it works, a washed
   ring and a tick once done, a dashed ring when it failed. A finished loop
   row carries what it found and how long it took ("128 passages · 1.2 s"),
   and a second round opens under a quiet "Round 2" rule. Rows only ever
   come from those events, never from a clock.

     import { mountSteps, renderStepsLine, renderResearchTrail } from "/ask-steps.js";
     const run = mountSteps(container);   // the live list ({ centred })
     run.step({ id, label, arg, state, round, results, ms }); // added or moved on
     run.writing();                       // "Writing the answer", last
     run.destroy();
     renderStepsLine(slot, done.agentic); // "6 steps · 11 s", opens the list
     renderResearchTrail(slot, done.research, { ms }); // "How this was researched"

   Under prefers-reduced-motion nothing turns or fades: the states change
   and that is all. Plain browser ES module, no dependencies. */

const STYLE_ID = "ask-steps-styles";
const STATE_SPOKEN = { running: "working", done: "done", failed: "failed" };
/* What a finished lookup's count counts, by tool. A tool not listed says
   "results"; nothing is guessed from the label. */
const UNITS = {
  search: ["passage", "passages"],
  read_passage: ["passage", "passages"],
  find_quotes: ["passage", "passages"],
  find_people: ["person", "people"],
  member_votes: ["vote", "votes"],
  party_donations: ["record", "records"],
  speech_trend: ["period", "periods"],
  electorates_rank: ["electorate", "electorates"],
};
const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

function css() {
  return `
.as-list { list-style: none; margin: 0; padding: 0; font: var(--type-fine); color: var(--ink-soft); }
.as-live { max-width: 30rem; margin: var(--space-tight) 0 0; }
/* Under a centred animal the column is centred at a fixed width, so a wider
   row arriving never pulls the rows above it sideways. A research-loop run
   (told by its first row) takes a little more from the start, for the
   counts at the right of its rows. */
.as-live.as-centred { width: min(22rem, 100%); margin-inline: auto; }
.as-live.as-centred.as-loop { width: min(28rem, 100%); }
/* Three columns: the mark, the words, and (for a research-loop lookup, once
   it has finished) what it found and how long it took. The last column is
   empty until then, so finishing only fills it: the row keeps its height. */
.as-row {
  display: grid; grid-template-columns: 16px minmax(0, 1fr) auto;
  align-items: center; min-height: 1.75rem;
}
/* One line per row, whatever its width: a long argument is cut short, never
   wrapped, so a row never grows and nothing under it moves. */
.as-text { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; padding-inline-start: var(--space-tight); }
.as-meta { color: var(--ink-faint); font-variant-numeric: tabular-nums; white-space: nowrap; text-align: end; }
.as-meta:not(:empty) { padding-inline-start: var(--space-heading); }
.as-row[data-state="done"] .as-meta { color: var(--ink-soft); }

/* A second round of lookups opens under its own quiet rule. */
.as-round {
  display: flex; align-items: center; gap: var(--space-tight);
  min-height: 1.75rem; margin-top: var(--space-tight);
  font: var(--type-label); color: var(--ink-faint);
}
.as-round:first-child { margin-top: 0; }
.as-round::after { content: ""; flex: 1 1 auto; height: var(--border-hairline); background: var(--divider-subtle); }
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

/* "How this was researched": a disclosure under the answer in the sources
   block's own idiom (.chat-sources gives the summary its chevron and
   target size). Folded, it reads as one line with the run's size; open, a
   sentence on how the run was made and the lookups, which wrap here rather
   than cut short, since nothing is arriving. */
.as-trail { margin: 0; }
/* The title holds to one line; on a phone the run's size wraps under it, and
   the chevron stays with the title's line, the summary still a full target. */
.as-trail > summary { align-items: flex-start; padding-block: calc((var(--size-target) - 1lh) / 2); }
.as-trail > summary::before { margin-top: calc((1lh - 7px) / 2 - var(--sp-2)); }
.as-trail[open] > summary::before { margin-top: calc((1lh - 7px) / 2 - var(--sp-4)); }
.as-trail-title { white-space: nowrap; }
.as-trail-meta { margin-inline-start: var(--space-tight); font: var(--type-fine); color: var(--ink-faint); font-variant-numeric: tabular-nums; white-space: nowrap; }
.as-trail-body { max-width: var(--size-readable); padding: 0 0 var(--space-block); }
.as-trail-mode { margin: 0 0 var(--space-heading); font: var(--type-fine); color: var(--ink-soft); }
.as-trail .as-row { align-items: start; padding-block: var(--space-line); }
.as-trail .as-mark { margin-block-start: calc((1lh - 16px) / 2); }
.as-trail .as-text { white-space: normal; overflow-wrap: anywhere; }
.as-trail .as-round { margin-top: var(--space-heading); }
.as-trail .as-round:first-child { margin-top: 0; }
/* Narrow (a phone, or the docked chat at any size): what a lookup found
   goes under its words instead of beside them. */
.as-trail-body { container-type: inline-size; }
@container (max-width: 30rem) {
  .as-trail .as-row { grid-template-columns: 16px minmax(0, 1fr); }
  .as-trail .as-meta { grid-column: 2; text-align: start; padding-inline-start: var(--space-tight); }
}

@media (prefers-reduced-motion: no-preference) {
  .as-row[data-state="running"] .as-arc { animation: as-turn 1.8s linear infinite; }
  .as-live :is(.as-row, .as-round) { animation: as-in var(--duration-standard) var(--ease-standard) both; }
  /* A finished count fades in where the empty column was. */
  .as-live .as-meta:not(:empty) { animation: as-in var(--duration-standard) var(--ease-standard) both; }
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
/* The planner says "failed", the research loop "error": one look for both. */
const stateOf = (state) => (state === "done" ? "done" : state === "failed" || state === "error" ? "failed" : "running");
const roundOf = (step) => {
  const n = Number(step?.round);
  return Number.isInteger(n) && n > 0 ? n : 0;
};
const count = (n, one, many = `${one}s`) => `${NUMBER_WORDS[n] ?? n.toLocaleString("en-AU")} ${n === 1 ? one : many}`;
/** A research-loop lookup carries its tool, round or count; the planner's
 *  rows do not, and keep the look they had. */
const isLoopStep = (step) => !!step && (typeof step.tool === "string" || roundOf(step) > 0 || Number.isFinite(Number(step.results ?? NaN)));

function resultsText(results, tool) {
  const n = Number(results);
  if (results == null || !Number.isFinite(n) || n < 0) return null;
  const [one, many] = UNITS[tool] || ["result", "results"];
  return n === 0 ? `No ${many}` : `${Math.round(n).toLocaleString("en-AU")} ${n === 1 ? one : many}`;
}
/** A lookup's own time: tenths under ten seconds, whole seconds above. */
function elapsedText(ms) {
  const n = Number(ms);
  if (ms == null || !Number.isFinite(n) || n < 0) return null;
  const s = n / 1000;
  if (s < 0.1) return { shown: "<0.1 s", spoken: "under a tenth of a second" };
  const v = s < 10 ? s.toFixed(1) : String(Math.round(s));
  return { shown: `${v} s`, spoken: `${v} second${v === "1" ? "" : "s"}` };
}

/** Visible parts joined by an unspoken dot, each with its own spoken form. */
function appendParts(el, parts) {
  parts.forEach((part, i) => {
    if (i) {
      const sep = document.createElement("span");
      sep.className = "as-sep";
      sep.setAttribute("aria-hidden", "true");
      sep.textContent = "·";
      el.appendChild(sep);
    }
    const shown = document.createElement("span");
    shown.textContent = part.shown;
    if (part.spoken === part.shown) { el.appendChild(shown); return; }
    shown.setAttribute("aria-hidden", "true");
    const spoken = document.createElement("span");
    spoken.className = "as-vh";
    spoken.textContent = part.spoken ? `, ${part.spoken}` : "";
    el.append(shown, spoken);
  });
}

/** The finished lookup's line: "128 passages · 1.2 s", or "Failed · 5.0 s".
 *  The mark already says failed, so the word is shown, not spoken twice. */
function fillMeta(meta, step, state) {
  meta.replaceChildren();
  if (state === "running" || !isLoopStep(step)) return;
  const parts = [];
  if (state === "failed") parts.push({ shown: "Failed", spoken: "" });
  else {
    const found = resultsText(step.results, step.tool);
    if (found) parts.push({ shown: found, spoken: found });
  }
  const time = elapsedText(step.ms);
  if (time) parts.push(time);
  if (!parts.length) return;
  const lead = document.createElement("span");
  lead.className = "as-vh";
  lead.textContent = ", ";
  meta.appendChild(lead);
  appendParts(meta, parts);
}

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
  const meta = document.createElement("span");
  meta.className = "as-meta";
  li.append(mark, text, meta);
  const round = roundOf(step);
  if (round) li.dataset.round = String(round);
  setState(li, step.state, step);
  return li;
}
function setState(li, state, step = {}) {
  const s = stateOf(state);
  li.dataset.state = s;
  li.firstChild.setAttribute("aria-label", STATE_SPOKEN[s]);
  fillMeta(li.lastChild, step, s);
}
function roundEl(round) {
  const li = document.createElement("li");
  li.className = "as-round";
  li.dataset.round = String(round);
  li.textContent = `Round ${round}`;
  return li;
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
  const rounds = new Map();
  let writingRow = null;
  /* Round 1 gets no rule of its own: it would have to arrive above rows
     already on screen. Each later round opens with one, placed before its
     first row (rows of an earlier round sit above it). */
  const markRound = (round) => {
    if (round < 2) return;
    const first = [...rows.values()].filter((li) => Number(li.dataset.round) === round)
      .sort((a, b) => Number(a.dataset.id) - Number(b.dataset.id))[0];
    if (!first) return;
    let rule = rounds.get(round);
    if (!rule) { rule = roundEl(round); rounds.set(round, rule); }
    if (rule.nextSibling !== first) list.insertBefore(rule, first);
  };
  return {
    el: list,
    step(step) {
      const id = Number(step?.id);
      if (!Number.isFinite(id)) return;
      const have = rows.get(id);
      if (have) { setState(have, step.state, step); return; }
      if (!rows.size && isLoopStep(step)) list.classList.add("as-loop");
      const li = rowEl(step);
      // A row is announced once, when it appears; its count is for the eye
      // here and is read out in the trail under the answer.
      li.lastChild.setAttribute("aria-hidden", "true");
      li.dataset.id = String(id);
      rows.set(id, li);
      const round = roundOf(step);
      const after = [...rows.entries()].filter(([k]) => k > id).sort((a, b) => a[0] - b[0])[0]?.[1];
      // A later round's rule stays with that round's first row.
      const rule = after?.previousSibling;
      const before = rule?.classList?.contains("as-round") && Number(rule.dataset.round) !== round ? rule : after;
      list.insertBefore(li, before || writingRow);
      markRound(round);
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
        ...(li.dataset.round ? { round: Number(li.dataset.round) } : {}),
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

const MODE_TEXT = {
  loop: (rounds) => rounds > 1
    ? `Researched in ${count(rounds, "round")}: each round chose what to look up next from what the one before it found.`
    : "Researched in one round of lookups, chosen from your question.",
  planner: () => "Planned from your question, then looked up in order.",
};

/**
 * "How this was researched": the finished run under the answer, from
 * done.research ({ mode, rounds, trail }). Folded by default to one line,
 * "How this was researched  7 steps · 2 rounds · 14 s"; open, a sentence on
 * how the run was made, then each lookup with what it found and its time,
 * under a "Round n" rule when there was more than one round. A native
 * <details>, so the keyboard and screen readers get a disclosure for free.
 * Trail rows carry their round when the caller has it (app.js copies it
 * from the live step events by id). An empty trail clears the slot.
 */
export function renderResearchTrail(slot, research, { ms } = {}) {
  if (!slot) return null;
  const trail = (Array.isArray(research?.trail) ? research.trail : []).filter((t) => t && (t.label || t.arg));
  if (!trail.length) { slot.replaceChildren(); slot.hidden = true; return null; }
  ensureStyles();
  const mode = research.mode === "planner" ? "planner" : "loop";
  const steps = trail
    .map((t, i) => {
      const id = Number.isFinite(Number(t.id)) ? Number(t.id) : i + 1;
      return { ...t, id, round: roundOf(t), state: t.ok === false ? "failed" : "done" };
    })
    .sort((a, b) => (a.round || 0) - (b.round || 0) || a.id - b.id);
  const seen = new Set(steps.map((s) => s.round).filter(Boolean));
  const declared = Number(research.rounds);
  const rounds = Number.isInteger(declared) && declared > 0 ? declared : Math.max(1, seen.size);
  const grouped = mode === "loop" && seen.size > 1;

  const wrap = document.createElement("details");
  wrap.className = "chat-sources as-trail";
  const summary = document.createElement("summary");
  const head = document.createElement("span");
  head.className = "as-trail-head";
  const title = document.createElement("span");
  title.className = "as-trail-title";
  title.textContent = "How this was researched";
  const meta = document.createElement("span");
  meta.className = "as-trail-meta";
  const many = (n, one) => `${n} ${one}${n === 1 ? "" : "s"}`;
  const parts = [{ shown: many(steps.length, "step"), spoken: many(steps.length, "step") }];
  if (mode === "loop" && rounds > 1) parts.push({ shown: many(rounds, "round"), spoken: many(rounds, "round") });
  const time = secondsText(ms);
  if (time) parts.push(time);
  appendParts(meta, parts);
  // Spoken after the title as one phrase: "How this was researched, 7 steps, ...".
  // The plain space is where a phone breaks the line: the hidden comma is
  // out of flow and offers none.
  const lead = document.createElement("span");
  lead.className = "as-vh";
  lead.textContent = ",";
  head.append(title, lead, " ", meta);
  summary.appendChild(head);

  const body = document.createElement("div");
  body.className = "as-trail-body";
  const how = document.createElement("p");
  how.className = "as-trail-mode";
  how.textContent = `${MODE_TEXT[mode](rounds)} The answer draws only on what these lookups returned.`;
  const list = document.createElement("ol");
  list.className = "as-list";
  list.setAttribute("aria-label", "Steps");
  let current = 0;
  for (const step of steps) {
    if (grouped && step.round && step.round !== current) {
      current = step.round;
      list.appendChild(roundEl(current));
    }
    list.appendChild(rowEl({ ...step, tool: step.tool ?? "" }));
  }
  body.append(how, list);
  wrap.append(summary, body);
  slot.replaceChildren(wrap);
  slot.hidden = false;
  return wrap;
}
