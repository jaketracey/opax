// Retrieval hints from cited records. The Worker re-reads originals before citing them.
export function chatContext(thread, question = '') {
  const fields = ['resource', 'slug', 'kind', 'source', 'state', 'chamber', 'title', 'speaker', 'date', 'url', 'href', 'cited', 'remuneration'];
  const provenance = ['slug', 'kind', 'source', 'state', 'chamber'];
  const context = thread.slice(-12).map(m => ({
    author: m.role === 'answer' ? 'answer' : 'user',
    text: String(m.role === 'user' ? m.fundingQuestion || m.askedAs || m.text : m.text).slice(0, 1500),
    ...(m.role === 'answer' ? {sources: (m.sources || []).slice(0, 30).map((s, i) => ({
      ...Object.fromEntries((s.cited && i < 6 ? fields : provenance).filter(k => s[k] !== undefined).map(k => [k, s[k]])),
      ...(s.cited && i < 6 && s.snippet ? {snippet: s.snippet.slice(0, 1200)} : {}),
    }))} : {}),
  }));
  const prior_resources = [...new Set(thread.filter(m => m.role === 'answer').slice(-2).reverse()
    .flatMap(m => (m.sources || []).filter(s => s.cited && /^[0-9a-f]{32}$/i.test(s.resource)).map(s => s.resource)))].slice(0, 6);
  // The Ask endpoint caps a request at 16 KB. Keep the most recent exchange
  // and its record identities, trimming older context and long excerpts first.
  const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
  const budget = Math.max(3000, 14000 - bytes(question));
  while (context.length > 2 && bytes(context) > budget) context.shift();
  if (bytes(context) > budget) for (const t of context) for (const s of t.sources || []) delete s.snippet;
  for (const t of context) for (let i = t.sources?.length - 1; i >= 0 && bytes(context) > budget; i--) {
    t.sources[i] = Object.fromEntries(provenance.filter(k => t.sources[i][k] !== undefined).map(k => [k, t.sources[i][k]]));
  }
  if (bytes(context) > budget) for (const t of context) t.text = t.text.slice(0, 400);
  return {context, prior_resources};
}
