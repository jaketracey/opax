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
export type Followup = { question: string; evidence?: string; source?: string };
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
};
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
  const out: Answer = { answer: v.answer.trim(), citations, sources };
  for (const k of [
    'asked_as',
    'answer_status',
    'money_context',
    'money_overview',
    'money_question',
    'suggested_question',
  ] as const)
    if (typeof v[k] === 'string') out[k] = v[k];
  for (const k of ['money_ranking', 'pay_answer'] as const)
    if (typeof v[k] === 'boolean') out[k] = v[k];
  if (Array.isArray(v.evidence_excerpts))
    out.evidence_excerpts = v.evidence_excerpts.flatMap((x) => {
      const e = object(x);
      return typeof e.resource === 'string' && typeof e.text === 'string'
        ? [{ resource: e.resource, text: e.text }]
        : [];
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
                },
              ]
            : [];
        })
        .slice(0, 3)
    : [];
}
export function normaliseOptions(o: AskOptions): AskOptions {
  let { from, to } = o;
  if (from && to && Number(from) > Number(to)) [from, to] = [to, from];
  if (from === '1993' && to === '2026') {
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
    const sources = m.sources || [];
    for (const s of [
      ...sources.filter((s) => s.cited),
      ...sources.filter((s) => !s.cited),
    ])
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
export const sampleQuestions = [
  'What has parliament said about housing affordability?',
  'Who funds the Labor Party?',
  'Who takes the most money from the gambling lobby?',
  'What has David Pocock proposed about housing affordability?',
];
export const parties = [
  'Labor',
  'Liberal',
  'Nationals',
  'LNP',
  'Greens',
  'Independent',
  'One Nation',
];
export const parliaments: Record<string, string> = {
  federal: 'Federal',
  nsw: 'NSW',
  vic: 'VIC',
  sa: 'SA',
  qld: 'QLD',
  act: 'ACT',
};
export function chips(o: AskOptions) {
  const out: { id: keyof AskOptions | 'years'; key: string; value: string }[] =
    [];
  for (const [id, key] of [
    ['speaker', 'Speaker'],
    ['party', 'Party'],
    ['state', 'Parliament'],
    ['topic', 'Topic'],
  ] as const)
    if (o[id])
      out.push({
        id,
        key,
        value: id === 'state' ? parliaments[o[id]] || o[id] : o[id],
      });
  if (o.from || o.to)
    out.push({
      id: 'years',
      key: 'Years',
      value:
        o.from === o.to ? o.from : `${o.from || '1993'} to ${o.to || '2026'}`,
    });
  if (o.kind === 'speech')
    out.push({ id: 'kind', key: 'Record type', value: 'Speeches' });
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
              money_ranking: result.money_ranking,
              money_context: result.money_context,
              money_overview: result.money_overview,
              pay_answer: result.pay_answer,
              pay_next: result.pay_next,
              evidence_excerpts: result.evidence_excerpts,
            }
          : {}),
      };
    }),
  };
}
