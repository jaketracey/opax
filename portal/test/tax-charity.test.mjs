import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

// The module is dependency-free ES; import it as shipped. Each test that fetches gets a fresh copy
// (the module caches its index and shards) through a unique query string.
let copies = 0;
const load = () => import(`../public/tax-charity.js?copy=${copies++}`);
const T = await load();
const publicDir = new URL('../public/', import.meta.url);
const read = (path) => readFileSync(new URL(path, publicDir), 'utf8');

const META = {
  schema: 1,
  sources: {
    register: { dataset_url: 'https://data.gov.au/data/dataset/acnc-register', licence: 'CC BY 3.0 AU', snapshot_date: '2026-09-27' },
    ais: {
      latest_year: '2024',
      years: {
        2024: { dataset_url: 'https://data.gov.au/data/dataset/acnc-2024', licence: 'CC BY 4.0' },
        2023: { dataset_url: 'https://data.gov.au/data/dataset/acnc-2023', licence: 'CC BY 3.0 AU' },
      },
    },
    ato: {
      latest_year: '2023-24',
      guidance_url: 'https://www.ato.gov.au/report-of-entity-tax-information',
      years: {
        '2023-24': { record_url: 'https://data.gov.au/data/dataset/corporate-transparency/resource/r24', licence: 'CC BY 3.0 AU' },
        '2022-23': { record_url: 'https://data.gov.au/data/dataset/corporate-transparency/resource/r23', licence: 'CC BY 3.0 AU' },
      },
    },
  },
  caveats: {
    ato: 'Figures are as the ATO published them. Tax payable is not tax paid. A blank means the ATO left the field blank because the amount was zero or less.',
    ais: 'Figures are as the charity reported them to the ACNC.',
    register: 'DGR status is not part of the ACNC dataset.',
  },
};
const CHARITY = {
  c: { n: 'WA Primary Health Alliance Limited', sz: 'Large', hpc: 1, reg: '2015-04-01' },
  a: [
    { y: 2024, rev: 237091962, gov: 228869265, don: 1000, to: '2024-06-30', n: 'WA Primary Health Alliance Limited' },
    { y: 2023, rev: 199100000, gov: 193400000, to: '2023-06-30' },
  ],
};
const COMPANY = {
  t: [
    { y: '2023-24', inc: 56596759405, tax: 2702605198, pay: 767268429 },
    { y: '2022-23', inc: 50000000000, tax: 2500000000, pay: 700000000 },
  ],
  tn: 'WOOLWORTHS GROUP LIMITED',
};
const facts = (html) => html.match(/<dl class="tc-facts">([\s\S]*?)<\/dl>/)?.[1] || '';
// Block-level ends become spaces, inline tags vanish, so "$351.9M" and the full stop after it stay together.
const text = (html) => html.replace(/<\/(dt|dd|li|p|tr|th|td|summary|details|table)>/g, ' ').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

test('the name key folds exactly like normName() in app.js', () => {
  const src = read('app.js');
  const body = src.match(/function normName\(x\) \{([\s\S]*?)\n\}/)[1];
  const appNorm = new Function('x', body);
  for (const name of ['Westpac Banking Corporation', 'The Smith Holdings Pty Ltd', 'A&B Co.', 'Woolworths Group Limited', '', null, 'CMAX Advisory Pty Ltd'])
    assert.equal(T.normName(name), appNorm(name), String(name));
});

test('government share is revenue from government over total revenue, and absent when it cannot be stated', () => {
  assert.equal(T.govShare({ rev: 200, gov: 50 }).pct, '25%');
  assert.equal(T.govShare({ rev: 237091962, gov: 228869265 }).pct, '97%');
  assert.equal(T.govShare({ rev: 1000, gov: 1 }).pct, 'under 1%');
  assert.equal(T.govShare({ rev: 100, gov: 0 }).pct, '0%');
  assert.equal(T.govShare({ rev: 0, gov: 0 }), null);          // no revenue: no share
  assert.equal(T.govShare({ gov: 10 }), null);                 // no total revenue reported
  assert.equal(T.govShare({ rev: 10 }), null);                 // no government figure
  assert.equal(T.govShare(null), null);
});

