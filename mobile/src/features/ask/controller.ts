import { phoneCopy } from '../../design/phone-copy';
import {
  decodeAnswer,
  decodeFollowups,
  defaultOptions,
  isNoAnswer,
  requestBody,
  sourcePassage,
  titleFor,
  type Answer,
  type AskOptions,
  type ChatStore,
  type Followup,
  type Turn,
} from './model';
import {
  AskFailure,
  type AskStage,
  type AskStep,
  type StreamHandlers,
} from './stream';
import { runningSteps } from './status';

/** The same eligibility check reserves rows before the answer is saved. */
function followupPassages(data: Answer) {
  if (
    data.money_ranking ||
    data.pay_answer ||
    isNoAnswer(data) ||
    ['needs_scope', 'needs_period'].includes(data.answer_status || '')
  )
    return [];
  return data.sources
    .map((s) => ({
      title: s.title || s.slug,
      text: sourcePassage(s.snippet, false),
    }))
    .filter((p) => p.text)
    .slice(0, 8);
}

/**
 * The thread with `turn` replaced by a copy that carries its Ask next rows.
 * A new object, never a write into the turn: the screen and the saved copy
 * see the rows only through an update or a save.
 */
function withNext(thread: readonly Turn[], turn: Turn, next: Followup[]) {
  const answered: Turn = { ...turn, next };
  return thread.map((m) => (m === turn ? answered : m));
}

export type AskState = {
  id: string | null;
  thread: Turn[];
  options: AskOptions;
  busy: boolean;
  stage: AskStage | null;
  steps: AskStep[];
  /** How many records the running answer is reading (a count, never titles). */
  reading: number;
  streaming: string;
  error: AskFailure | null;
  /** A question that failed before it joined the thread, shown as its heading. */
  failed: { question: string; carry?: Followup } | null;
  notice: string | null;
  // A follow-up with nothing to search on ("High", "ok"): the Worker asked
  // for a full question instead of answering. Never part of the thread.
  clarify: { question: string; suggestion?: string } | null;
  /** The composer's text. It lives here so arrivals can fill it. */
  draft: string;
  /**
   * An arrival from outside Ask that waits for a running answer to end.
   * Sending it starts a new conversation with `freshOptions`.
   */
  fresh: boolean;
  freshOptions: AskOptions | null;
  /**
   * A tapped question (`askNow`) that arrived while an answer was running:
   * it is asked as soon as that answer ends. Editing the draft makes it the
   * reader's own again, sent only by Send.
   */
  queued: boolean;
  /** A question held for consent (A1): sent on Continue, kept on Not now. */
  pending: { question: string; carry?: Followup; fromDraft: boolean } | null;
  /** The newest answer is awaiting Ask next suggestions (three reserved rows). */
  nextLoading: boolean;
  /**
   * When the latest question's first words arrived (device clock) and how
   * long after it was asked: the first streamed text, or a whole answer
   * that streamed none. A new question clears it. Held here, not in the
   * thread view, so a remounted view knows the words came while it was away
   * and never gives the arrival haptic again or late.
   */
  firstText: { at: number; waited: number } | null;
};
export type AskIO = {
  post: (
    path: string,
    body: object,
    signal: AbortSignal,
    on?: StreamHandlers,
  ) => Promise<unknown>;
  read: () => ChatStore;
  save: (s: ChatStore) => Promise<void>;
  sync?: (id: string) => Promise<void>;
  /** "New" sticks across launches: the stored active id is cleared. */
  forgetActive?: () => void;
  id: () => string;
  now: () => number;
  /**
   * Sends a queued question once the running answer has ended (consent and
   * the Person check, as Send does). Without it, the draft is sent directly.
   */
  sendQueued?: () => Promise<void> | void;
  /**
   * Analytics for each question's outcome: durations, counts and flags only,
   * never the question or answer (src/analytics/events.ts).
   */
  measure?: (event: AskMeasure, properties: AskMeasureProperties) => void;
  /** The screen section the question was asked from. */
  section?: () => string;
};
export type AskMeasure =
  | 'opax_ask_started'
  | 'opax_ask_completed'
  | 'opax_ask_failed';
