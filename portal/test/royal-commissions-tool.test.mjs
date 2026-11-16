import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const built = await build({ stdin: { contents: "export {callTool, listTools, ToolInputError, TOOL_REGISTRY_VERSION} from './src/tools/index'; export {runTool, TOOL_SPECS} from './src/agentic-tools';", resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'node', format: 'esm' });
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const savedFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('Royal commissions tool tests must not make network requests'); };
test.after(() => { globalThis.fetch = savedFetch; });
const cache = new Map();
// Report records are built from data/report-summaries (gitignored output); the test builds the robodebt one the same way.
const { projectSummary } = await import(new URL('../../scripts/build_report_catalog.mjs', import.meta.url));
const reportRecord = { summary: projectSummary(JSON.parse(await readFile(new URL('../../data/report-summaries/royal-commission-cth-robodebt.json', import.meta.url), 'utf8'))) };
async function asset(path) {
  if (path.startsWith('/report-records/')) { if (path === '/report-records/royal-commission-cth-robodebt.json') return reportRecord; throw Error('Not built: ' + path); }
  assert.match(path, /^\/(royal-commissions\/[a-z0-9-]+|transcripts\/(index|term-pages|terms\/\d{2}|[a-z0-9-]+\/transcript-[a-z0-9-]+))\.json$/);
  if (!cache.has(path)) cache.set(path, JSON.parse(await readFile(new URL('../public' + path, import.meta.url), 'utf8')));
  return cache.get(path);
}
const env = { asset, origin: 'https://opax.test' };
const index = JSON.parse(await readFile(new URL('../public/royal-commissions/index.json', import.meta.url), 'utf8'));
const fv = index.commissions.find(c => c.id === 'vic-family-violence');
function cited(out, requireRows = true) {
  assert.equal(out.error, undefined, JSON.stringify(out));
  if (requireRows) assert.ok(out.rows.length, JSON.stringify(out).slice(0, 500));
  assert.ok(out.citations.length);
  for (const c of out.citations) { assert.match(c.url, /^https:\/\//); assert.ok(c.text.length > 10); }
  assert.ok(Buffer.byteLength(JSON.stringify(out)) <= 14000);
}
const call = args => api.callTool(env, 'royal_commissions', args);
async function invalid(args) {
  let n = 0;
  await assert.rejects(() => api.callTool({ asset: async () => { n++; throw Error('No reads for invalid input'); } }, 'royal_commissions', args), e => e instanceof api.ToolInputError && e.code === -32602);
  assert.equal(n, 0);
}

test('registry lists royal_commissions under the bumped version', () => {
  assert.ok(Number(/^structured-tools-(\d+)-/.exec(api.TOOL_REGISTRY_VERSION)?.[1]) >= 12, api.TOOL_REGISTRY_VERSION);
  assert.ok(api.listTools().some(t => t.name === 'integrity_reports'));
  const tool = api.listTools().find(t => t.name === 'royal_commissions');
  assert.ok(tool); assert.ok(tool.inputSchema.examples.length >= 3);
  assert.ok(api.TOOL_SPECS.some(t => (t.name ?? t.function?.name) === 'royal_commissions'));
});

test('export shape: commissions carry cited reports, and every recommendation a page citation', async () => {
  assert.ok(index.commissions.length >= 8);
  assert.ok(index.meta.counts.recommendations >= 227);
  assert.ok(fv && fv.counts.recommendations === 227 && fv.counts.with_status > 200);
  for (const row of index.commissions) {
    const c = (await asset(row.file)).commission;
    assert.equal(c.id, row.id);
    for (const d of [...c.reports, ...c.responses, ...c.transcripts]) { assert.match(d.cite.url, /^https:\/\//); assert.ok(d.acquisition); }
    for (const r of c.recommendations) { assert.match(r.cite.url, /^https:\/\/.+\.pdf$/i); assert.ok(r.cite.page >= 1); assert.ok(r.text.length >= 20); }
    if (c.established) { assert.match(c.established.date, /^\d{4}-\d{2}-\d{2}$/); assert.ok(c.established.quote); }
  }
});

test('list: commissions by jurisdiction with counts and citations', async () => {
  const out = await call({ view: 'list', jurisdiction: 'Vic', limit: 8 }); cited(out);
  assert.ok(out.rows.every(r => r.jurisdiction === 'Victoria'));
  assert.ok(out.rows.some(r => r.id === 'vic-family-violence'));
});

test('list citations read as the public record, not as OPAX stored it (a writer copied "57 recommendations loaded")', async () => {
  const out = await call({ view: 'list', commission: 'robodebt', limit: 3 }); cited(out);
  const line = out.citations.find(c => /Robodebt/.test(c.text))?.text ?? '';
  assert.match(line, /Its reports make \d+ recommendations/, line);
  assert.doesNotMatch(line, /\bloaded\b|\blisted\b|\b0 government response/, line);
  assert.match(line, /hearing transcripts are held \(evidence, not findings\)/, line);
});

test('robodebt: the report\'s own findings come with the profile and a one-commission list, cited to their pages', async () => {
  for (const args of [{ view: 'profile', commission: 'robodebt' }, { view: 'list', commission: 'robodebt' }]) {
    const out = await call(args); cited(out);
    const findings = out.citations.filter(c => /in the commission's own words/.test(c.text));
    assert.equal(findings.length, reportRecord.summary.quotes.items.length, args.view);
    const cabinet = findings.find(c => /approved by Cabinet/.test(c.text));
    assert.match(cabinet.text, /^Royal Commission into the Robodebt Scheme, Report of the Royal Commission into the Robodebt Scheme, page 31 \[finding\], in the commission's own words: "The Scheme was approved by Cabinet/);
    assert.match(cabinet.url, /^https:\/\/www\.royalcommission\.gov\.au\/.+\.PDF#page=31$/);
  }
  // A commission without a built report record, or a list of several, carries no findings line.
  const fv = await call({ view: 'profile', commission: 'family violence' }); cited(fv);
  assert.ok(!fv.citations.some(c => /in the commission's own words/.test(c.text)));
  const many = await call({ view: 'list', jurisdiction: 'Cth', limit: 8 }); cited(many);
  assert.ok(!many.citations.some(c => /in the commission's own words/.test(c.text)));
});

test('house jurisdiction codes ("vic", "federal") are accepted as the dataset codes', async () => {
  const vic = await call({ view: 'list', jurisdiction: 'vic', limit: 8 }); cited(vic);
  assert.ok(vic.rows.every(r => r.jurisdiction === 'Victoria'));
  const cth = await call({ view: 'list', jurisdiction: 'federal', limit: 8 }); cited(cth);
  assert.ok(cth.rows.length && cth.rows.every(r => r.jurisdiction === 'Commonwealth'), JSON.stringify(cth.rows.map(r => r.jurisdiction)));
});

test('profile: one commission\'s reports, commissioners and responses, cited to the official copies', async () => {
  const out = await call({ view: 'profile', commission: 'family violence' }); cited(out);
  const row = out.rows[0];
  assert.equal(row.id, 'vic-family-violence');
  assert.ok(row.reports.length >= 1 && row.reports[0].page_url.startsWith('https://www.parliament.vic.gov.au/'));
  assert.ok(row.commissioners.length >= 1);
  assert.equal(row.recommendations, 227);
});

test('recommendations: words search returns verbatim text, page and published status', async () => {
  const out = await call({ view: 'recommendations', commission: 'vic-family-violence', words: 'information sharing', limit: 3 }); cited(out);
  for (const r of out.rows) { assert.match(r.text, /information.sharing/i); assert.ok(r.page >= 1); assert.match(r.source_url, /\.pdf$/); }
  assert.ok(out.total >= 3);
  const one = await call(out.rows[0].follow_up); cited(one);
  assert.equal(one.rows.length, 1); assert.equal(one.rows[0].number, out.rows[0].number);
  if (one.rows[0].status) { assert.ok(one.rows[0].status.as_published); assert.match(one.rows[0].status.source_url, /^https:\/\/www\.vic\.gov\.au\//); }
});

test('recommendations: an unknown status is null, never inferred', async () => {
  for (const row of index.commissions.filter(c => c.counts.recommendations && !c.counts.with_status)) {
    const out = await call({ view: 'recommendations', commission: row.id, limit: 2 }); cited(out);
    assert.ok(out.rows.every(r => r.status === null));
  }
});

test('compound numbers, manual supplements and inquiry types', async () => {
  const out = await call({ view: 'recommendations', commission: 'cth-robodebt', number: '23.1' }); cited(out);
  assert.equal(out.rows.length, 1); assert.equal(out.rows[0].number, '23.1');
  assert.match(out.rows[0].source_url, /^https:\/\/www\.royalcommission\.gov\.au\//);
  const prof = await call({ view: 'profile', commission: 'cth-robodebt' }); cited(prof);
  assert.match(prof.rows[0].reports[0].acquisition, /manual publisher download supplied by the OPAX maintainer/);
  const types = new Set(index.commissions.map(c => c.inquiry_type));
  for (const t of ['royal_commission', 'commission_of_inquiry', 'board_of_inquiry']) assert.ok(types.has(t));
});

test('a sitting commission lists hearing transcripts as documents, with no recommendations or findings', async () => {
  const out = await call({ view: 'profile', commission: 'vic-major-infrastructure' }); cited(out);
  const row = out.rows[0];
  assert.equal(row.reports.length, 0); assert.equal(row.recommendations, 0);
  assert.equal(row.transcripts.count, 2); assert.equal(row.transcripts.label, 'Hearing transcript: evidence, not findings');
  assert.deepEqual(row.transcripts.follow_up, { view: 'transcripts', commission: 'vic-major-infrastructure' });
  const listed = await call({ view: 'transcripts', commission: 'vic-major-infrastructure' }); cited(listed);
  assert.equal(listed.rows.length, 2);
  for (const t of listed.rows) { assert.ok(t.hearing); assert.equal(t.recommendations, undefined); assert.equal(t.label, 'Hearing transcript: evidence, not findings'); }
  assert.ok(row.reference_pages.some(p => p.url === 'https://www.rcimcp.vic.gov.au/hearing-block-1-9-20-november-2026'));
  assert.match(row.notes.join(' '), /evidence given to the commission, not findings/);
  // The notes are OPAX's own words with a page reference: no extract from a transcript is held (documents only).
  assert.match(row.notes.join(' '), /may make non-publication orders \(transcript of 9 November 2026, page 30/);
  assert.match(row.notes.join(' '), /final report is due on or before 20 August 2027/);
  assert.ok(!/["\u201c\u201d]|(?<![A-Za-z0-9])['\u2018\u2019](?=\w)/.test(row.notes.join(' ')));
});

test('court rulings on a report travel with it, quoted from the official page', async () => {
  const out = await call({ view: 'profile', commission: 'act-criminal-justice' }); cited(out);
  const row = out.rows[0];
  assert.equal(row.inquiry_type, 'board of inquiry');
  const cc = row.reports[0].court_context;
  assert.equal(cc.length, 1); assert.match(cc[0].text, /Drumgold v Board of Inquiry & Ors \(No\. 3\)/);
  assert.equal(cc[0].source_url, 'https://www.act.gov.au/open/board-of-inquiry-into-the-criminal-justice-system');
  assert.ok(out.citations.some(c => /Court context/.test(c.text) && /Chapters 4, 5 and 6/.test(c.text)));
});

test('no match reports coverage instead of inventing a commission', async () => {
  const out = await call({ view: 'list', commission: 'zzzz nothing like this' }); cited(out, false);
  assert.equal(out.total, 0); assert.match(out.notes.join(' '), /not loaded|No royal commission/);
});

test('invalid input is rejected before any read', async () => {
  await invalid({ view: 'profile' });
  await invalid({ view: 'list', words: 'x y' });
  await invalid({ view: 'recommendations', number: '12' });
  await invalid({ view: 'nope' });
  await invalid({ view: 'recommendations', commission: 'family violence', number: 'twelve' });
  await invalid({ view: 'recommendations', commission: 'robodebt', number: '4.1.2' });
});

test('Ask and MCP run the same handler', async () => {
  const args = { view: 'recommendations', commission: 'vic-family-violence', number: '1' };
  const mcp = await call(args); cited(mcp);
  const ask = await api.runTool({ asset, kb: async () => { throw Error('no KB reads'); }, origin: 'https://opax.test', toolEnv: env }, 'royal_commissions', args);
  assert.equal(ask.ok, true, JSON.stringify(ask).slice(0, 400));
  assert.ok(ask.cite.length >= 2);
  assert.ok(JSON.stringify(ask.data).includes(mcp.rows[0].text.slice(0, 60)));
});

test('a commission with many transcripts keeps its profile within the payload limit and pages its transcripts', async () => {
  for (const id of ['cth-antisemitism', 'cth-robodebt', 'nsw-healthcare-funding']) {
    const out = await call({ view: 'profile', commission: id }); cited(out);
    assert.equal(out.truncated, undefined);
    assert.ok(out.rows[0].transcripts.count >= 47, id);
    assert.ok(out.rows[0].transcripts.newest.every(t => /^https:\/\//.test(t.pdf_url)));
  }
  const first = await call({ view: 'transcripts', commission: 'cth-robodebt', limit: 8 }); cited(first);
  assert.equal(first.total, 47); assert.equal(first.next_offset, 8);
  const dates = first.rows.map(r => r.date);
  assert.deepEqual(dates, [...dates].sort().reverse());
  const next = await call({ view: 'transcripts', commission: 'cth-robodebt', limit: 8, offset: 8 }); cited(next);
  assert.ok(next.rows.every(r => !first.rows.some(f => f.key === r.key)));
  for (const c of first.citations.slice(1)) assert.match(c.text, /Hearing transcript: evidence, not findings/);
  const march = await call({ view: 'transcripts', commission: 'cth-robodebt', words: '2023-03' }); cited(march);
  assert.ok(march.total >= 3 && march.rows.every(r => r.date.startsWith('2023-03')));
});

test('new inquiries load with their transcripts only, as listed documents', async () => {
  for (const id of ['nsw-healthcare-funding', 'qld-child-safety', 'tas-institutional-child-sexual-abuse', 'nt-hydraulic-fracturing']) {
    const c = (await asset(`/royal-commissions/commission-${id}.json`)).commission;
    assert.ok(c.transcripts.length >= 5, id); assert.equal(c.recommendations.length, 0);
    for (const t of c.transcripts) { assert.match(t.date, /^\d{4}-\d{2}-\d{2}$/); assert.equal(t.date_basis, 'stated'); assert.ok(t.date_quote); assert.ok(t.rights); assert.ok(!/\(PDF/.test(t.title), t.title); }
  }
});

test('transcripts view needs a commission and rejects recommendation filters', async () => {
  await invalid({ view: 'transcripts' });
  await invalid({ view: 'transcripts', commission: 'robodebt', number: '1' });
  await invalid({ view: 'transcripts', commission: 'robodebt', status: 'Implemented' });
});

test('transcript paging is stable at the edges: first page, last page and past the end', async () => {
  const all = [];
  for (let offset = 0; offset !== null;) {
    const out = await call({ view: 'transcripts', commission: 'nsw-healthcare-funding', limit: 8, offset }); cited(out);
    assert.equal(out.total, 71); all.push(...out.rows); offset = out.next_offset;
  }
  assert.equal(all.length, 71); assert.equal(new Set(all.map(r => r.key)).size, 71);
  const last = await call({ view: 'transcripts', commission: 'nsw-healthcare-funding', limit: 8, offset: 64 }); cited(last);
  assert.equal(last.rows.length, 7); assert.equal(last.next_offset, null);
  const past = await call({ view: 'transcripts', commission: 'nsw-healthcare-funding', offset: 500 });
  assert.equal(past.rows.length, 0); assert.equal(past.total, 71); assert.equal(past.next_offset, null);
  for (const r of all) { assert.ok(r.date && r.pages >= 1 && /^https:\/\//.test(r.pdf_url) && typeof r.publisher_redacted === 'boolean'); }
  const vic = await call({ view: 'transcripts', commission: 'vic-major-infrastructure' }); cited(vic);
  assert.ok(vic.rows.every(r => r.order_notes?.some(n => /may make non-publication orders/.test(n))));
});

test('CC BY transcripts are searchable by their text: verbatim excerpts with page citations, no quotes where an order is noted', async () => {
  const ix = await asset('/transcripts/index.json');
  assert.equal(ix.docs.length, 171);
  const out = await call({ view: 'transcripts', commission: 'robodebt', words: 'income averaging', limit: 8 }); cited(out);
  assert.ok(out.total > 20 && out.total <= 47);
  assert.ok(out.notes.some(n => /transcript text \(CC BY 4\.0\)/.test(n)));
  let quoted = 0, withheld = 0;
  for (const [i, r] of out.rows.entries()) {
    const t = r.text_matches; assert.ok(t?.hits.length, r.key);
    const doc = await asset(t.file); const cite = out.citations[i + 1];
    assert.match(cite.text, /Hearing transcript: evidence, not findings\. © Commonwealth of Australia, Royal Commission into the Robodebt Scheme, licensed under CC BY 4\.0\.$/);
    assert.match(cite.url, /^https:\/\/robodebt\.royalcommission\.gov\.au\/.+\.pdf#page=\d+$/);
    assert.equal(r.text_url, `https://opax.test${t.file}`); assert.equal(r.quote_policy, doc.quote_policy);
    for (const h of t.hits) {
      const page = doc.pages.find(p => p.n === h.pdf_page); assert.ok(page); assert.equal(h.transcript_page, page.folio);
      if (doc.quote_policy === 'quote') {
        const body = h.excerpt.replace(/^\.\.\./, '').replace(/\.\.\.$/, '');
        assert.ok(page.text.replace(/\s+/g, ' ').includes(body), 'excerpt is verbatim'); assert.ok(h.excerpt.length <= 290); quoted++;
      } else {
        assert.equal(h.excerpt, null); assert.equal(page.text, undefined); withheld++;
        assert.match(cite.text, /Not quoted: the publisher's transcript records a non-publication order/); assert.ok(!cite.text.includes(': "'));
      }
    }
  }
  assert.ok(quoted && withheld, `${quoted} quoted, ${withheld} withheld`);
  const nsw = await call({ view: 'transcripts', commission: 'nsw-healthcare-funding', words: 'ambulance ramping' }); cited(nsw);
  assert.ok(nsw.citations.slice(1).every(c => /© State of New South Wales Premier's Department/.test(c.text)));
  const common = await call({ view: 'transcripts', commission: 'robodebt', words: 'the and' }); cited(common, false);
  assert.ok(common.notes.some(n => /too common/.test(n)));
  const dated = await call({ view: 'transcripts', commission: 'robodebt', words: '2023-03' }); cited(dated);
  assert.equal(dated.total, 9); assert.ok(dated.rows.every(r => !r.text_matches));
  const other = await call({ view: 'transcripts', commission: 'perth casino', words: 'casino' }); cited(other);
  assert.ok(other.rows.every(r => !r.text_matches && !r.text_url));
});

test('every CC BY transcript has a text file and every no-quote file holds no page text', async () => {
  const ix = await asset('/transcripts/index.json');
  for (const id of ['cth-antisemitism', 'cth-robodebt', 'nsw-healthcare-funding']) {
    const c = (await asset(`/royal-commissions/commission-${id}.json`)).commission;
    for (const t of c.transcripts) {
      assert.ok(t.full_text, t.key); const doc = await asset(t.full_text.url);
      assert.equal(doc.key, t.key); assert.equal(doc.pdf_url, t.files[0].url); assert.equal(doc.label, 'Hearing transcript: evidence, not findings');
      assert.match(doc.attribution, /licensed under CC BY 4\.0$/);
      if (doc.quote_policy === 'no_quotes') { assert.ok(doc.order_pages.length && doc.order_notice); assert.ok(doc.pages.every(p => p.text === undefined)); }
      else assert.ok(doc.pages.some(p => p.text?.length > 200));
    }
    assert.equal(ix.docs.filter(d => d.commission === id).length, c.transcripts.length);
  }
});

// ---- A word search orders transcripts by fit, not by date (16 November 2026) ----
const fitOf = async (key, words) => {
  const ix = await asset('/transcripts/index.json'), doc = await asset(ix.docs.find(d => d.key === key).file);
  const counts = words.map(w => (doc.terms[w] ?? []).length);
  return { least: Math.min(...counts), pages: counts.reduce((a, b) => a + b, 0) };
};

test('a word search lists the transcripts that dwell on the words first: by the fewest pages any one word is on, then the sum, then newest', async () => {
  for (const [commission, words, terms] of [['robodebt', 'averaging', ['averaging']], ['robodebt', 'income averaging', ['income', 'averaging']], ['nsw-healthcare-funding', 'Queensland', ['queensland']], ['nsw-healthcare-funding', 'duress alarm', ['duress', 'alarm']]]) {
    const out = await call({ view: 'transcripts', commission, words, limit: 8 }); cited(out);
    const fits = await Promise.all(out.rows.map(r => fitOf(r.key, terms)));
    for (let i = 1; i < fits.length; i++) {
      const a = fits[i - 1], b = fits[i];
      assert.ok(a.least > b.least || a.least === b.least && (a.pages > b.pages || a.pages === b.pages && String(out.rows[i - 1].date) >= String(out.rows[i].date)), `${words}: row ${i} out of order ${JSON.stringify([a, b])}`);
    }
    // Before, the first rows were simply the newest matching hearing days.
    const dates = out.rows.map(r => String(r.date));
    assert.notDeepEqual(dates, [...dates].sort().reverse(), `${words}: no longer in date order`);
    assert.ok(fits[0].least > 1, `${words}: the first transcript holds the words on more than one page`);
  }
});

test('the whole order of a word search is the stated rule, ties included: least, then the sum, then newest', async () => {
  const ix = await asset('/transcripts/index.json');
  let tiesOnLeast = 0;
  for (const [commission, id, words, terms] of [['robodebt', 'cth-robodebt', 'income averaging', ['income', 'averaging']], ['nsw-healthcare-funding', 'nsw-healthcare-funding', 'duress alarm', ['duress', 'alarm']], ['robodebt', 'cth-robodebt', 'ombudsman whistleblower', ['ombudsman', 'whistleblower']]]) {
    const keys = [];
    for (let offset = 0, turns = 0; offset !== null && turns < 60; turns++) { const page = await call({ view: 'transcripts', commission, words, limit: 8, offset }); keys.push(...page.rows.map(r => r.key)); offset = page.next_offset ?? null; }
    // The same order worked out here from the transcript files alone.
    const matched = [];
    for (const d of ix.docs.filter(d => d.commission === id)) { const doc = await asset(d.file); if (terms.every(t => doc.terms[t])) { const counts = terms.map(t => doc.terms[t].length); matched.push({ key: d.key, date: String(d.date), least: Math.min(...counts), pages: counts.reduce((a, b) => a + b, 0) }); } }
    matched.sort((a, b) => b.least - a.least || b.pages - a.pages || b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
    assert.deepEqual(keys, matched.map(m => m.key), words);
    for (let i = 1; i < matched.length; i++) if (matched[i - 1].least === matched[i].least && matched[i - 1].pages !== matched[i].pages) tiesOnLeast++;
  }
  // The data holds rows that tie on the first part and are told apart only by the sum.
  assert.ok(tiesOnLeast >= 3, `${tiesOnLeast} ties decided by the sum`);
});

test('a title or date match comes first even when a text match fits better', async () => {
  // "Melbourne" is in the title of ten antisemitism transcripts and in the text of others.
  const ix = await asset('/transcripts/index.json');
  const rows = [];
  for (let offset = 0, turns = 0; offset !== null && turns < 60; turns++) { const page = await call({ view: 'transcripts', commission: 'antisemitism', words: 'Melbourne', limit: 8, offset }); rows.push(...page.rows); offset = page.next_offset ?? null; }
  const titled = rows.map(r => /melbourne/i.test(String(r.title)));
  const named = titled.filter(Boolean).length;
  assert.ok(named >= 2 && named < rows.length, `${named} of ${rows.length}`);
  // Every transcript titled with the word is listed before any other,
  assert.deepEqual(titled, [...Array(named).fill(true), ...Array(rows.length - named).fill(false)]);
  // though some other transcript holds the word on more pages than a titled one does.
  const count = async key => ((await asset(ix.docs.find(d => d.key === key).file)).terms.melbourne ?? []).length;
  const namedCounts = await Promise.all(rows.slice(0, named).map(r => count(r.key))), otherCounts = await Promise.all(rows.slice(named).map(r => count(r.key)));
  assert.ok(Math.max(...otherCounts) > Math.min(...namedCounts), `${Math.max(...otherCounts)} against ${Math.min(...namedCounts)}`);
  // And among themselves the titled ones are newest first, as a listing always was.
  const dates = rows.slice(0, named).map(r => String(r.date));
  assert.deepEqual(dates, [...dates].sort().reverse());
});

test('a transcript whose title or date holds the words still comes first, and a listing with no words is newest first as before', async () => {
  const dated = await call({ view: 'transcripts', commission: 'robodebt', words: '10 March 2023', limit: 3 }); cited(dated);
  assert.equal(dated.rows[0].date, '2023-03-10');
  const listed = await call({ view: 'transcripts', commission: 'robodebt', limit: 8 }); cited(listed);
  const dates = listed.rows.map(r => String(r.date));
  assert.deepEqual(dates, [...dates].sort().reverse()); assert.equal(listed.total, 47);
});

test('paging through a word search covers every match once, in the same order', async () => {
  const whole = await call({ view: 'transcripts', commission: 'robodebt', words: 'averaging', limit: 8 });
  const keys = [];
  // (A page holds as many rows as fit the payload limit; next_offset says where the next one starts.)
  for (let offset = 0, turns = 0; offset !== null && turns < 60; turns++) { const page = await call({ view: 'transcripts', commission: 'robodebt', words: 'averaging', limit: 8, offset }); keys.push(...page.rows.map(r => r.key)); offset = page.next_offset ?? null; }
  assert.equal(keys.length, whole.total); assert.equal(new Set(keys).size, whole.total);
  assert.deepEqual(keys.slice(0, whole.rows.length), whole.rows.map(r => r.key));
});

test('a word search opens no transcript beyond the rows it returns: the order comes from the postings alone', async () => {
  const reads = [];
  const counting = { ...env, asset: async path => { reads.push(path); return asset(path); } };
  const out = await api.callTool(counting, 'royal_commissions', { view: 'transcripts', commission: 'robodebt', words: 'income averaging', limit: 4 });
  const opened = reads.filter(p => /^\/transcripts\/[a-z0-9-]+\/transcript-/.test(p));
  assert.equal(out.rows.length, 4); assert.equal(new Set(opened).size, 4, 'one transcript file per returned row');
  assert.deepEqual([...new Set(opened)].sort(), out.rows.map(r => r.text_matches.file).sort());
  // The index once and one shard per searched word (two words here, both posted).
  assert.equal(reads.filter(p => p === '/transcripts/index.json').length, 1);
  assert.ok(new Set(reads.filter(p => /^\/transcripts\/terms\//.test(p))).size <= 2);
  assert.equal(out.total > 40, true, 'of more than forty matching transcripts');
});

test('the postings agree with the published transcripts: every word, everyday ones included, every transcript, and the number of its pages holding the word', async () => {
  const ix = await asset('/transcripts/index.json');
  assert.equal(ix.schema, 3);
  const want = new Map();
  for (const d of ix.docs) {
    const doc = JSON.parse(await readFile(new URL('../public' + d.file, import.meta.url), 'utf8'));
    for (const [term, pages] of Object.entries(doc.terms)) { if (!want.has(term)) want.set(term, [[], []]); want.get(term)[0].push(d.i); want.get(term)[1].push(pages.length); }
  }
  let posted = 0;
  for (let n = 0; n < ix.shards; n++) {
    const shard = await asset(`/transcripts/terms/${String(n).padStart(2, '0')}.json`);
    for (const [term, posting] of Object.entries(shard)) { posted++; assert.deepEqual(posting, want.get(term), term); }
  }
  // Every word of every transcript is posted; the everyday list is the words in more than half the transcripts.
  assert.equal(posted, want.size);
  assert.equal(ix.common_terms.length, 1570);
  assert.deepEqual(ix.common_terms, [...want].filter(([, p]) => p[0].length > Math.floor(ix.docs.length / 2)).map(([t]) => t).sort());
  // How common each everyday word is: the pages holding it across all transcripts.
  assert.deepEqual(ix.common_pages, ix.common_terms.map(t => want.get(t)[1].reduce((a, b) => a + b, 0)));
});

// ---- Everyday words are searchable (16 November 2026) ----
test('a search made only of everyday words now matches transcript text, ordered by fit', async () => {
  const ix = await asset('/transcripts/index.json'), common = new Set(ix.common_terms);
  // Each of these returned no text match before: every word in them is in more than half the transcripts.
  for (const [commission, words, terms] of [['robodebt', 'executive minute', ['executive', 'minute']], ['nsw-healthcare-funding', 'general practice training', ['general', 'practice', 'training']], ['robodebt', '2015 budget measure', ['2015', 'budget', 'measure']], ['robodebt', 'legal advice', ['legal', 'advice']]]) {
    assert.ok(terms.every(t => common.has(t)), words);
    const out = await call({ view: 'transcripts', commission, words, limit: 4 }); cited(out);
    assert.ok(out.rows.length >= 1 && out.rows.every(r => r.text_matches?.hits.length), words);
    assert.equal(out.notes.some(n => /too common to search/.test(n)), false, words);
    const fits = await Promise.all(out.rows.map(r => fitOf(r.key, terms)));
    for (let i = 1; i < fits.length; i++) assert.ok(fits[i - 1].least >= fits[i].least, `${words}: row ${i}`);
    // The quoted pages hold the words: for a quotable transcript the first page picked holds every one of them.
    for (const r of out.rows) {
      const doc = await asset(r.text_matches.file), first = r.text_matches.hits[0].pdf_page;
      if (terms.every(t => doc.terms[t].some(n => terms.every(u => doc.terms[u].includes(n))))) assert.ok(terms.every(t => doc.terms[t].includes(first)), `${words}: ${r.key} page ${first}`);
    }
  }
  // Words that are only stopwords still hold nothing to search, and say so as before.
  const none = await call({ view: 'transcripts', commission: 'robodebt', words: 'the was of', limit: 4 });
  assert.ok(none.notes.some(n => n === 'Those words are too common to search the transcript text; add a more specific word.'));
});

test('a search reads at most six postings files: specific words first, then the least common everyday words, and the notes say which were left out', async () => {
  const ix = await asset('/transcripts/index.json');
  const reads = [];
  const counting = { ...env, asset: async path => { reads.push(path); return asset(path); } };
  // Nine searchable words: three specific, six everyday.
  const everyday = ['general', 'practice', 'training', 'budget', 'evidence', 'department'];
  const words = `${everyday.slice(0, 4).join(' ')} averaging ${everyday.slice(4).join(' ')} ombudsman whistleblower`;
  const out = await api.callTool(counting, 'royal_commissions', { view: 'transcripts', commission: 'robodebt', words, limit: 4 });
  const shards = reads.filter(p => /^\/transcripts\/terms\//.test(p));
  assert.ok(shards.length <= 6, `${shards.length} postings reads`);
  const note = out.notes.find(n => n.startsWith('A transcript text search reads at most 6 words. Not searched: '));
  assert.ok(note, JSON.stringify(out.notes));
  const skipped = note.replace(/^.*Not searched: /, '').replace(/\.$/, '').split(', ');
  // The three left out are the three commonest of the six everyday words, by pages holding them across all transcripts.
  const pages = Object.fromEntries(ix.common_terms.map((t, at) => [t, ix.common_pages[at]]));
  assert.ok(everyday.every(t => pages[t] > 0));
  assert.deepEqual([...skipped].sort(), [...everyday].sort((a, b) => pages[b] - pages[a]).slice(0, 3).sort(), note);
  // The note is one more string in the notes the result already carries: no new field.
  const short = await api.callTool(env, 'royal_commissions', { view: 'transcripts', commission: 'robodebt', words: 'averaging', limit: 4 });
  assert.deepEqual(Object.keys(out).sort(), Object.keys(short).sort());
  assert.equal(short.notes.some(n => /Not searched/.test(n)), false);
  // A search of the commonest words is bounded by `limit` like any other, and opens only the rows it returns.
  const wide = []; const widely = { ...env, asset: async path => { wide.push(path); return asset(path); } };
  const every = await api.callTool(widely, 'royal_commissions', { view: 'transcripts', commission: 'robodebt', words: 'the evidence was', limit: 4 });
  assert.equal(every.total, 47); assert.equal(every.rows.length, 4);
  assert.equal(new Set(wide.filter(p => /^\/transcripts\/[a-z0-9-]+\/transcript-/.test(p))).size, 4);
  assert.equal(wide.filter(p => /^\/transcripts\/terms\//.test(p)).length, 1);
});

/** Every key a word search returns, paged to the end. */
const allKeys = async (commission, words) => {
  const keys = []; let total = 0;
  for (let offset = 0, turns = 0; offset !== null && turns < 80; turns++) { const page = await call({ view: 'transcripts', commission, words, limit: 8, offset }); keys.push(...page.rows.map(r => r.key)); total = page.total; offset = page.next_offset ?? null; }
  assert.equal(keys.length, total, words);
  return keys;
};

test('everyday words rank and never filter: with a specific word in the search, the transcripts found are exactly those the specific words find', async () => {
  const ix = await asset('/transcripts/index.json'), common = new Set(ix.common_terms);
  // The ruled example.
  const alone = await allKeys('robodebt', 'averaging'), withEveryday = await allKeys('robodebt', 'legal advice averaging');
  assert.deepEqual([...withEveryday].sort(), [...alone].sort());
  assert.notDeepEqual(withEveryday, alone, 'the order is not the same: the everyday words rank');
  // Among transcripts that tie on the specific word, those where "legal" and "advice" are both on more pages come first.
  const counts = async (key, terms) => { const doc = await asset(ix.docs.find(d => d.key === key).file); return terms.map(t => (doc.terms[t] ?? []).length); };
  let decided = 0;
  for (let i = 1; i < withEveryday.length; i++) {
    const [a] = await counts(withEveryday[i - 1], ['averaging']), [b] = await counts(withEveryday[i], ['averaging']);
    assert.ok(a >= b, `row ${i}: the specific word decides first`);
    if (a !== b) continue;
    const ea = Math.min(...await counts(withEveryday[i - 1], ['legal', 'advice'])), eb = Math.min(...await counts(withEveryday[i], ['legal', 'advice']));
    assert.ok(ea >= eb, `row ${i}: then the weaker of the everyday words`);
    if (ea !== eb) decided++;
  }
  assert.ok(decided >= 1, 'at least one tie on the specific word is decided by the everyday words');
  // The whole order, worked out here from the transcript files: the specific word's pages, then the weaker of the
  // two everyday words (zero when one is absent), then the sum of all three, then newest. "cabinet legal advice" is
  // a search where the everyday part decides: with it left out (the sum straight after the specific word) the order
  // is a different one.
  for (const [specific, decides] of [['averaging', false], ['cabinet', true]]) {
    const ranked = [];
    for (const d of ix.docs.filter(d => d.commission === 'cth-robodebt')) {
      const doc = await asset(d.file); if (!doc.terms[specific]) continue;
      const n = t => (doc.terms[t] ?? []).length;
      ranked.push({ key: d.key, date: String(d.date), least: n(specific), everyday: Math.min(n('legal'), n('advice')), pages: n(specific) + n('legal') + n('advice') });
    }
    ranked.sort((a, b) => b.least - a.least || b.everyday - a.everyday || b.pages - a.pages || b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
    assert.deepEqual(await allKeys('robodebt', `legal advice ${specific}`), ranked.map(r => r.key), specific);
    const without = [...ranked].sort((a, b) => b.least - a.least || b.pages - a.pages || b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
    assert.equal(JSON.stringify(without.map(r => r.key)) !== JSON.stringify(ranked.map(r => r.key)), decides, specific);
  }
  // The property, over many searches: one to three specific words, with and without everyday words mixed in.
  const specific = ['averaging', 'ombudsman', 'whistleblower', 'cabinet', 'drafted', 'duress', 'alarm', 'locum', 'queensland', 'neurosurgery'].filter(t => !common.has(t));
  const everyday = ['legal', 'advice', 'general', 'practice', 'budget', 'minister', 'evidence'].filter(t => common.has(t));
  assert.ok(specific.length >= 8 && everyday.length >= 6);
  let checked = 0;
  for (const commission of ['robodebt', 'nsw-healthcare-funding']) for (let i = 0; i < specific.length; i++) for (const more of [[], [specific[(i + 3) % specific.length]]]) {
    const base = [specific[i], ...more], plain = await allKeys(commission, base.join(' '));
    for (const mixed of [[everyday[i % everyday.length], ...base], [...base, everyday[(i + 1) % everyday.length], everyday[(i + 2) % everyday.length]], [everyday[(i + 3) % everyday.length], base[0], everyday[(i + 4) % everyday.length], ...base.slice(1)]]) {
      assert.deepEqual([...await allKeys(commission, mixed.join(' '))].sort(), [...plain].sort(), `${commission}: ${mixed.join(' ')}`); checked++;
    }
  }
  assert.ok(checked >= 100, `${checked} searches`);
});

test('a search made only of date words is a date lookup exactly as before: titles and dates, never the text', async () => {
  // No hearing of the NSW inquiry sat on 10 March 2023: none is listed (the text of 34 transcripts holds both words).
  const none = await call({ view: 'transcripts', commission: 'nsw-healthcare-funding', words: '10 March 2023', limit: 8 }); cited(none, false);
  assert.equal(none.total, 0); assert.equal(none.rows.length, 0);
  const day = await call({ view: 'transcripts', commission: 'robodebt', words: '10 March 2023', limit: 8 }); cited(day);
  assert.equal(day.total, 1); assert.equal(day.rows[0].date, '2023-03-10'); assert.equal(day.rows[0].text_matches, undefined);
  const month = await call({ view: 'transcripts', commission: 'nsw-healthcare-funding', words: 'February 2024', limit: 8 }); cited(month);
  assert.equal(month.total, 6); assert.ok(month.rows.every(r => /^2024-02-/.test(String(r.date)) && !r.text_matches));
  const bare = await call({ view: 'transcripts', commission: 'robodebt', words: 'March', limit: 8 }); cited(bare);
  assert.equal(bare.total, 8); assert.ok(bare.rows.every(r => /-03-/.test(String(r.date))));
  // With another word beside the date words, every word searches the text. "March budget" found nothing before
  // (both were unsearchable and no title holds both); now it finds the transcripts whose text holds both.
  const mixed = await call({ view: 'transcripts', commission: 'robodebt', words: 'March budget', limit: 4 }); cited(mixed);
  assert.ok(mixed.total >= 1 && mixed.rows.every(r => r.text_matches?.hits.length));
  // With a specific word the set is that word's set, as on the order-only change: the date words only rank.
  assert.deepEqual([...await allKeys('robodebt', '10 March 2023 averaging')].sort(), [...await allKeys('robodebt', 'averaging')].sort());
});

test('more than six specific words: the most frequent are left out, the note names them, and still at most six postings files are read', async () => {
  const ix = await asset('/transcripts/index.json'), common = new Set(ix.common_terms), totals = await asset('/transcripts/term-pages.json');
  const nine = ['averaging', 'ombudsman', 'whistleblower', 'cabinet', 'drafted', 'centrelink', 'overpayment', 'payslips', 'reconciliation'];
  assert.ok(nine.every(t => !common.has(t) && totals[t] > 0), JSON.stringify(nine.map(t => [t, common.has(t), totals[t]])));
  const reads = []; const counting = { ...env, asset: async path => { reads.push(path); return asset(path); } };
  const out = await api.callTool(counting, 'royal_commissions', { view: 'transcripts', commission: 'robodebt', words: nine.join(' '), limit: 4 });
  const note = out.notes.find(n => n.startsWith('A transcript text search reads at most 6 words. Not searched: '));
  assert.ok(note, JSON.stringify(out.notes));
  const skipped = note.replace(/^.*Not searched: /, '').replace(/\.$/, '').split(', ');
  assert.deepEqual([...skipped].sort(), [...nine].sort((a, b) => totals[b] - totals[a]).slice(0, 3).sort(), note);
  assert.ok(reads.filter(p => /^\/transcripts\/terms\//.test(p)).length <= 6);
  assert.equal(reads.filter(p => p === '/transcripts/term-pages.json').length, 1);
  // The page totals are read only then: a search within the cap does not open the file.
  const few = []; await api.callTool({ ...env, asset: async path => { few.push(path); return asset(path); } }, 'royal_commissions', { view: 'transcripts', commission: 'robodebt', words: nine.slice(0, 6).join(' '), limit: 4 });
  assert.equal(few.includes('/transcripts/term-pages.json'), false);
  // Every word of every transcript has its total.
  let posted = 0; for (let n = 0; n < ix.shards; n++) for (const [term, [, pages]] of Object.entries(await asset(`/transcripts/terms/${String(n).padStart(2, '0')}.json`))) { posted++; assert.equal(totals[term], pages.reduce((a, b) => a + b, 0), term); }
  assert.equal(posted, Object.keys(totals).length);
});

test('a year that is a specific word searches the text as before; only everyday date words make a date lookup', async () => {
  const ix = await asset('/transcripts/index.json'), common = new Set(ix.common_terms);
  // Main's rows for each (the review's cases): the first version of the date guard returned none.
  for (const [words, total] of [['2014', 40], ['2016', 45], ['5000', 7]]) {
    assert.equal(common.has(words), false, words);
    const out = await call({ view: 'transcripts', commission: 'robodebt', words, limit: 4 }); cited(out);
    assert.equal(out.total, total, words); assert.ok(out.rows.every(r => r.text_matches?.hits.length), words);
    assert.equal(out.notes.some(n => /too common to search/.test(n)), false, words);
  }
  // Everyday date words alone are still a date lookup, with the note main gives.
  for (const words of ['2023', 'March', '2023-03', 'February 2024']) {
    assert.ok(words.toLowerCase().match(/[a-z]+|\d{4}/g).every(t => common.has(t)), words);
    const out = await call({ view: 'transcripts', commission: 'robodebt', words, limit: 4 }); cited(out, false);
    assert.ok(out.rows.every(r => !r.text_matches), words); assert.ok(out.notes.some(n => /too common to search/.test(n)), words);
  }
  // A specific year beside everyday date words is a required word like any other.
  assert.deepEqual([...await allKeys('robodebt', 'March 2014')].sort(), [...await allKeys('robodebt', '2014')].sort());
});