test('a charity block shows size, PBI/HPC, revenue, the government share and where each figure comes from', () => {
  const html = T.taxCharityHTML(CHARITY, META, { abn: '11602416697' });
  const f = text(facts(html));
  assert.match(f, /Large charity · Health Promotion Charity \(HPC\) · registered 1 Apr 2015/);
  assert.match(f, /ACNC name: WA Primary Health Alliance Limited/);
  assert.match(f, /\$237\.1M revenue \(year to 30 Jun 2024\), of which \$228\.9M \(97%\) from government/);
  assert.match(f, /\$1\.0K donations and bequests/);
  assert.match(f, /AIS 2023: \$199\.1M revenue, \$193\.4M \(97%\) from government/);
  assert.match(html, /https:\/\/www\.acnc\.gov\.au\/charity\/charities\?search=11602416697/);
  // attribution: publisher, licence and a link to the record, per source
  assert.match(html, /<a href="https:\/\/data\.gov\.au\/data\/dataset\/acnc-register"[^>]*>ACNC Registered Charities/);
  assert.match(text(html), /CC BY 3\.0 AU, updated 27 Sep 2026/);
  assert.match(html, /<a href="https:\/\/data\.gov\.au\/data\/dataset\/acnc-2024"[^>]*>ACNC 2024 Annual Information Statement/);
  assert.match(text(html), /\(CC BY 4\.0\)/);
  assert.match(html, /DGR status is not part of the ACNC dataset/);
  assert.doesNotMatch(html, /Tax payable|ATO/);
});

test('the ATO row reports the published figures neutrally, with the ATO caveat and its licence', () => {
  const html = T.taxCharityHTML(COMPANY, META, { abn: '88000014675' });
  const f = text(facts(html));
  assert.match(f, /ATO 2023-24 Total income \$56\.60B · taxable income \$2\.70B · tax payable \$767\.3M/);
  assert.match(f, /ATO name: WOOLWORTHS GROUP LIMITED/);
  // exact dollars are in the tooltip
  assert.match(html, /title="\$767,268,429"/);
  // no verdicts, rates or judgement words in the figures
  assert.doesNotMatch(facts(html), /avoid|evad|dodg|loophole|only paid|paid no|pays? (little|no)|effective|rate|%|low|high/i);
  // the caveat and the source
  assert.match(html, /Tax payable is not tax paid/);
  assert.match(html, /zero or less/);
  assert.match(html, /<a href="https:\/\/data\.gov\.au\/data\/dataset\/corporate-transparency\/resource\/r24"[^>]*>ATO Corporate Tax Transparency 2023-24/);
  assert.match(text(html), /\(CC BY 3\.0 AU\)/);
  assert.match(html, /<a href="https:\/\/www\.ato\.gov\.au\/report-of-entity-tax-information"[^>]*>ATO guidance/);
  // earlier years in a table, each filed figure to the dollar
  assert.match(html, /<th scope="row">2022-23<\/th><td>\$50,000,000,000<\/td><td>\$2,500,000,000<\/td><td>\$700,000,000<\/td>/);
  assert.doesNotMatch(html, /Registered charity|ACNC Charity Register/);
});

test('a blank ATO amount reads as blank (zero or less), never as $0', () => {
  const html = T.taxCharityHTML({ t: [{ y: '2023-24', inc: 150000000 }, { y: '2022-23', inc: 100000000, tax: 5000000 }] }, META, { abn: '55555555555' });
  const f = text(facts(html));
  assert.match(f, /Total income \$150\.0M · taxable income blank · tax payable blank/);
  assert.match(html, /title="The ATO leaves a field blank when the amount is zero or less"/);
  assert.doesNotMatch(f, /\$0\b/);
  assert.match(html, /<td>\$5,000,000<\/td><td><span class="tc-blank"/);   // earlier year: taxable shown, tax payable blank
});

