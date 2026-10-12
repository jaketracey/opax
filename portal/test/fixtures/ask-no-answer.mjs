// Synthetic public-record passages and model decisions; no service calls.
export const speaker = 'Melissa McIntosh';
export const question = `What has ${speaker} said in parliament?`;
export const id = 'fixture/t/body/0-200';
export const text = 'I called for scrutiny of housing proposals and asked the committee to examine the evidence.';
export const resource = {
  slug: 'speech-90000', title: 'Fixture housing debate',
  origin: {collaborators: [speaker], url: 'https://example.test/fixture-record'},
  extra: {metadata: {date: '2026-10-01'}},
  usermetadata: {classifications: [
    {labelset: 'kind', label: 'speech'}, {labelset: 'state', label: 'federal'},
    {labelset: 'chamber', label: 'house'}, {labelset: 'topic', label: 'housing'},
  ]},
  fields: {body: {paragraphs: {[id]: {text, score: 1, score_type: 'RERANKER'}}}},
  data: {texts: {body: {value: {body: text}}}},
};
export function modelReply(body, mode = 'declined') {
  if (mode === 'numeric') {
    return {answer: JSON.stringify(body.prompt?.system?.includes('points-and-citations schema')
      ? {answered:true,points:[{text:'She stated the housing proposal cost $999999.',citations:[{id:'s1',quote:text}]}]}
      : {answered:false,answer:''}), retrieval_results:{resources:{fixture:resource}}};
  }
  const records = (body.extra_context || []).map(value => JSON.parse(value));
  const speech = records.findIndex(row => row.kind === 'speech');
  const context = speech >= 0 ? 'USER_CONTEXT_' + speech : id;
  const answer = mode === 'grounding_failed'
    ? 'She said "This quotation is fabricated and is absent from the supplied parliamentary records".[^1]\n\n[^1]: block-F1'
    : mode === 'uncited' ? 'An unsupported summary.'
    : 'She called for scrutiny of housing proposals.[^1]\n\n[^1]: block-F1';
  return {
    answer: JSON.stringify({answered: mode !== 'declined', answer: mode === 'declined' ? '' : answer}),
    citation_footnote_to_context: mode === 'uncited' ? {} : {'block-F1': context},
    retrieval_results: {resources: {fixture: resource}},
  };
}
export async function stubFetch(input, init, mode) {
  const url = new URL(input);
  if (!url.hostname.startsWith('offline.')) throw new Error('Fixture refused an external destination');
  const body = init?.body ? JSON.parse(init.body) : {};
  if (url.pathname.endsWith('/catalog')) return Response.json({
    fulltext: {total: 1, facets: {'/classification.labels/topic': {'/classification.labels/topic/housing': 1}}},
    resources: {fixture: resource},
  });
  if (url.pathname.endsWith('/find')) return Response.json({resources: {fixture: resource}, best_matches: [{resource: 'fixture'}]});
  if (url.pathname.endsWith('/slug/speech-90000')) return Response.json(resource);
  if (url.pathname.endsWith('/ask')) {
    const reply = body.generate_answer === false ? {retrieval_results: {resources: {fixture: resource}}}
      : modelReply(body, mode || String(body.generative_model || '').replace('fixture-', ''));
    if (init.headers?.['x-synchronous'] === 'true' || body.generate_answer === false) return Response.json(reply);
    return new Response([
      {type: 'answer', text: reply.answer.slice(0, 9)},
      {type: 'answer', text: reply.answer.slice(9)},
      {type: 'retrieval', results: reply.retrieval_results},
      {type: 'footnote_citations', footnote_to_context: reply.citation_footnote_to_context},
      {type: 'status', code: '0'},
    ].map(item => JSON.stringify({item})).join('\n') + '\n', {headers: {'content-type': 'application/x-ndjson'}});
  }
  throw new Error('Unexpected fixture route: ' + url.pathname);
}
