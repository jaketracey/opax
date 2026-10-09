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
  reading: string[];
  streaming: string;
  error: AskFailure | null;
  notice: string | null;
  // A follow-up with nothing to search on ("High", "ok"): the Worker asked
  // for a full question instead of answering. Never part of the thread.
  clarify: { question: string; suggestion?: string } | null;
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
  id: () => string;
  now: () => number;
};
export class AskController {
  private state: AskState = {
    id: null,
    thread: [],
    options: { ...defaultOptions },
    busy: false,
    stage: null,
    reading: [],
    streaming: '',
    error: null,
    notice: null,
    clarify: null,
  };
  private listeners = new Set<() => void>();
  private abort: AbortController | null = null;
  private sequence = 0;
  constructor(private io: AskIO) {}
  snapshot = () => this.state;
  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
  };
  private update(p: Partial<AskState>) {
    this.state = { ...this.state, ...p };
    for (const f of this.listeners) f();
  }
  options(o: AskOptions) {
    if (!this.state.busy) this.update({ options: o });
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
        streaming: '',
        stage: null,
        clarify: null,
      });
  }
  start(options: AskOptions = { ...defaultOptions }) {
    this.cancel();
    this.sequence++;
    this.update({
      id: null,
      thread: [],
      options,
      busy: false,
      error: null,
      streaming: '',
      stage: null,
      reading: [],
      notice: null,
      clarify: null,
    });
  }
  cancel() {
    this.abort?.abort();
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
          'This conversation could not be saved on this iPhone.',
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
    const user: Turn = { role: 'user', text: q, options: o };
    this.update({
      id: this.state.id || this.io.id(),
      thread: [...before, user],
      busy: true,
      stage: 'Reading your question',
      streaming: '',
      reading: [],
      error: null,
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
        ...(carry?.evidence ? { carried: { source: carry.source || '' } } : {}),
      };
      this.update({
        thread: [...before, user, answer],
        busy: false,
        stage: null,
        streaming: '',
        error: !data.answer
          ? new AskFailure(
              'empty',
              'The record was searched and the sources below were retrieved, but no written answer came back this time.',
            )
          : null,
      });
      await this.persist();
      if (mine !== this.sequence) return;
      // Generated only once for this answer. Calculated answers have fixed steps.
      await this.followups(answer, data, q, mine);
      if (mine === this.sequence && this.state.id)
        await this.io.sync?.(this.state.id).catch(() =>
          this.update({
            notice: phoneCopy(
              'Saved on this iPhone. Account sync could not complete.',
            ),
          }),
        );
    } catch (e) {
      if (mine !== this.sequence) return;
      const failure =
        e instanceof AskFailure
          ? e
          : new AskFailure('invalid', 'The answer could not be read.');
      this.update({
        thread: before,
        busy: false,
        stage: null,
        error: failure,
        streaming: failure.code === 'cancelled' ? '' : this.state.streaming,
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
      this.update({ thread: this.state.thread.slice() });
      await this.persist();
    } catch {
      /* The free follow-up field stays available. Never retry generation. */
    }
  }
}
