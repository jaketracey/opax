/* global __dirname */
// Offline contract projection. Run with node; no network or production KB.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto, createHash } = require('node:crypto');
const portal = path.resolve(__dirname, '../../../../portal');
const source = ts.createSourceFile(
  'index.ts',
  fs.readFileSync(path.join(portal, 'src/index.ts'), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
);
const fn = source.statements
  .find((n) => ts.isFunctionDeclaration(n) && n.name?.text === 'apiResource')
  .getText(source);
const declarations = source.statements
  .filter(
    (n) =>
      ts.isVariableStatement(n) &&
      n.declarationList.declarations.some((d) =>
        /^(SLUG_RE|BILL_TEXT_SLUG_RE|PRESS_SLUG_RE|RESEARCH_SLUG_RE|DIVISION_SLUG_RE|isPublicSlug)$/.test(
          d.name.getText(source),
        ),
      ),
  )
  .map((n) => n.getText(source))
  .join('\n');
const bill = JSON.parse(
  fs.readFileSync(path.join(portal, 'public/bills/au-federal-r7534.json')),
);
const speech = bill.speeches[0];
const division = bill.divisions[0];
const field = (body) => ({ value: { body } });
const disclaimer =
  'Synthetic reader fixture. This text is a layout and selection test, not a parliamentary quotation or a statement attributed to the roster entry. ';
const speechText = Array.from(
  { length: 18 },
  (_, i) =>
    `${disclaimer}Paragraph ${i + 1} exercises readable full text without a preview cutoff. All source characters remain available.\n\n`,
).join('');
const seeds = {
  [speech.slug]: {
    title: 'Synthetic reader layout fixture — not a parliamentary quotation',
    origin: {
      collaborators: [speech.speaker],
      url: 'https://www.aph.gov.au/Parliamentary_Business/Hansard',
    },
    usermetadata: {
      classifications: [
        { labelset: 'kind', label: 'speech' },
        { labelset: 'state', label: 'federal' },
        { labelset: 'chamber', label: 'representatives' },
        { labelset: 'party', label: speech.party },
      ],
    },
    extra: {
      metadata: { date: speech.date, fixture: true, bill_ref: bill.title },
    },
    computedmetadata: {
      field_classifications: [
        { classifications: [{ labelset: 'topic', label: 'gambling' }] },
      ],
    },
    data: {
      texts: {
        body: field(speechText),
        'da-summary-t-body': field(
          'Synthetic machine-summary fixture for the reader, not a summary of this person’s remarks.',
        ),
      },
    },
  },
  [`division-${division.key}`]: {
    title: `Senate division, ${division.date}: ${division.question}`,
    origin: { collaborators: ['Voters are not a speaker'], url: division.url },
    usermetadata: {
      classifications: [
        { labelset: 'kind', label: 'division' },
        { labelset: 'state', label: 'federal' },
        { labelset: 'chamber', label: 'senate' },
        { labelset: 'result', label: division.outcome },
      ],
    },
    extra: {
      metadata: {
        date: division.date,
        ayes_count: division.ayes,
        noes_count: division.noes,
        bill_ref: bill.title,
      },
    },
    data: { texts: { body: field(division.question) } },
  },
  'press-pmt-reader-fixture': {
    title: 'Synthetic government release fixture',
    origin: {
      collaborators: ['Fixture government office'],
      url: 'https://example.org/government-release',
    },
    usermetadata: {
      classifications: [
        { labelset: 'kind', label: 'press_release' },
        { labelset: 'state', label: 'federal' },
      ],
    },
    extra: {
      metadata: {
        date: '2026-10-01',
        headline: 'Synthetic government release fixture',
        fixture: true,
      },
    },
    data: {
      texts: {
        't-body': field(
          'Synthetic government release fixture. This test record contains no statement by a real person.\n\nAll paragraphs are selectable.',
        ),
      },
    },
  },
  'speech-999999998': {
    title: 'Synthetic related speech fixture',
    origin: { collaborators: ['Fixture speaker'] },
    usermetadata: {
      classifications: [
        { labelset: 'kind', label: 'speech' },
        { labelset: 'state', label: 'federal' },
      ],
    },
    extra: { metadata: { date: '2026-10-01', fixture: true } },
    data: {
      texts: {
        body: field(
          'Synthetic related record. There is no real parliamentary quotation in this fixture.',
        ),
      },
    },
  },
  'grant-site-evidence-ga566033': {
    title: 'Synthetic grant-evidence fixture',
    usermetadata: {
      classifications: [{ labelset: 'kind', label: 'research_report' }],
    },
    extra: { metadata: { date: '2026-10-01', fixture: true } },
    data: {
      texts: {
        't-body': field(
          'Synthetic evidence fixture. Invitations, awards and payments are distinct stages.',
        ),
      },
    },
  },
};
const key = bill.key;
function billSeed(stage) {
  const sections = [
    {
      id: 'part-1',
      title: 'Part 1 — synthetic fixture',
      text: 'Synthetic bill text fixture. These are test characters, not proposed legislation.\n1 Short title\nThis section exercises selection and navigation.',
    },
    {
      id: 'schedule-1',
      title: 'Schedule 1 — synthetic fixture',
      text: `Synthetic schedule for the ${stage} test version. No legal provision is asserted by this fixture.\nThe final sentence remains visible.`,
    },
  ];
  const text = sections.map((s) => s.text).join('\n\n');
  const sha = createHash('sha256').update(text).digest('hex');
  let offset = 0;
  const id = `r7534-${stage}`;
  return {
    slug: `bill-text-${key}-${stage}`,
    title: 'Synthetic bill-text reader fixture',
    usermetadata: {
      classifications: [
        { labelset: 'kind', label: 'bill_text' },
        { labelset: 'bill_key', label: key },
      ],
    },
    origin: { url: 'https://example.org/synthetic-bill.pdf' },
    extra: {
      metadata: {
        bill_key: key,
        title: 'Synthetic bill-text reader fixture',
        version_id: id,
        source_version: id.replaceAll('-', '_'),
        stage,
        stage_label:
          stage === 'aspassed'
            ? 'As passed — synthetic fixture'
            : 'First reading — synthetic fixture',
        date: '2026-10-01',
        complete: true,
        source_url: 'https://example.org/synthetic-bill.pdf',
        characters: Array.from(text).length,
        source_text_sha256: sha,
        section_count: sections.length,
        section_offset_unit: 'utf16',
        sections: sections.map((s) => {
          const out = {
            id: s.id,
            title: s.title,
            start: offset,
            end: offset + s.text.length,
          };
          offset += s.text.length + 2;
          return out;
        }),
        codex_enrichment: {
          bill_key: key,
          version_id: id,
          source_sha256: sha,
          review_scope: 'selected-provisions',
          confidence: 'high',
          brief:
            'Synthetic overview fixture. This is not a description of an actual legal provision.',
          topics: ['justice-law'],
          evidence: [
            {
              topic: 'justice-law',
              quote: sections[0].text.slice(0, 75),
              section_id: 'part-1',
            },
          ],
          model: 'synthetic-fixture',
        },
      },
    },
    data: { texts: { body: field(text) } },
  };
}
// The 1990s federal speeches come from the Zenodo corpus with no official
// link: the KB origin url is '', which apiResource passes through. Labels and
// metadata mirror speech-18098; the body is the gambling report's pinned
// citation passage, not the full speech.
const zenodo = JSON.parse(
  fs.readFileSync(path.join(portal, 'public/reports/gambling.json')),
)
  .over_time.eras.flatMap((era) => era.sources)
  .find((s) => s.slug === 'speech-18098');
seeds[zenodo.slug] = {
  title: zenodo.title,
  origin: { collaborators: [zenodo.speaker], url: '' },
  usermetadata: {
    classifications: [
      { labelset: 'kind', label: 'speech' },
      { labelset: 'source', label: 'zenodo' },
      { labelset: 'state', label: zenodo.state },
      { labelset: 'party', label: zenodo.party },
      { labelset: 'chamber', label: 'representatives' },
      { labelset: 'decade', label: '1990s' },
    ],
  },
  extra: {
    metadata: { speech_id: 18098, date: zenodo.date, fixture: true },
  },
  computedmetadata: {
    field_classifications: [
      { classifications: [{ labelset: 'topic', label: 'gambling' }] },
    ],
  },
  data: {
    texts: {
      body: field(
        'Pinned report citation excerpt. This fixture does not include the full source document.\n\n' +
          zenodo.passage,
      ),
    },
  },
};
const billSeeds = [billSeed('aspassed'), billSeed('first-reps')];
billSeeds.forEach((seed) => (seeds[seed.slug] = seed));
async function generate() {
  const responses = {};
  for (const [slug, seed] of Object.entries(seeds)) {
    const api = vm.runInNewContext(
      ts.transpile(declarations + '\n' + fn) + '; apiResource',
      {
        Request,
        Response,
        URL,
        cacheRequest: () => new Request('https://opax.test/cache'),
        cacheBypass: () => true,
        kbFetch: async () => Response.json(seed),
        json: (x) => Response.json(x),
        cacheStore: () => {},
        withCacheStatus: (r) => r,
        RESOURCE_CACHE_TTL: 3600,
      },
    );
    const req = new Request('https://opax.test/api/resource/' + slug);
    responses['/api/resource/' + slug] = await (
      await api(req, new URL(req.url), slug, { CACHE_EPOCH: 'fixture' }, {})
    ).json();
  }
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(path.join(portal, 'src/bill-text.ts'), 'utf8'),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    { exports, Request, Response, URL, TextEncoder, crypto: webcrypto },
  );
  for (const id of [
    'index',
    ...billSeeds.map((s) => s.extra.metadata.version_id),
  ]) {
    const route = `/bill-texts/${key}/${id}.json`;
    const deps = {
      cache: { match: async () => undefined, put: async () => {} },
      waitUntil: () => {},
      kbFetch: async (p) =>
        Response.json(
          p === '/catalog'
            ? {
                resources: Object.fromEntries(billSeeds.map((s, i) => [i, s])),
                fulltext: { total: 2 },
              }
            : billSeeds.find((s) => p.includes(s.slug)),
        ),
    };
    responses[route] = await (
      await exports.handleBillText(
        new Request('https://opax.test' + route),
        deps,
      )
    ).json();
    if (id === 'index')
      responses[route].generated_at = '2026-10-07T00:00:00.000Z';
  }
  responses['/api/recent'] = {
    items: Object.entries(seeds)
      .slice(0, 3)
      .map(([slug, seed]) => ({
        slug,
        title: seed.title,
        indexed: '2026-10-07T00:00:00.000Z',
      })),
  };
  responses['/api/search'] = {
    results: [
      {
        slug: speech.slug,
        title: seeds[speech.slug].title,
        speaker: speech.speaker,
        date: speech.date,
        snippet: 'Synthetic matching source.',
      },
      {
        slug: 'speech-999999998',
        title: 'Synthetic related speech fixture',
        speaker: 'Fixture speaker',
        date: '2026-10-01',
        snippet:
          'Synthetic related passage. This is not a parliamentary quotation.',
      },
    ],
  };
  fs.writeFileSync(
    path.join(__dirname, 'contracts.json'),
    JSON.stringify(
      {
        provenance: {
          record: 'portal/src/index.ts apiResource',
          billText: 'portal/src/bill-text.ts handleBillText',
          division: 'portal/public/bills/au-federal-r7534.json divisions[0]',
          notice:
            'Speech and bill source bodies and press release are explicitly synthetic, except speech-18098, which carries only the gambling report\'s pinned citation passage. No quoted statement or legal provision is invented for a real person.',
        },
        seeds,
        responses,
      },
      null,
      2,
    ) + '\n',
  );
}
generate().catch((e) => {
  process.stderr.write(String(e));
  process.exitCode = 1;
});
