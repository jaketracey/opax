// Shared excerpt policy. Original KB documents and retrieval stay unchanged.
export const SA_EXCERPT_WORDS = 120;
export const SA_EXCERPT_LABEL = "Excerpt. The full record is on the Parliament of South Australia's site.";
export const saFullText = flag => flag === 'true';
const OMITTED = /["“‘']?(?:Excerpt omitted;\s*see the official record\.|\[SA Hansard excerpt omitted;\s*see the official record\])["”’']?/gi;
/** A display-policy placeholder is never primary evidence. */
export const withoutSaPlaceholder = value => String(value || '').replace(OMITTED, '');
const containsOmission = value => typeof value === 'string' ? withoutSaPlaceholder(value) !== value : !!value && typeof value === 'object' && Object.values(value).some(containsOmission);
const obj = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const words = text => String(text || '').match(/\S+/gu) || [];
const endExcerpt = text => text.trimEnd().replace(/(?:\.{1,}|…+)$/u, '') + '…';

export function isSaHansard(record) {
  const labels = { ...obj(record?.labels), ...Object.fromEntries((record?.usermetadata?.classifications || []).map(c => [c.labelset, c.label])) };
  const meta = { ...obj(record?.extra?.metadata), ...obj(record?.metadata) };
  const kind = record?.kind || labels.kind;
  if (kind && !['speech', 'hansard'].includes(kind)) return false;
  const source = String(record?.source || labels.source || meta.source || '').toLowerCase();
  return /^(sa_hansard|sa parliament|south australian? parliament|parliament of south australia)$/.test(source) ||
    (['speech', 'hansard'].includes(kind) || /^speech-\d+$/.test(record?.slug || '')) &&
    [record?.state, record?.jurisdiction, labels.state, labels.jurisdiction, meta.state, meta.jurisdiction].some(v => /^(sa|south australia)$/i.test(String(v))) ||
    /^(sa_ha|sa_lc)$/.test(String(record?.chamber || labels.chamber || meta.chamber || ''));
}

export function saOfficialUrl(record) {
  const meta = { ...obj(record?.extra?.metadata), ...obj(record?.metadata) };
  for (const raw of [record?.source_url, meta.source_url, record?.origin?.url, record?.url]) {
    try {
      const url = new URL(raw);
      if (['https:', 'http:'].includes(url.protocol) && (url.hostname === 'parliament.sa.gov.au' || url.hostname.endsWith('.parliament.sa.gov.au'))) return url.href;
    } catch { /* Only the existing official record is eligible. */ }
  }
  return null;
}

/** Sentence window around a match; a single overlong sentence is word-capped. */
export function saExcerpt(value, match = '', cap = SA_EXCERPT_WORDS) {
  const text = withoutSaPlaceholder(value).replace(/\s+/gu, ' ').trim();
  if (!text || cap <= 0) return '';
  if (words(text).length <= cap) return text;
  const sentences = [...new Intl.Segmenter('en-AU', {granularity:'sentence'}).segment(text)];
  let at = 0;
  if (match) {
    const terms = String(match).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
    const phrase = text.toLowerCase().indexOf(String(match).toLowerCase());
    at = phrase >= 0 ? phrase : Math.max(0, ...terms.map(t => text.toLowerCase().indexOf(t)).filter(i => i >= 0).slice(0, 1));
  }
  let centre = sentences.findIndex(s => s.index + s.segment.length > at);
  if (centre < 0) centre = 0;
  const sentence = sentences[centre];
  if (words(sentence.segment).length > cap) {
    const tokens = [...sentence.segment.matchAll(/\S+/gu)];
    const hit = Math.max(0, tokens.findIndex(t => sentence.index + t.index + t[0].length > at));
    const start = Math.max(0, Math.min(tokens.length - cap, hit - Math.floor(cap / 2)));
    return (sentence.index || start ? '…' : '') + endExcerpt(tokens.slice(start, start + cap).map(t => t[0]).join(' '));
  }
  let left = centre, right = centre, count = words(sentence.segment).length;
  // Balance context when matched; opening excerpts grow forwards only.
  while (true) {
    const next = match && left > 0 && (centre - left <= right - centre || right === sentences.length - 1) ? left - 1 : right + 1;
    if (next < 0 || next >= sentences.length || count + words(sentences[next].segment).length > cap) break;
    count += words(sentences[next].segment).length;
    if (next < left) left = next; else right = next;
  }
  const excerpt = sentences.slice(left, right + 1).map(s => s.segment).join('').trim();
  return (left ? '…' : '') + (right < sentences.length - 1 ? endExcerpt(excerpt) : excerpt);
}

const sourceKeys = new Set(['text', 'text_clean', 'body', 'snippet', 'passage', 'quote', 'quotes', 'evidence']);

/** One canonical passage per record prevents parallel fields extending the cap. */
export function saDisplayRecord(record, flag, match = '', preferredText) {
  const cleaned = Object.fromEntries(Object.entries(record).filter(([key, value]) => sourceKeys.has(key) && typeof value === 'string' && withoutSaPlaceholder(value) !== value).map(([key, value]) => [key, withoutSaPlaceholder(value)]));
  if (Object.keys(cleaned).length) record = {...record, ...cleaned};
  if (saFullText(flag) || !isSaHansard(record)) return record;
  const url = saOfficialUrl(record);
  const raw = preferredText ?? (record.text || record.snippet || record.passage || record.quote || (Array.isArray(record.evidence) ? record.evidence.join(' ') : '') || '');
  // No official URL means no source quotation until provenance can be resolved.
  const excerpt = url ? saExcerpt(raw, match) : '';
  const clean = value => {
    if (Array.isArray(value)) return value.map(clean);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key,
      sourceKeys.has(key) ? Array.isArray(val) ? (excerpt ? [excerpt] : []) : excerpt : clean(val)]));
  };
  return { ...clean(record), excerpt:true, excerpt_label:SA_EXCERPT_LABEL, excerpt_word_limit:SA_EXCERPT_WORDS,
    source_url:url, url, full_text_available:false };
}