export type AskMeasureProperties = Record<string, string | number | boolean>;
type Running = {
  before: Turn[];
  question: string;
  started: number;
  section: string;
  followUp: boolean;
};
const arrival = (run: Running, at: number) => ({
  at,
  waited: at - run.started,
});
/** What Stop did with the stopped question (journeys/ask.md 4.4 step 4). */
export type StopResult = 'restored' | 'kept' | null;
export class AskController {
  private state: AskState = {
    id: null,
    thread: [],
    options: { ...defaultOptions },
    busy: false,
    stage: null,
    steps: [],
    reading: 0,
    streaming: '',
    error: null,
    failed: null,
    notice: null,
    clarify: null,
    draft: '',
    fresh: false,
    freshOptions: null,
    queued: false,
    pending: null,
    nextLoading: false,
    firstText: null,
  };
  private listeners = new Set<() => void>();
  private abort: AbortController | null = null;
  private nextAbort: AbortController | null = null;
  private running: Running | null = null;
  private sequence = 0;
  constructor(private io: AskIO) {}
  snapshot = () => this.state;
  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
  };
  private measure(
    event: AskMeasure,
    run: Running,
    properties: AskMeasureProperties = {},
  ) {
    try {
      this.io.measure?.(event, {
        from_section: run.section,
        follow_up: run.followUp,
        ...(event === 'opax_ask_started'
          ? {}
          : { duration_ms: Math.max(0, this.io.now() - run.started) }),
        ...properties,
      });
    } catch {
      /* Analytics never interrupts an answer. */
    }
  }
  private update(p: Partial<AskState>) {
    // Round boundaries, completion, cancellation and a new question discard
    // outstanding lookups, including any whose terminal event never arrived.
    this.state = {
      ...this.state,
      ...p,
      ...(p.stage !== undefined ? { steps: [] } : {}),
    };
    for (const f of this.listeners) f();
  }
  /** The options the composer's tags show: a fresh draft's, else the conversation's. */
  composerOptions(): AskOptions {
    return this.state.fresh && this.state.freshOptions
      ? this.state.freshOptions
      : this.state.options;
  }
  /** Options edits go to a fresh draft when one waits, never to a running answer. */
  options(o: AskOptions) {
    if (this.state.fresh) this.update({ freshOptions: o });
    else if (!this.state.busy) this.update({ options: o });
  }
  setDraft(text: string) {
    // Editing a queued question makes it the reader's: Send sends it.
    const queued = this.state.queued && text === this.state.draft;
    // Emptying the composer turns a fresh draft back into a follow-up box.
    if (!text.trim() && this.state.fresh)
      this.update({ draft: text, fresh: false, freshOptions: null, queued });
    else this.update({ draft: text, queued });
  }
  /** A tapped question clears the text while keeping the composer's options. */
  clearDraft() {
    this.update({ draft: '' });
  }
  /** Clears an arrival's options line (its ⓧ): back to the conversation's own. */
  clearFresh() {
    this.update({ fresh: false, freshOptions: null, queued: false });
  }
  /** Opens a saved conversation. False while an answer is being written. */
  open(id: string): boolean {
    if (this.state.busy) return false;
    const store = this.io.read();
    const c = store.chats.find((c) => c.id === id);
    if (!c) return false;
    this.cancel();
    const mine = ++this.sequence;
    this.update({
      id,
      thread: c.thread,
      options: c.options || {
        ...defaultOptions,
        kind: c.kind,
        speaker: c.speaker,
      },
      error: null,
      failed: null,
      streaming: '',
      stage: null,
      clarify: null,
      notice: null,
      fresh: false,
      freshOptions: null,
      queued: false,
      nextLoading: false,
      reading: 0,
      draft: '',
      pending: null,
    });
    // Remember the selection without changing the conversation's date.
    if (store.active !== id)
      void this.io.save({ ...store, active: id }).catch(() => {
        if (mine === this.sequence)
          this.update({
            notice: phoneCopy(
              'This conversation couldn’t be saved on this iPhone.',
            ),
          });
      });
    return true;
  }
  /**
   * A sync brought a newer copy of the open conversation: show its turns
   * without touching the composer, a failed question or a waiting arrival.
   */
  reload(id: string) {
    if (this.state.busy || this.state.id !== id) return;
    const c = this.io.read().chats.find((c) => c.id === id);
    if (!c || JSON.stringify(c.thread) === JSON.stringify(this.state.thread))
      return;
    this.update({ thread: c.thread });
  }
  start(options: AskOptions = { ...defaultOptions }) {
    this.cancel();
    this.sequence++;
    if (this.running)
      this.measure('opax_ask_failed', this.running, { cancelled: true });
    this.running = null;
    this.io.forgetActive?.();
    this.update({
      id: null,
      thread: [],
      options,
      busy: false,
      error: null,
      failed: null,
      streaming: '',
      stage: null,
      reading: 0,
      notice: null,
      clarify: null,
      fresh: false,
      freshOptions: null,
      queued: false,
      nextLoading: false,
    });
  }
  /** The bar's New question: never while an answer is being written. */
  newConversation() {
    if (this.state.busy) return false;
    this.start();
    this.update({ draft: '', pending: null });
    return true;
  }
  /**
   * An arrival from outside the Ask tab: always a new conversation, never a
   * cancelled answer. A generic "Ask about …" only fills the composer. A
   * tapped question (`queue`) that meets a running answer waits, marked
   * "Asks when this answer finishes", and is sent when that answer ends;
   * with nothing running the caller sends it at once (session `askNow`).
   */
  arrive(question: string, options: AskOptions, { queue = false } = {}) {
    if (this.state.busy)
      this.update({
        draft: question,
        fresh: true,
        freshOptions: options,
        queued: queue && !!question.trim(),
      });
    else {
      this.start(options);
      this.update({ draft: question, pending: null });
    }
  }
  /**
   * A queued question goes once the answer it waited for has been written
   * (or the reader stopped it); never twice.
   */
  private flushQueued() {
    const s = this.state;
    if (!s.queued || s.busy) return;
    this.update({ queued: false });
    if (!s.draft.trim()) return;
    // After the ended answer's save, on the next tick.
    setTimeout(() => {
      if (this.state.busy || !this.state.draft.trim()) return;
      void (this.io.sendQueued ? this.io.sendQueued() : this.sendDraft());
    }, 0);
  }
  cancel() {
    this.abort?.abort();
    this.nextAbort?.abort();
    this.nextAbort = null;
  }
  /**
   * Stop: the unfinished turn goes. The question returns to an empty
   * composer; anything already in the composer (a waiting draft, words the
   * reader typed) is kept as it is.
   */
  stop(): StopResult {
    if (!this.state.busy || !this.running) return null;
    const { before, question } = this.running;
    this.measure('opax_ask_failed', this.running, { cancelled: true });
    this.sequence++;
    this.abort?.abort();
    this.abort = null;
    this.running = null;
    const restored = !this.state.draft.trim();
    this.update({
      thread: before,
      busy: false,
      stage: null,
      streaming: '',
      reading: 0,
      error: null,
      failed: null,
      ...(restored ? { draft: question } : {}),
      ...(before.length ? {} : { id: null }),
    });
    this.flushQueued();
    return restored ? 'restored' : 'kept';
  }
  /** Holds a question until the reader answers the consent sheet. */
  hold(question: string, carry: Followup | undefined, fromDraft: boolean) {
    this.update({
      pending: { question, ...(carry ? { carry } : {}), fromDraft },
    });
  }
  /** Not now: nothing is sent; a starter's question waits in an empty composer. */
  release() {
    const held = this.state.pending;
    if (!held) return;
    this.update({
      pending: null,
      ...(!held.fromDraft && !this.state.draft.trim()
        ? { draft: held.question }
        : {}),
    });
  }
  takePending() {
    const held = this.state.pending;
    if (held) this.update({ pending: null });
    return held;
  }
  /**
   * The composer's Send. A fresh draft starts a new conversation with the
   * arrival's options; the open one is already saved.
   */
  async sendDraft() {
    const q = this.state.draft.trim();
    if (!q || this.state.busy) return;
    // The failed question sent again from the composer keeps what it quoted,
    // as Try again does. A fresh draft is a new conversation and quotes nothing.
    const failed = this.state.failed;
    const carry =
      !this.state.fresh && failed?.question.trim() === q
        ? failed.carry
        : undefined;
    if (this.state.fresh) this.start(this.state.freshOptions ?? undefined);
    this.update({ draft: '', fresh: false, freshOptions: null, queued: false });
    await this.submit(q, carry);
  }
  /** Try again: resends the failed question, clearing it from the composer. */
  async retry() {
    const failed = this.state.failed;
    if (!failed || this.state.busy) return;
    if (this.state.draft.trim() === failed.question.trim())
      this.update({ draft: '' });
    await this.submit(failed.question, failed.carry);
  }
  async persist() {
    const s = this.state;
    if (!s.id || !s.thread.some((m) => m.role === 'answer')) return;
    const store = this.io.read(),
      old = store.chats.find((c) => c.id === s.id),
      t = Math.floor(this.io.now() / 1000);
    const c = {
      id: s.id,
      title: titleFor(s.thread),
      kind: s.options.kind,
      speaker: s.options.speaker,
      created: old?.created || t,
      updated: t,
      thread: s.thread,
      options: s.options,
    };
    try {
      await this.io.save({
        ...store,
        active: c.id,
        chats: [c, ...store.chats.filter((x) => x.id !== c.id)],
      });
    } catch {
      this.update({
        notice: phoneCopy(
          'This conversation couldn’t be saved on this iPhone.',
        ),
      });
    }
  }
  async submit(raw: string, carry?: Followup) {
    const q = raw.trim();
    if (!q || this.state.busy) return;
    this.nextAbort?.abort();
    this.nextAbort = null;
    const mine = ++this.sequence,
      abort = new AbortController();
    this.abort = abort;
    const before = this.state.thread.slice(),
      o = { ...this.state.options };
    const run: Running = {
      before,
      question: q,
      started: this.io.now(),
      section: this.io.section?.() ?? 'ask',
      followUp: before.length > 0,
    };
    this.running = run;
    this.measure('opax_ask_started', run);
    const user: Turn = { role: 'user', text: q, options: o, at: run.started };
    this.update({
      id: this.state.id || this.io.id(),
      thread: [...before, user],
      busy: true,
      stage: 'Reading your question',
      streaming: '',
      reading: 0,
      error: null,
      failed: null,
      notice: null,
      clarify: null,
      nextLoading: false,
      firstText: null,
    });
    try {
      const data = decodeAnswer(
        await this.io.post(
          '/api/ask?stream=1',
          requestBody(q, o, before, carry),
          abort.signal,
          {
            stage: (stage) => {
              if (mine === this.sequence) this.update({ stage });
            },
            step: (step) => {
              if (mine === this.sequence)
                this.update({ steps: runningSteps(this.state.steps, step) });
            },
            delta: (text) => {
              if (mine === this.sequence)
                this.update({
                  streaming: this.state.streaming + text,
                  ...(this.state.stage !== 'Writing the answer' ||
                  this.state.steps.length
                    ? { stage: 'Writing the answer' as const }
                    : {}),
                  // A recovery's rewrite keeps the first arrival.
                  ...(!this.state.firstText && text.trim()
                    ? { firstText: arrival(run, this.io.now()) }
                    : {}),
                });
            },
            retry: () => {
              if (mine === this.sequence)
                this.update({ streaming: '', steps: [], reading: 0 });
            },
            reading: (reading) => {
              if (mine === this.sequence) this.update({ reading });
            },
          },
        ),
      );
      if (mine !== this.sequence) return;
      this.running = null;
      this.measure('opax_ask_completed', run, {
        source_count:
          data.answer_status === 'needs_question' ? 0 : data.sources.length,
        has_answer:
          data.answer_status !== 'needs_question' && !isNoAnswer(data),
        ...(data.answer_status !== 'needs_question' && isNoAnswer(data)
          ? { reason: 'no_answer' }
          : {}),
      });
      if (data.answer_status === 'needs_question') {
        // Nothing was searched or written: the conversation stays as it was,
        // so the next question is not read against this one.
        const suggestion = data.suggested_question?.trim();
        this.update({
          thread: before,
          busy: false,
          stage: null,
          streaming: '',
          clarify: { question: q, ...(suggestion ? { suggestion } : {}) },
          ...(before.length ? {} : { id: null }),
          // The clarify request stays on screen; the waiting question stays
          // in the composer for the reader to send.
          queued: false,
        });
        return;
      }
      if (data.asked_as?.trim() && data.asked_as.trim() !== q)
        user.askedAs = data.asked_as.trim();
      if (data.money_ranking && data.money_question)
        user.fundingQuestion = data.money_question;
      const answer: Turn = {
        role: 'answer',
        text: data.answer,
        sources: data.sources,
        result: data,
        options: o,
        at: this.io.now(),
        ...(carry?.evidence ? { carried: { source: carry.source || '' } } : {}),
      };
      const passages = followupPassages(data);
      this.update({
        thread: [...before, user, answer],
        busy: false,
        // An answer that streamed nothing arrives whole.
        ...(!this.state.firstText &&
        answer.at !== undefined &&
        answer.text.trim()
          ? { firstText: arrival(run, answer.at) }
          : {}),
        stage: null,
        streaming: '',
        nextLoading: passages.length > 0,
        error: null,
      });
      await this.persist();
      if (mine !== this.sequence) return;
      if (this.state.queued && this.state.id) {
        // A tapped question waited for this answer: it goes now, and this
        // conversation's Ask next rows and account push finish in the
        // background against the saved copy.
        const id = this.state.id;
        const thread = this.state.thread;
        this.update({ nextLoading: false });
        this.flushQueued();
        await this.savedFollowups(id, thread, answer, data, q, passages);
        await this.io.sync?.(id).catch(() => undefined);
        return;
      }
      // Generated only once for this answer. Calculated answers have fixed steps.
      await this.followups(answer, data, q, mine, passages);
      // A failed account push shows only in Conversations, never here.
      if (mine === this.sequence && this.state.id)
        await this.io.sync?.(this.state.id).catch(() => undefined);
    } catch (e) {
      if (mine !== this.sequence) return;
      this.running = null;
      const failure =
        e instanceof AskFailure
          ? e
          : new AskFailure('invalid', 'The answer could not be read.');
      this.measure('opax_ask_failed', run, {
        cancelled: failure.code === 'cancelled',
        ...(failure.reason ? { reason: failure.reason } : {}),
      });
      // The failed question returns to the composer only when it is empty.
      const restore = !this.state.draft.trim();
      this.update({
        thread: before,
        busy: false,
        stage: null,
        nextLoading: false,
        error: failure,
        failed: { question: q, ...(carry ? { carry } : {}) },
        streaming: failure.code === 'cancelled' ? '' : this.state.streaming,
        ...(restore && failure.code !== 'cancelled' ? { draft: q } : {}),
        // A failure (rate limit, offline, timeout) stays on screen with its
        // countdown and Try again; a waiting question is not sent into it.
        // It stays in the composer, marked "Starts a new conversation".
        queued: false,
      });
    } finally {
      if (mine === this.sequence) this.abort = null;
    }
  }
  /**
   * Ask next for an answer a queued question waited for: generated once and
   * written to the saved copy, and shown only while that conversation is on
   * screen with no answer running.
   */
  private async savedFollowups(
    id: string,
    thread: Turn[],
    turn: Turn,
    data: Answer,
    q: string,
    passages: ReturnType<typeof followupPassages>,
  ) {
    if (turn.followupsRequested) return;
    turn.followupsRequested = true;
    if (!passages.length) return;
    try {
      const next = decodeFollowups(
        await this.io.post(
          '/api/followups',
          { question: q, answer: data.answer, passages },
          new AbortController().signal,
        ),
      );
      // When the waiting question did not start (the Person check refused it,
      // or the roster failed to load), this conversation is still on screen:
      // its rows show at once, and its newest turns are the ones saved.
      // If a newer question in it is still being answered, the rows are
      // dropped: they reach only the saved copy, and that answer's save then
      // writes the turns on screen, which have none. followups() drops rows
      // the same way when a newer question starts.
      const s = this.state;
      const shown = s.id === id && !s.busy && s.thread.includes(turn);
      const saved = withNext(shown ? s.thread : thread, turn, next);
      if (shown) this.update({ thread: saved });
      const store = this.io.read();
      if (!store.chats.some((c) => c.id === id)) return;
      await this.io.save({
        ...store,
        chats: store.chats.map((c) =>
          c.id === id ? { ...c, thread: saved } : c,
        ),
      });
    } catch {
      /* The saved conversation keeps its answer without Ask next. */
    }
  }
  private async followups(
    turn: Turn,
    data: Answer,
    q: string,
    mine: number,
    passages: ReturnType<typeof followupPassages>,
  ) {
    if (turn.followupsRequested) return;
    turn.followupsRequested = true;
    if (!passages.length) return;
    const abort = new AbortController();
    this.nextAbort = abort;
    this.update({ nextLoading: true });
    try {
      const next = decodeFollowups(
        await this.io.post(
          '/api/followups',
          { question: q, answer: data.answer, passages },
          abort.signal,
        ),
      );
      if (mine !== this.sequence) return;
      this.update({
        thread: withNext(this.state.thread, turn, next),
        nextLoading: false,
      });
      await this.persist();
    } catch {
      /* The composer stays available. Never retry generation. */
    } finally {
      if (this.nextAbort === abort) this.nextAbort = null;
      if (this.state.nextLoading && mine === this.sequence)
        this.update({ nextLoading: false });
    }
  }
}