test('a PRRT-only listing is described as such', () => {
  const html = T.taxCharityHTML({ t: [{ y: '2023-24', prrt: 351898218 }], tn: 'ESSO AUSTRALIA' }, META, { abn: '62091829819' });
  assert.match(text(facts(html)), /Petroleum resource rent tax payable \$351\.9M\. Listed on the ATO's PRRT tab; no income tax entry that year\./);
});

test('an ABN last listed before the latest report says so, without claiming the entity is absent', () => {
  const html = T.taxCharityHTML({ t: [{ y: '2019-20', inc: 400000000, tax: 1, pay: 1 }] }, META, { abn: '55555555555' });
  assert.match(text(html), /The latest year listed under this ABN\. The 2023-24 report has no entry under it\./);
  assert.match(text(facts(html)), /ATO 2019-20/);
  // the source line names the year of the figures shown
  assert.doesNotMatch(html, /Corporate Tax Transparency 2023-24/);
});

test('a charity that is no longer on the register is described from its AIS row only', () => {
  const html = T.taxCharityHTML({ a: [{ y: 2024, rev: 0, gov: 0, rs: 'Voluntarily Revoked No Longer Operating', n: 'GONE INC', to: '2024-06-30' }] }, META, { abn: '44444444444' });
  const f = text(facts(html));
  assert.match(f, /In the ACNC 2024 Annual Information Statement dataset \(status there: Voluntarily Revoked No Longer Operating\)\. Not in the current Charity Register dataset\./);
  assert.match(f, /The dataset shows \$0 revenue \(year to 30 Jun 2024\)\./);
  assert.doesNotMatch(f, /Reported no revenue/);   // a zero in the dataset may be a figure never reported
  assert.doesNotMatch(f, /Registered charity|Large charity/);
  assert.doesNotMatch(html, /Registered Charities/);        // the register dataset is not a source for this row
});

test('missing financial figures are stated as missing, and a basic religious charity says why', () => {
  const none = T.taxCharityHTML({ c: { n: 'X', sz: 'Small' }, a: [{ y: 2024 }] }, META, { abn: '11111111111' });
  assert.match(text(facts(none)), /The AIS dataset publishes no financial figures for 2024\./);
  const rel = T.taxCharityHTML({ c: { n: 'X' }, a: [{ y: 2024, rel: 1 }] }, META, { abn: '11111111111' });
  assert.match(text(facts(rel)), /A basic religious charity: no financial information is reported to the ACNC\./);
});

test('names and links from the data are escaped, and only https links are followed', () => {
  const html = T.taxCharityHTML({ c: { n: '<img src=x onerror=alert(1)> & Co', sz: 'Large' } }, {
    ...META, sources: { ...META.sources, register: { dataset_url: 'javascript:alert(1)', licence: '<b>x</b>' } },
  }, { abn: '11111111111' });
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; &amp; Co/);
  assert.doesNotMatch(html, /javascript:/);
  assert.doesNotMatch(html, /<b>x<\/b>/);
});

test('nothing renders for an empty or missing record', () => {
  assert.equal(T.taxCharityHTML(null, META, { abn: '1' }), '');
  assert.equal(T.taxCharityHTML({}, META, { abn: '1' }), '');
  assert.equal(T.taxCharityHTML({ a: [], t: [] }, META, { abn: '1' }), '');
});

// --- mounting -------------------------------------------------------------------------------------

function slotStub() { return { className: '', innerHTML: '', hidden: true, removed: false, remove() { this.removed = true; } }; }
function fetchStub(files) {
  const calls = [];
  const fn = async (url) => { calls.push(url); return url in files ? { ok: true, json: async () => files[url] } : { ok: false, json: async () => null }; };
  fn.calls = calls;
  return fn;
}
const SHARD = { '11602416697': CHARITY, '88000014675': COMPANY };
const FILES = {
  '/entities/tax-charity/index.json': { meta: META },
  '/entities/tax-charity/97.json': { '11602416697': CHARITY },
  '/entities/tax-charity/75.json': { '88000014675': COMPANY },
  '/entities/tax-charity/names.json': { by_name: { 'woolworths group': '88000014675', 'ambiguous': null } },
};
async function withFetch(files, fn) {
  const saved = globalThis.fetch;
  const stub = fetchStub(files);
  globalThis.fetch = stub;
  try { return await fn(stub, await load()); } finally { globalThis.fetch = saved; }
}