/** Restrict copied answer passages and remap Unicode citation offsets. */
function displayAnswer(payload, sources, originals, budgets, fullText = false) {
  const restricted = fullText ? [] : sources.filter(isSaHansard);
  const key = typeof payload.answer === 'string' ? 'answer' : 'text';
  if (typeof payload[key] !== 'string') return payload;
  const original = payload[key], edits = [], selected = new Map();
  for (const match of original.matchAll(new RegExp(OMITTED.source, 'gi'))) edits.push({start:match.index,end:match.index+match[0].length,text:''});
  if (!restricted.length && !edits.length) return payload;
  const add = (start, end, source, quoted = false, outer = null) => {
    const span = outer || {start, end};
    if (edits.some(e => e.start < span.end && e.end > span.start)) return;
    const id = source.resource || source.id || source.slug;
    const remaining = SA_EXCERPT_WORDS - (budgets.get(id) || 0);
    const body = original.slice(start, end);
    const text = saOfficialUrl(source) ? saExcerpt(body, '', remaining) : '';
    budgets.set(id, (budgets.get(id) || 0) + words(text.replace(/…/g, '')).length);
    if (text) selected.set(id, [...(selected.get(id) || []), text]);
    // Omitted quotations disappear as a whole, including their quote marks.
    if (!text && outer) { start = outer.start; end = outer.end; }
    else if (!text && /["“‘']/.test(original[start-1] || '') && /["”’']/.test(original[end] || '')) { start--; end++; }
    edits.push({start, end, text});
  };
  // Evidence-only answers can reproduce a passage without quotation marks.
  for (const source of restricted) {
    // Catch verbatim prose without quotation marks against the full original.
    const id = source.resource || source.id || source.slug;
    const full = originals.get(id);
    if (full) {
      const tokenize = text => [...text.matchAll(/[\p{L}\p{N}]+/gu)];
      const sourceWords = tokenize(full).map(m => m[0].toLowerCase());
      const ngrams = new Set(sourceWords.slice(0,-7).map((_,i) => sourceWords.slice(i,i+8).join(' ')));
      const tokens = tokenize(original), matched = new Set();
      for(let i=0; i+8<=tokens.length; i++) if(ngrams.has(tokens.slice(i,i+8).map(m=>m[0].toLowerCase()).join(' '))) for(let j=i;j<i+8;j++) matched.add(j);
      for(let i=0; i<tokens.length; i++) if(matched.has(i)) {
        const start=i; while(matched.has(i+1)) i++;
        add(tokens[start].index,tokens[i].index+tokens[i][0].length,source);
      }
    }
    if (!full) {
      for (const raw of [source.snippet, source.passage, source.text, ...(source.evidence || [])]) {
        if (typeof raw !== 'string' || !raw.trim()) continue;
        let at = original.indexOf(raw);
        while (at >= 0) { add(at, at + raw.length, source); at = original.indexOf(raw, at + raw.length); }
      }
    }
  }
  // Quotes may exceed the retrieved snippet. A cited SA answer must still cap them.
  const textOf = s => String(s.snippet || s.passage || '');
  const unrestricted = sources.filter(s => !isSaHansard(s));
  for (const m of original.matchAll(/“([^”]+)”|"([^"\n]+)"|^>\s*(.+(?:\n>\s*.+)*)/gm)) {
    if (!restricted.length) continue;
    const quote = m[1] || m[2] || m[3], head = quote.slice(0, 40);
    const saSource = restricted.find(s => textOf(s).includes(head));
    // A verbatim federal/state quote keeps its own source's permission.
    if (!saSource && unrestricted.some(s => textOf(s).includes(head))) continue;
    const source = saSource || restricted[0];
    const offset = m[0].indexOf(quote);
    add(m.index + offset, m.index + offset + quote.length, source, true, {start:m.index,end:m.index+m[0].length});
  }
  // If originals are unavailable, fail closed on a potentially copied long answer.
  if (restricted.some(s => !originals.has(s.resource || s.id || s.slug)) && words(original).length > SA_EXCERPT_WORDS) {
    for (const [id, texts] of selected) budgets.set(id, (budgets.get(id) || 0) - texts.reduce((sum,text) => sum + words(text.replace(/…/g, '')).length, 0));
    edits.length = 0; selected.clear(); add(0,original.length,restricted[0]);
  }
  edits.sort((a,b) => a.start - b.start);
  let answer = '', cursor = 0;
  for (const edit of edits) { answer += original.slice(cursor, edit.start) + edit.text; cursor = edit.end; }
  answer += original.slice(cursor);
  const offset = position => {
    let delta = 0;
    for (const e of edits) {
      const start = Array.from(original.slice(0,e.start)).length, end = Array.from(original.slice(0,e.end)).length;
      if (position < start) break;
      if (position <= end) return start + delta + Math.min(position - start, Array.from(e.text).length);
      delta += Array.from(e.text).length - (end - start);
    }
    return position + delta;
  };
  const ranges = spans => spans.filter(([start,end]) => !edits.some(e => !e.text &&
    start < Array.from(original.slice(0,e.end)).length && end > Array.from(original.slice(0,e.start)).length))
    .map(([start,end]) => [offset(start),offset(end)]).filter(([start,end]) => end > start);
  const citations = payload.citations ? Object.fromEntries(Object.entries(payload.citations).map(([id,spans]) => [id,ranges(spans)]).filter(([,spans]) => spans.length)) : null;
  return {...payload, [key]:answer,
    ...(citations ? {citations} : {}),
    ...(payload.sources ? {sources:sources.map(s => ({...s,
      ...(citations ? {cited:Object.keys(citations).some(id => id.split('/')[0] === (s.resource || s.id || s.slug))} : {}),
      ...(selected.has(s.resource || s.id || s.slug) ? {snippet:selected.get(s.resource || s.id || s.slug).join(' ')} : {}),
      ...(s.answer_ranges ? {answer_ranges:ranges(s.answer_ranges)} : {}), ...(s.answerRanges ? {answerRanges:ranges(s.answerRanges)} : {})}))} : {})};
}

export function saDisplayPayload(value, flag, match = '', originals = new Map(), excerpts = new Map(), budgets = new Map(), answers = true) {
  if (typeof value === 'string') return withoutSaPlaceholder(value);
  if (!value || typeof value !== 'object') return value;
  if (saFullText(flag) && !containsOmission(value)) return value;
  if (Array.isArray(value)) return value.map(v => saDisplayPayload(v, flag, match, originals, excerpts, budgets, answers));
  const sources = Array.isArray(value.sources) ? value.sources : [];
  const hasPlaceholder = withoutSaPlaceholder(String(value.answer || value.text || '')) !== String(value.answer || value.text || '');
  const answered = {...(answers || hasPlaceholder ? displayAnswer(value, sources, originals, budgets, saFullText(flag)) : value)};
  const displayedSources = answered.sources || sources;
  const displayRecord = record => {
    const id = record.slug || record.resource || record.id;
    const result = saDisplayRecord(record, flag, match, excerpts.get(id));
    if (id && isSaHansard(record) && !excerpts.has(id)) excerpts.set(id, result.text || result.snippet || result.passage || result.quote || result.evidence?.[0] || '');
    return result;
  };
  if (Array.isArray(answered.points)) answered.points = answered.points.map(point => {
    const selected = sources.filter(s => point.source_ids?.includes(s.id));
    const safe = {...(answers ? displayAnswer(point, selected, originals, budgets, saFullText(flag)) : point)};
    // Supporting quotes are another view of the same bounded source passage.
    if (safe.evidence) safe.evidence = Object.fromEntries(Object.entries(safe.evidence).map(([id,quotes]) => {
      const source = displayedSources.find(s => s.id === id);
      return [id, source && isSaHansard(source) ? [displayRecord(source).snippet || ''].filter(Boolean) : quotes];
    }));
    return safe;
  });
  const result = Object.fromEntries(Object.entries(answered).map(([key,val]) => [key,
    // These are record metadata, not independently publishable records.
    ['labels','metadata','origin','usermetadata','extra'].includes(key) ? val :
    key === 'evidence_excerpts' && Array.isArray(val) ? val.map(v => {
      const source = displayedSources.find(s => s.resource === v.resource);
      return source && isSaHansard(source) ? {...v, text:displayRecord(source).snippet || ''} : v;
    }) : saDisplayPayload(val, flag, match, originals, excerpts, budgets, answers)]));
  return displayRecord(result);
}

/** Streaming prose was bounded before generation; only source views change. */
export function saDisplayStreamPayload(value, flag, match = '') {
  return saDisplayPayload(value, flag, match, new Map(), new Map(), new Map(), false);
}
