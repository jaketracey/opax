import type { Roster, Slugs } from '../../api/catalog-decoders';
import { passageText, serverPassage } from '../../api/passage-text';
import { followupKinds, type FollowupKind } from '../../analytics/events';
// Contracts: portal/src/index.ts AskInput, askPayload, withAskedAs;
// portal/public/app.js sendChat, trimTurn, filterChipSpecs and home.js.
export type AskOptions = {
  kind: 'all' | 'speech';
  speaker: string;
  party: string;
  state: string;
  topic: string;
  from: string;
  to: string;
};
export const defaultOptions: AskOptions = {
  kind: 'all',
  speaker: '',
  party: '',
  state: '',
  topic: '',
  from: '',
  to: '',
};
export function decodeOptions(raw: unknown): AskOptions {
  const v = object(raw),
    out = { ...defaultOptions };
  for (const k of ['speaker', 'party', 'state', 'topic', 'from', 'to'] as const)
    if (typeof v[k] === 'string')
      out[k] = v[k].slice(0, k === 'speaker' ? 120 : 2000);
  out.kind = v.kind === 'speech' ? 'speech' : 'all';
  return out;
}
export type Range = [number, number];
/**
 * A source's passage as drawn. The Worker normalizes Ask snippets and marks
 * its own cuts, so they are drawn as sent. An answer saved before 9 Oct has
 * the old raw snippet, cut at 600 characters mid-word with no marker: that
 * one is still decoded and closed on a whole word. Applied where it is
 * drawn, never to the stored answer.
 */
export const sourcePassage = (snippet: string, paragraphs = true) =>
  snippet.length === 600 && !snippet.trimEnd().endsWith('…')
    ? passageText(snippet, { paragraphs, slicedAt: 600 })
    : serverPassage(snippet, { paragraphs });