test('an ABN fetches the index and one shard, and never the name index', async () => {
  await withFetch(FILES, async (stub, m) => {
    const slot = slotStub();
    await m.mountTaxCharity(slot, { abn: '11 602 416 697' });
    assert.deepEqual(stub.calls, ['/entities/tax-charity/index.json', '/entities/tax-charity/97.json']);
    assert.equal(slot.hidden, false);
    assert.match(slot.innerHTML, /WA Primary Health Alliance/);
    assert.match(slot.className, /taxcharity/);
    // a second organisation in the same shard costs no further request
    const again = slotStub();
    await m.mountTaxCharity(again, { abn: '11602416697' });
    assert.equal(stub.calls.length, 2);
  });
});

test('a donor page with only a name goes through the exact-name index', async () => {
  await withFetch(FILES, async (stub, m) => {
    const slot = slotStub();
    await m.mountTaxCharity(slot, { name: 'Woolworths Group Limited' });
    assert.deepEqual(stub.calls, ['/entities/tax-charity/index.json', '/entities/tax-charity/names.json', '/entities/tax-charity/75.json']);
    assert.match(slot.innerHTML, /WOOLWORTHS GROUP LIMITED/);
  });
});

test('an ABN wins over a name, and a name the index does not hold shows nothing', async () => {
  await withFetch(FILES, async (stub, m) => {
    const slot = slotStub();
    await m.mountTaxCharity(slot, { abn: '11602416697', name: 'Woolworths Group Limited' });
    assert.match(slot.innerHTML, /WA Primary Health Alliance/);
    assert.ok(!stub.calls.includes('/entities/tax-charity/names.json'));
    const unknown = slotStub();
    await m.mountTaxCharity(unknown, { name: 'Some Other Company Pty Ltd' });
    assert.equal(unknown.removed, true);
    assert.equal(unknown.innerHTML, '');
  });
});

test('no ABN and no name, an ABN without a row, or a failed fetch all leave nothing on the page', async () => {
  await withFetch(FILES, async (stub, m) => {
    const a = slotStub(); await m.mountTaxCharity(a, {}); assert.equal(a.removed, true);
    const b = slotStub(); await m.mountTaxCharity(b, { abn: '99999999997' }); assert.equal(b.removed, true);   // shard missing: 404
    const bad = slotStub(); await m.mountTaxCharity(bad, { abn: 'not an abn' }); assert.equal(bad.removed, true);
  });
  await withFetch({}, async (stub, m) => {
    const slot = slotStub();
    await m.mountTaxCharity(slot, { abn: '11602416697' });
    assert.equal(slot.removed, true);
    assert.deepEqual(stub.calls, ['/entities/tax-charity/index.json']);
  });
});

test('a reader who has moved on gets no late write', async () => {
  await withFetch(FILES, async (stub, m) => {
    const slot = slotStub();
    await m.mountTaxCharity(slot, { abn: '11602416697', alive: () => false });
    assert.equal(slot.innerHTML, '');
    assert.equal(slot.hidden, true);
  });
});

// --- wiring ---------------------------------------------------------------------------------------

