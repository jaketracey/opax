import { phoneCopy } from '../../design/phone-copy';
import {
  decodeAnswer,
  decodeFollowups,
  defaultOptions,
  requestBody,
  sourcePassage,
  titleFor,
  type Answer,
  type AskOptions,
  type ChatStore,
  type Followup,
  type Turn,
} from './model';
import { AskFailure, type AskStage, type StreamHandlers } from './stream';
export type AskState = {
  id: string | null;
  thread: Turn[];
  options: AskOptions;
  busy: boolean;
  stage: AskStage | null;
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
  /** A question held for consent (A1): sent on Continue, kept on Not now. */
  pending: { question: string; carry?: Followup; fromDraft: boolean } | null;
  /** The newest answer's Ask next request is running (two reserved rows). */
  nextLoading: boolean;
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
/** What Stop did with the stopped question (journeys/ask.md 4.4 step 4). */
export type StopResult = 'restored' | 'kept' | null;
export class AskController {
  private state: AskState = {
    id: null,
    thread: [],
    options: { ...defaultOptions },
    busy: false,
    stage: null,
    reading: 0,
    streaming: '',
    error: null,
    failed: null,
    notice: null,
    clarify: null,
    draft: '',
    fresh: false,
    freshOptions: null,
    pending: null,
    nextLoading: false,
  };
  private listeners = new Set<() => void>();
  private abort: AbortController | null = null;
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
    this.state = { ...this.state, ...p };
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
    // Emptying the composer turns a fresh draft back into a follow-up box.
    if (!text.trim() && this.state.fresh)
      this.update({ draft: text, fresh: false, freshOptions: null });
    else this.update({ draft: text });
  }
  /** Clears an arrival's options line (its ⓧ): back to the conversation's own. */
  clearFresh() {
    this.update({ fresh: false, freshOptions: null });
  }
  open(id: string) {
    if (this.state.busy) return;
    const c = this.io.read().chats.find((c) => c.id === id);
    if (c)
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
      });
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
   * An "Ask about …" arrival from outside the Ask tab: always a new
   * conversation, never a cancelled answer, nothing sent.
   */
  arrive(question: string, options: AskOptions) {
    if (this.state.busy)
      this.update({ draft: question, fresh: true, freshOptions: options });
    else {
      this.start(options);
      this.update({ draft: question, pending: null });
    }
  }
  cancel() {
    this.abort?.abort();
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
    if (this.state.fresh) this.start(this.state.freshOptions ?? undefined);
    this.update({ draft: '', fresh: false, freshOptions: null });
    await this.submit(q);
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
          "This conversation couldn't be saved on this iPhone.",
        ),
      });
    }
  }
  async submit(raw: string, carry?: Followup) {
    const q = raw.trim();
    if (!q || this.state.busy) return;
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
    const user: Turn = { role: 'user', text: q, options: o };
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
    });
    try {
      const data = decodeAnswer(
        await this.io.post(
          '/api/ask?stream=1',
          requestBody(q, o, before, carry),
          abort.signal,
          {
            stage: (stage) => {
              if (mine === this.sequence && stage !== this.state.stage)
                this.update({ stage });
            },
            delta: (text) => {
              if (mine === this.sequence)
                this.update({ streaming: this.state.streaming + text });
            },
            retry: () => {
              if (mine === this.sequence) this.update({ streaming: '' });
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
          data.answer_status !== 'needs_question' && !!data.answer.trim(),
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
      this.update({
        thread: [...before, user, answer],
        busy: false,
        stage: null,
        streaming: '',
        error: !data.answer
          ? new AskFailure('empty', 'No answer was written this time.')
          : null,
      });
      await this.persist();
      if (mine !== this.sequence) return;
      // Generated only once for this answer. Calculated answers have fixed steps.
      await this.followups(answer, data, q, mine);
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
      });
      // The failed question returns to the composer only when it is empty.
      const restore = !this.state.draft.trim();
      this.update({
        thread: before,
        busy: false,
        stage: null,
        error: failure,
        failed: { question: q, ...(carry ? { carry } : {}) },
        streaming: failure.code === 'cancelled' ? '' : this.state.streaming,
        ...(restore && failure.code !== 'cancelled' ? { draft: q } : {}),
      });
    } finally {
      if (mine === this.sequence) this.abort = null;
    }
  }
  private async followups(turn: Turn, data: Answer, q: string, mine: number) {
    if (turn.followupsRequested) return;
    turn.followupsRequested = true;
    if (
      data.money_ranking ||
      data.pay_answer ||
      !data.answer ||
      ['needs_scope', 'needs_period'].includes(data.answer_status || '')
    )
      return;
    const passages = data.sources
      .map((s) => ({
        title: s.title || s.slug,
        text: sourcePassage(s.snippet, false),
      }))
      .filter((p) => p.text)
      .slice(0, 8);
    if (!passages.length) return;
    this.update({ nextLoading: true });
    try {
      const next = decodeFollowups(
        await this.io.post(
          '/api/followups',
          { question: q, answer: data.answer, passages },
          new AbortController().signal,
        ),
      );
      if (mine !== this.sequence) return;
      turn.next = next;
      this.update({ thread: this.state.thread.slice(), nextLoading: false });
      await this.persist();
    } catch {
      /* The composer stays available. Never retry generation. */
    } finally {
      if (this.state.nextLoading && mine === this.sequence)
        this.update({ nextLoading: false });
    }
  }
}