export type Source = {
  resource: string;
  title: string;
  slug: string;
  href: string;
  snippet: string;
  cited: boolean;
  speaker?: string;
  party?: string;
  date?: string;
  state?: string;
  url?: string;
  source?: string;
  answerRanges: Range[];
};
/** `kind` is the server's coarse category for analytics, kept only from a fixed list. */
export type Followup = {
  question: string;
  evidence?: string;
  source?: string;
  kind?: FollowupKind;
};
export type Answer = {
  answer: string;
  sources: Source[];
  citations: Record<string, Range[]>;
  asked_as?: string;
  answer_status?: string;
  evidence_excerpts?: { resource: string; text: string }[];
  money_ranking?: boolean;
  money_context?: string;
  money_overview?: string;
  money_question?: string;
  pay_answer?: boolean;
  pay_next?: { label: string; href: string }[];
  suggested_question?: string;
  /** The actual scope used by the Worker, including inferred filters. */
  scope?: Partial<AskOptions>;
  /** Calculated answers: the date the data was current (ISO date or "2024-25"). */
  data_as_at?: string;
  /** The Worker's flag for model-written text in a calculated answer. */
  model_written?: boolean;
  /**
   * Figures in a calculated answer, each with its own as-at date and the
   * record it came from (journeys/ask.md 10.7). A figure without both is
   * never drawn as a block.
   */
  figures?: AnswerFigure[];
};
export type AnswerFigure = {
  value: string;
  label?: string;
  as_at?: string;
  source?: string;
  path?: string;
};
/** Status describes the answer's limits; only blank text means no answer. */
export function isNoAnswer(data: Pick<Answer, 'answer' | 'answer_status'>) {
  return !data.answer.trim();
}
export type Turn = {
  role: 'user' | 'answer';
  text: string;
  askedAs?: string;
  fundingQuestion?: string;
  sources?: Source[];
  next?: Followup[];
  options?: AskOptions;
  result?: Answer;
  carried?: { source: string };
  followupsRequested?: boolean;
  /** When this turn was sent (user) or arrived (answer), in device-clock epoch ms. Older turns have none. */
  at?: number;
};
export type Chat = {
  id: string;
  title: string;
  kind: 'all' | 'speech';
  speaker: string;
  created: number;
  updated: number;
  thread: Turn[];
  options?: AskOptions;
};
export type ChatStore = { v: 1; active: string | null; chats: Chat[] };
const object = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const str = (v: unknown) => (typeof v === 'string' ? v : '');
export function decodeRanges(v: unknown): Range[] {
  return Array.isArray(v)
    ? v.filter(
        (r): r is Range =>
          Array.isArray(r) &&
          r.length === 2 &&
          r.every((n) => Number.isSafeInteger(n) && n >= 0) &&
          r[1] > r[0],
      )
    : [];
}
export function decodeAnswer(raw: unknown): Answer {
  const v = object(raw);
  if (typeof v.answer !== 'string' || !Array.isArray(v.sources))
    throw new Error('The answer could not be read.');
  const citations = Object.fromEntries(
    Object.entries(object(v.citations)).map(([k, r]) => [k, decodeRanges(r)]),
  );
  const sources: Source[] = v.sources.flatMap((rawSource) => {
    const s = object(rawSource);
    if (typeof s.resource !== 'string' || typeof s.title !== 'string')
      return [];
    const ranges = Object.entries(citations)
      .filter(([k]) => k.split('/')[0] === s.resource)
      .flatMap(([, r]) => r);
    const out: Source = {
      resource: s.resource,
      title: s.title,
      slug: str(s.slug),
      href: str(s.href) || (str(s.slug) ? `/doc/${str(s.slug)}` : str(s.url)),
      snippet: str(s.snippet),
      cited: typeof s.cited === 'boolean' ? s.cited : ranges.length > 0,
      answerRanges: ranges.length ? ranges : decodeRanges(s.answerRanges),
    };
    for (const k of [
      'speaker',
      'party',
      'date',
      'state',
      'url',
      'source',
    ] as const)
      if (typeof s[k] === 'string') out[k] = s[k];
    return [out];
  });
  // Citation ranges refer to the Worker's original Unicode code points.
  // Trimming leading whitespace moves every mark to the wrong sentence.
  const out: Answer = {
    answer: v.answer.trim() ? v.answer : '',
    citations,
    sources,
  };
  if (v.scope && typeof v.scope === 'object' && !Array.isArray(v.scope)) {
    const scope = object(v.scope);
    const decoded = decodeOptions(scope);
    out.scope = Object.fromEntries(
      Object.entries(decoded).filter(([key]) =>
        key === 'kind'
          ? ['all', 'speech'].includes(str(scope.kind))
          : typeof scope[key] === 'string',
      ),
    );
  }
  for (const k of [
    'asked_as',
    'answer_status',
    'money_context',
    'money_overview',
    'money_question',
    'suggested_question',
    'data_as_at',
  ] as const)
    if (typeof v[k] === 'string') out[k] = v[k];
  for (const k of ['money_ranking', 'pay_answer', 'model_written'] as const)
    if (typeof v[k] === 'boolean') out[k] = v[k];
  if (Array.isArray(v.evidence_excerpts))
    out.evidence_excerpts = v.evidence_excerpts.flatMap((x) => {
      const e = object(x);
      return typeof e.resource === 'string' && typeof e.text === 'string'
        ? [{ resource: e.resource, text: e.text }]
        : [];
    });
  if (Array.isArray(v.figures))
    out.figures = v.figures.flatMap((x) => {
      const e = object(x);
      if (typeof e.value !== 'string' || !e.value.trim()) return [];
      const figure: AnswerFigure = { value: e.value.trim() };
      for (const k of ['label', 'as_at', 'source', 'path'] as const)
        if (typeof e[k] === 'string' && (e[k] as string).trim())
          figure[k] = (e[k] as string).trim();
      return [figure];
    });
  if (Array.isArray(v.pay_next))
    out.pay_next = v.pay_next.flatMap((x) => {
      const e = object(x);
      return typeof e.label === 'string' && typeof e.href === 'string'
        ? [{ label: e.label, href: e.href }]
        : [];
    });
  return out;
}
export function decodeFollowups(raw: unknown): Followup[] {
  const questions = object(raw).questions;
  return Array.isArray(questions)
    ? questions
        .flatMap((x) => {
          const v = typeof x === 'string' ? { question: x } : object(x);
          return typeof v.question === 'string' && v.question.trim()
            ? [
                {
                  question: v.question.trim(),
                  ...(typeof v.evidence === 'string'
                    ? { evidence: v.evidence }
                    : {}),
                  ...(typeof v.source === 'string' ? { source: v.source } : {}),
                  ...(followupKinds.includes(v.kind as FollowupKind)
                    ? { kind: v.kind as FollowupKind }
                    : {}),
                },
              ]
            : [];
        })
        .slice(0, 3)
    : [];
}
/** The Sydney calendar year: the same for every reader, never a literal. */
export function currentYear(now: number = Date.now()): number {
  return Number(
    new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Sydney',
      year: 'numeric',
    }).format(new Date(now)),
  );
}
export const firstYear = 1993;
export function normaliseOptions(o: AskOptions): AskOptions {
  let { from, to } = o;
  if (from && to && Number(from) > Number(to)) [from, to] = [to, from];
  if (from === String(firstYear) && to === String(currentYear())) {
    from = '';
    to = '';
  }
  return { ...o, from, to };
}
export function requestBody(
  question: string,
  options: AskOptions,
  thread: Turn[],
  carry?: Followup,
): {
  question: string;
  kind: 'all' | 'speech';
  speaker?: string;
  party?: string;
  state?: string;
  topic?: string;
  from?: string;
  to?: string;
  context?: { author: string; text: string }[];
  prior_resources?: string[];
} {
  const o = normaliseOptions(options);
  const context = thread
    .map((m) => ({
      author: m.role === 'answer' ? 'answer' : 'user',
      text:
        m.role === 'user' ? m.fundingQuestion || m.askedAs || m.text : m.text,
    }))
    .slice(-12);
  if (carry?.evidence)
    context.push({
      author: 'answer',
      text: `From the record${carry.source ? ` (${carry.source})` : ''}: "${carry.evidence}"`,
    });
  const prior: string[] = [];
  for (const m of thread
    .filter((m) => m.role === 'answer')
    .slice(-2)
    .reverse()) {
    // Cited records only (docs/STREAMING.md). An uncited record came back
    // because an earlier pin searched it, so re-pinning it would carry an old
    // subject into every later follow-up.
    for (const s of (m.sources || []).filter((s) => s.cited))
      if (/^[a-f0-9]{32}$/i.test(s.resource) && !prior.includes(s.resource))
        prior.push(s.resource);
  }
  return {
    question: question.trim(),
    kind: o.kind,
    ...Object.fromEntries(
      Object.entries(o).filter(([k, v]) => k !== 'kind' && v),
    ),
    ...(thread.length ? { context, prior_resources: prior.slice(0, 6) } : {}),
  };
}
export const parliaments: Record<string, string> = {
  federal: 'Federal',
  nsw: 'New South Wales',
  vic: 'Victoria',
  sa: 'South Australia',
  qld: 'Queensland',
  act: 'Australian Capital Territory',
};
/**
 * The options in force, one per tag: the value is drawn and the key is
 * spoken ("Person, Sam Placeholder"). "Person" names the member filter: it
 * holds senators too, and "Speaker" reads as the Speaker of the House.
 */