test('donor pages mount the block by name, suppliers and recipients by their own ABN only', () => {
  const app = read('app.js');
  assert.match(app, /await mountTaxCharity\(slot, \{ name, alive/);
  assert.equal((app.match(/renderDonorTaxCharity\(/g) || []).length, 3);    // the definition and both donor branches
  assert.match(app, /if \(!isParty\) renderDonorTaxCharity\(node\.label, sections\)/);
  assert.match(app, /if \(kind === "donor"\) renderDonorTaxCharity\(name, sections\)/);
  const suppliers = read('suppliers.js');
  assert.match(suppliers, /if \(profile\.abn\) import\('\/tax-charity\.js\?v=[^']+'\)/);
  assert.match(suppliers, /mountTaxCharity\(taxSlot, \{ abn: profile\.abn, alive: life\.alive \}\)/);
  assert.doesNotMatch(suppliers, /mountTaxCharity\([^)]*name/);            // a supplier with no ABN is never matched by name
  const recipient = read('grant-recipient.js');
  assert.match(recipient, /if \(data\.abn\) import\('\/tax-charity\.js\?v=[^']+'\)/);
  assert.match(recipient, /mountTaxCharity\(taxCharity, \{ abn: data\.abn/);
  assert.doesNotMatch(recipient, /mountTaxCharity\([^)]*name/);
  // one cache-busting tag everywhere, so a redeploy of the module moves every page together
  const tags = new Set([app, suppliers, recipient].flatMap((s) => [...s.matchAll(/tax-charity\.js\?v=([\w-]+)/g)].map((m) => m[1])));
  assert.equal(tags.size, 1);
});

// --- the committed export -------------------------------------------------------------------------

const exportDir = new URL('entities/tax-charity/', publicDir);
test('the committed export is well formed: shards by last two digits, sources, licences, caveats', { skip: !existsSync(exportDir) }, () => {
  const index = JSON.parse(readFileSync(new URL('index.json', exportDir), 'utf8')).meta;
  const names = JSON.parse(readFileSync(new URL('names.json', exportDir), 'utf8')).by_name;
  assert.equal(index.schema, 1);
  for (const key of ['register', 'ais', 'ato']) assert.ok(index.sources[key].title && index.sources[key].publisher, key);
  assert.match(index.sources.register.licence, /^CC BY/);
  assert.match(index.sources.register.dataset_url, /^https:\/\/data\.gov\.au\//);
  for (const [y, s] of Object.entries(index.sources.ais.years)) { assert.match(s.licence, /^CC BY/, y); assert.match(s.dataset_url, /^https:\/\//, y); }
  for (const [y, s] of Object.entries(index.sources.ato.years)) { assert.match(s.licence, /^CC BY/, y); assert.match(s.record_url, /^https:\/\/data\.gov\.au\//, y); }
  assert.ok(index.sources.ato.years[index.sources.ato.latest_year]);
  assert.ok(index.sources.ais.years[index.sources.ais.latest_year]);
  assert.match(index.caveats.ato, /not tax paid/);
  assert.match(index.caveats.ato, /zero or less/);

  const seen = new Set();
  let bytes = 0;
  for (const file of readdirSync(exportDir).filter((f) => /^\d\d\.json$/.test(f))) {
    const raw = readFileSync(new URL(file, exportDir), 'utf8');
    bytes += raw.length;
    assert.ok(raw.length < 250_000, `${file} is ${raw.length} bytes`);
    for (const [abn, rec] of Object.entries(JSON.parse(raw))) {
      assert.match(abn, /^\d{11}$/);
      assert.equal(abn.slice(-2), file.slice(0, 2), `${abn} is in shard ${file}`);
      assert.ok(rec.c || rec.a?.length || rec.t?.length, abn);
      for (const a of rec.a || []) assert.ok(index.sources.ais.years[a.y], `${abn} AIS ${a.y} has a licence record`);
      for (const t of rec.t || []) assert.ok(index.sources.ato.years[t.y], `${abn} ATO ${t.y} has a licence record`);
      assert.ok(!('taxable' in rec) && !JSON.stringify(rec).includes('"pay":0'), `${abn}: a blank ATO amount is never written as zero`);
      seen.add(abn);
    }
  }
  assert.equal(seen.size, index.counts.abns_written);
  assert.ok(bytes < 4_000_000, `shards total ${bytes} bytes`);
  for (const abn of Object.values(names)) assert.ok(seen.has(abn), `name index points at ${abn}, which has a record`);
  // every one of the block's HTML paths renders on real records without throwing
  const some = readdirSync(exportDir).filter((f) => /^\d\d\.json$/.test(f)).slice(0, 5)
    .flatMap((f) => Object.entries(JSON.parse(readFileSync(new URL(f, exportDir), 'utf8'))));
  for (const [abn, rec] of some) assert.ok(T.taxCharityHTML(rec, index, { abn }).includes('Charity and tax transparency'), abn);
});