export function chips(o: AskOptions, topicLabel = (slug: string) => slug) {
  const out: { id: keyof AskOptions | 'years'; key: string; value: string }[] =
    [];
  for (const [id, key] of [
    ['speaker', 'Person'],
    ['party', 'Party'],
    ['state', 'Parliament'],
    ['topic', 'Topic'],
  ] as const)
    if (o[id])
      out.push({
        id,
        key,
        value:
          id === 'state'
            ? parliaments[o[id]] || o[id]
            : id === 'topic'
              ? topicLabel(o[id])
              : o[id],
      });
  if (o.from || o.to)
    out.push({
      id: 'years',
      key: 'Years',
      value:
        o.from === o.to
          ? o.from
          : `${o.from || firstYear} to ${o.to || currentYear()}`,
    });
  if (o.kind === 'speech')
    out.push({ id: 'kind', key: 'Type', value: 'Speeches' });
  return out;
}
export function clearChip(
  o: AskOptions,
  id: keyof AskOptions | 'years',
): AskOptions {
  return id === 'years'
    ? { ...o, from: '', to: '' }
    : { ...o, [id]: id === 'kind' ? 'all' : '' };
}
export function sourceGroups(sources: Source[]) {
  const cited = sources.filter((s) => s.cited);
  return {
    cited: cited.length ? cited : sources,
    also: cited.length ? sources.filter((s) => !s.cited) : [],
  };
}
export function dateRuler(sources: Source[]) {
  return sources
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.date || ''))
    .sort((a, b) => a.date!.localeCompare(b.date!));
}
/** One answer turn, addressed from a route (`/ask-report?turn=`, `/source`). */
export const turnKey = (chatId: string, index: number) => `${chatId}:${index}`;
export function parseTurnKey(
  key: string,
): { chat: string; index: number } | null {
  const match = /^([\w-]{8,64}):(\d{1,4})$/.exec(key);
  return match ? { chat: match[1]!, index: Number(match[2]) } : null;
}
export function titleFor(thread: Turn[]) {
  const first =
    thread
      .find((m) => m.role === 'user')
      ?.text.replace(/\s+/g, ' ')
      .trim() || 'Conversation';
  return first.length > 90 ? `${first.slice(0, 89).trimEnd()}…` : first;
}
export function trimTurn(m: Turn): Turn {
  if (m.role === 'user') return m;
  const sources = [
    ...(m.sources || []).filter((s) => s.cited),
    ...(m.sources || []).filter((s) => !s.cited),
  ]
    .slice(0, 30)
    .map(
      (s) =>
        Object.fromEntries(
          Object.entries(s).map(([k, v]) => [
            k,
            typeof v === 'string' &&
            v.length > 240 &&
            k !== 'href' &&
            k !== 'url'
              ? `${v.slice(0, 239)}…`
              : v,
          ]),
        ) as Source,
    );
  return {
    ...m,
    sources,
    ...(m.result ? { result: { ...m.result, sources } } : {}),
  };
}
export function decodeChat(raw: unknown): Chat | null {
  const c = object(raw);
  if (
    typeof c.id !== 'string' ||
    !/^[\w-]{8,64}$/.test(c.id) ||
    !Array.isArray(c.thread) ||
    !Number.isSafeInteger(c.updated) ||
    !Number.isSafeInteger(c.created)
  )
    return null;
  const thread: Turn[] = [];
  for (const rawTurn of c.thread) {
    const m = object(rawTurn);
    if (!['user', 'answer'].includes(str(m.role)) || typeof m.text !== 'string')
      return null;
    const turn: Turn = { role: m.role as Turn['role'], text: m.text };
    turn.options = decodeOptions(
      m.options ?? { ...object(c.options), kind: c.kind, speaker: c.speaker },
    );
    if (typeof object(m.carried).source === 'string')
      turn.carried = { source: object(m.carried).source as string };
    if (Number.isSafeInteger(m.at) && (m.at as number) > 0)
      turn.at = m.at as number;
    for (const k of ['askedAs', 'fundingQuestion'] as const)
      if (typeof m[k] === 'string') turn[k] = m[k];
    if (turn.role === 'answer') {
      try {
        turn.result = decodeAnswer(
          m.result ?? { ...m, answer: m.text, citations: {} },
        );
        turn.sources = turn.result.sources;
      } catch {
        turn.sources = [];
      }
      if (Array.isArray(m.next))
        turn.next = decodeFollowups({ questions: m.next });
      turn.followupsRequested = true; // Restoring never generates again.
    }
    thread.push(turn);
  }
  while (thread.at(-1)?.role === 'user') thread.pop();
  return {
    id: c.id,
    title: str(c.title) || titleFor(thread),
    kind: c.kind === 'speech' ? 'speech' : 'all',
    speaker: str(c.speaker),
    created: c.created as number,
    updated: c.updated as number,
    thread,
    options: decodeOptions({
      ...object(c.options),
      kind: c.kind === 'speech' ? 'speech' : 'all',
      speaker: str(c.speaker),
    }),
  };
}
export function decodeStore(raw: unknown): ChatStore | null {
  const s = object(raw);
  if (s.v !== 1 || !Array.isArray(s.chats)) return null;
  const chats = s.chats
    .map(decodeChat)
    .filter((c): c is Chat => !!c)
    .sort((a, b) => b.updated - a.updated)
    .slice(0, 20);
  return {
    v: 1,
    active: chats.some((c) => c.id === s.active) ? (s.active as string) : null,
    chats,
  };
}
export function boundedStore(store: ChatStore): ChatStore {
  const chats = store.chats
    .slice()
    .sort((a, b) => b.updated - a.updated)
    .slice(0, 20)
    .map((c) => ({ ...c, thread: c.thread.map(trimTurn) }));
  while (JSON.stringify(chats).length > 1500000 && chats.length > 1)
    chats.pop();
  return {
    v: 1,
    active: chats.some((c) => c.id === store.active) ? store.active : null,
    chats,
  };
}
export function decodeRemoteChat(raw: unknown): Chat | null {
  const c = object(object(raw).chat);
  const data = object(c.data);
  return decodeChat({
    ...data,
    id: c.id,
    title: c.title,
    kind: c.kind,
    created: c.created_at,
    updated: c.updated_at,
  });
}
export function decodeRemoteIndex(
  raw: unknown,
): { id: string; updated_at: number }[] {
  const rows = object(raw).chats;
  if (!Array.isArray(rows)) throw new Error('Conversations could not be read.');
  return rows.flatMap((x) => {
    const c = object(x);
    return typeof c.id === 'string' &&
      /^[\w-]{8,64}$/.test(c.id) &&
      Number.isSafeInteger(c.updated_at)
      ? [{ id: c.id, updated_at: c.updated_at as number }]
      : [];
  });
}
export function syncBody(c: Chat) {
  return {
    title: c.title,
    kind: c.kind,
    speaker: c.speaker || '',
    updated: c.updated,
    thread: c.thread.map((m) => {
      const { result, options, followupsRequested, ...rest } = trimTurn(m);
      return {
        ...rest,
        ...(result
          ? {
              answer_status: result.answer_status,
              scope: result.scope,
              suggested_question: result.suggested_question,
              money_ranking: result.money_ranking,
              money_context: result.money_context,
              money_overview: result.money_overview,
              pay_answer: result.pay_answer,
              pay_next: result.pay_next,
              evidence_excerpts: result.evidence_excerpts,
              data_as_at: result.data_as_at,
              model_written: result.model_written,
              figures: result.figures,
            }
          : {}),
      };
    }),
  };
}
const slugOf = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’‘ʼ`.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
/** Roster name → person slug, the only names "People in this answer" lists. */
export function rosterPeople(roster: Roster, slugs: Slugs) {
  const known = new Map<string, string>();
  for (const p of roster.people) {
    const slug =
      Object.entries(slugs.slugs).find(([, name]) => name === p.name)?.[0] ||
      slugOf(p.name);
    known.set(p.name, slug);
  }
  return known;
}
