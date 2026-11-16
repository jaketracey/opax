// Hearing transcript material in Ask: every passage carries who said it (their role as the transcript gives it), the
// hearing date, the page and the commission, to the writer and to the citation a reader sees.
//
// What these tests pin, with no model call: the typed facts the transcript tool returns, the writer prompt (the fixed
// rule and each passage's role, date and page), the claim plan (a transcript sentence the writer leaves unmarked gets
// one repair pass, then only that sentence goes), the citation built from the typed facts, and that nothing changes
// for an answer with no transcript source. What they cannot pin: the words a live model writes under the rule.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { MockLanguageModelV4 } from 'ai/test'

const built = await build({ stdin: { contents: [
  "export {excerpt, speakerRoles, carryInto, pageHits, textIndex} from './src/tools/transcript-text'",
  "export {callTool} from './src/tools/index'",
  "export * from './src/transcript-answer'",
  "export {writingFacts, writingPrompt, verifyWrittenAnswer, draftWrittenAnswer, unattributedTranscriptSentences, proseFallback, ANSWER_WRITING_VERSION} from './src/research-writing'",
  "export {createAnswerWriter} from './src/research-writer'",
  "export {groundAnswerPayload} from './src/research-grounding'",
  "export {auditPayload} from './src/research-claim-audit.mjs'",
  "export {runAgentic, resolveNamedScope} from './src/agentic-ask'",
  "export {createResearch} from './src/research-loop'",
].join(';'), resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'browser', format: 'esm', logLevel: 'silent' })
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))
const savedFetch = globalThis.fetch
globalThis.fetch = async () => { throw Error('Transcript attribution tests must not make network requests') }
test.after(() => { globalThis.fetch = savedFetch })
const cache = new Map()
const asset = async path => {
  if (!cache.has(path)) cache.set(path, JSON.parse(await readFile(new URL('../public' + path, import.meta.url), 'utf8')))
  return cache.get(path)
}
const env = { origin: 'https://opax.test', asset }
const LABEL = 'Hearing transcript: evidence, not findings'
const period = { kind: 'all', label: 'All time' }

// ---- pages shaped like each indexed commission's transcripts (invented words and names, the publishers' layouts)

// Robodebt layout: one appearance to a line, "for <party>" after a comma, "<NAME, SWORN", labelled turns.
const ROBODEBT = [
  { n: 1, folio: null, text: 'TRANSCRIPT OF PROCEEDINGS\nTHE HON ALEX EXAMPLE AC SC, Commissioner\nTHE ROYAL COMMISSION INTO THE ROBODEBT SCHEME\nTUESDAY, 28 FEBRUARY 2023 AT 10:02 AM (AEST)\nDAY 38\nMR JORDAN SAMPLE KC, Senior Counsel Assisting\nMS RILEY PLACEHOLDER SC, for the Commonwealth\nMR CASEY STANDIN SC, for the Hon Morgan Fixture' },
  { n: 2, folio: 'P-100', text: 'COMMISSIONER: Yes, Mr Sample.\nMR SAMPLE: I call Taylor Specimen.\n<TAYLOR JAMIE SPECIMEN, AFFIRMED\n<EXAMINATION BY MR SAMPLE KC\nMR SAMPLE: Did you see the legal advice about income averaging before the measure began?\nMS SPECIMEN: I did not see any legal advice about income averaging at that time.\nMS PLACEHOLDER: Commissioner, I object to the form of the question about averaging.\nTHE HON MORGAN FIXTURE: I recall the averaging brief only in general terms.' },
  { n: 3, folio: 'P-101', text: 'It was not something that was brought to my attention, and the averaging method was already in use by then.\nCOMMISSIONER: Thank you.\n<THE WITNESS WAS RELEASED' },
]
// Antisemitism layout: appearances wrapped over lines, the role closing the entry, a witness titled Commissioner.
const ANTISEMITISM = [
  { n: 1, folio: null, text: 'TRANSCRIPT OF PROCEEDINGS\nROYAL COMMISSION ON ANTISEMITISM\nAND SOCIAL COHESION\nWEDNESDAY, 01 JULY 2026\nAT 10:00AM (AEST)\nHEARING BLOCK 3, DAY 3\nTHE HONOURABLE ALEX EXAMPLE AC SC,\nCOMMISSIONER\nJORDAN SAMPLE SC WITH RILEY PLACEHOLDER AND\nCASEY STANDIN, COUNSEL\nASSISTING\nMORGAN FIXTURE SC, DREW MOCKUP SC, QUINN TEMPLATE,\nSAM DUMMY COUNSEL FOR THE COMMONWEALTH OF\nAUSTRALIA\nUNCLE ROWAN PROXY\nWELCOME TO COUNTRY' },
  { n: 2, folio: 'P-178', text: '<THE HEARING COMMENCED AT 10.00 AM\nCOMMISSIONER: Yes, Mr Standin.\nMR STANDIN: Our first witness is Commissioner Specimen.\n<TAYLOR SPECIMEN, SWORN\nMR STANDIN: How many reports about online abuse did your office receive last year?\nCOMMISSIONER SPECIMEN AM: We received more reports about online abuse than in any earlier year.\nMR MOCKUP SC: Commissioner, may I be heard on the tender of the abuse reports?\nUNCLE PROXY: I welcome everyone here to talk about online abuse today.' },
]
// NSW Healthcare Funding layout: roles in brackets, "for <party>", "sworn:" with a time, "Q." and "A." turns.
const NSW = [
  { n: 1, folio: null, text: 'Special Commission of Inquiry\ninto Healthcare Funding\nBefore: The Commissioner,\nMr Alex Example SC\nAt Level 2, 121 Macquarie Street,\nSydney, New South Wales\nTuesday, 20 February 2024 at 10.00am\n(Day 006)\nMr Jordan Sample SC (Senior Counsel Assisting)\nMr Riley Placeholder (Counsel Assisting_\nAlso present:\nMr Casey Standin SC with Ms Morgan Fixture for NSW Health' },
  { n: 2, folio: '601', text: '<TAYLOR JAMIE SPECIMEN, on former affirmation: [10am]\nTHE COMMISSIONER: You are on your affirmation from yesterday.\n<EXAMINATION BY MR PLACEHOLDER CONTINUING:\nMR PLACEHOLDER: Q. Can you explain how the duress alarms came to be installed at the unit?\nA. Yes. The duress alarms were installed after members raised the issue with the district, and they did not work reliably\nwhen we first tested them on the ward.\nQ. Who was told about the alarms failing?\nA. The district executive was told in writing.' },
  { n: 3, folio: '602', text: 'We also told the ministry about the staffing roster at the same meeting, and nothing changed for some months.\nMR STANDIN: I object, Commissioner.\n<THE WITNESS WITHDREW\n<DREW MOCKUP, sworn: [11.02am]\n<QUINN TEMPLATE, affirmed: [11.02am]\nMR SAMPLE: Q. Could each of you describe the funding model for the hospital?\nA. The funding model is activity based, with a block grant for the smaller sites.' },
]
const hit = (pages, n, words) => api.excerpt(pages.find(p => p.n === n).text, words, { carry: api.carryInto(pages, n), roleOf: api.speakerRoles(pages) })

test('Robodebt layout: commissioner, counsel assisting, a sworn witness and counsel for a party, each from the transcript itself', () => {
  const role = api.speakerRoles(ROBODEBT)
  assert.equal(role('COMMISSIONER'), 'commissioner'); assert.equal(role('MR SAMPLE'), 'counsel assisting')
  assert.equal(role('MS SPECIMEN'), 'witness'); assert.equal(role('MS PLACEHOLDER'), 'counsel for a party'); assert.equal(role('MR STANDIN'), 'counsel for a party')
  // "for the Hon Morgan Fixture" names a party someone appears for. Not sworn in this transcript, they have no role
  // here; they are never read as counsel.
  assert.equal(role('THE HON MORGAN FIXTURE'), undefined)
  assert.deepEqual(hit(ROBODEBT, 2, ['legal', 'advice']), { excerpt: 'Did you see the legal advice about income averaging before the measure began?', speaker: 'Mr Sample', speaker_label: 'MR SAMPLE', speaker_role: 'counsel assisting' })
  assert.deepEqual(hit(ROBODEBT, 2, ['object']), { excerpt: 'Commissioner, I object to the form of the question about averaging.', speaker: 'Ms Placeholder', speaker_label: 'MS PLACEHOLDER', speaker_role: 'counsel for a party' })
  assert.deepEqual(hit(ROBODEBT, 2, ['recall']), { excerpt: 'I recall the averaging brief only in general terms.', speaker: 'The Hon Morgan Fixture', speaker_label: 'THE HON MORGAN FIXTURE' })
  // A turn that runs over the page keeps the speaker who was already speaking.
  const carried = hit(ROBODEBT, 3, ['attention'])
  assert.equal(carried.speaker, 'The Hon Morgan Fixture'); assert.equal(carried.speaker_role, undefined)
  assert.equal(carried.excerpt, 'It was not something that was brought to my attention, and the averaging method was already in use by then.')
  // A word found only in a procedural line or a label opens the turn that follows; the line itself is never quoted.
  const marker = hit(ROBODEBT, 2, ['affirmed'])
  assert.doesNotMatch(marker.excerpt, /<|AFFIRMED|EXAMINATION/)
})

test('Antisemitism layout: wrapped appearances; a witness titled Commissioner is a witness, not the commissioner', () => {
  const role = api.speakerRoles(ANTISEMITISM)
  assert.equal(role('COMMISSIONER'), 'commissioner')
  for (const label of ['MR SAMPLE SC', 'MS PLACEHOLDER', 'MR STANDIN']) assert.equal(role(label), 'counsel assisting', label)
  for (const label of ['MR FIXTURE SC', 'MR MOCKUP SC', 'MS TEMPLATE', 'MR DUMMY']) assert.equal(role(label), 'counsel for a party', label)
  assert.equal(role('COMMISSIONER SPECIMEN AM'), 'witness')
  assert.equal(role('UNCLE PROXY'), undefined, 'a name above an unrelated line takes no role from it')
  assert.deepEqual(hit(ANTISEMITISM, 2, ['received']), { excerpt: 'We received more reports about online abuse than in any earlier year.', speaker: 'Commissioner Specimen AM', speaker_label: 'COMMISSIONER SPECIMEN AM', speaker_role: 'witness' })
  assert.equal(hit(ANTISEMITISM, 2, ['tender']).speaker_role, 'counsel for a party')
  assert.deepEqual(hit(ANTISEMITISM, 2, ['welcome']), { excerpt: 'I welcome everyone here to talk about online abuse today.', speaker: 'Uncle Proxy', speaker_label: 'UNCLE PROXY' })
})

test('NSW Healthcare Funding layout: an "A." is the sworn witness, a "Q." the examiner, across a page break', () => {
  const role = api.speakerRoles(NSW)
  assert.equal(role('THE COMMISSIONER'), 'commissioner'); assert.equal(role('MR SAMPLE'), 'counsel assisting'); assert.equal(role('MR PLACEHOLDER'), 'counsel assisting')
  assert.equal(role('MR STANDIN'), 'counsel for a party'); assert.equal(role('MS FIXTURE'), 'counsel for a party'); assert.equal(role('MS SPECIMEN'), 'witness')
  const answer = hit(NSW, 2, ['members'])
  assert.deepEqual({ speaker: answer.speaker, speaker_role: answer.speaker_role }, { speaker: 'Taylor Jamie Specimen', speaker_role: 'witness' })
  assert.match(answer.excerpt, /^Yes\. The duress alarms were installed after members raised the issue/)
  assert.doesNotMatch(answer.excerpt, /Q\.|A\.|Who was told/, 'one turn only: the next question is not part of the answer')
  assert.deepEqual(hit(NSW, 2, ['failing']), { excerpt: 'Who was told about the alarms failing?', speaker: 'Mr Placeholder', speaker_label: 'MR PLACEHOLDER', speaker_role: 'counsel assisting' })
  // The answer that began on the page before is still the witness's.
  const carried = hit(NSW, 3, ['ministry'])
  assert.deepEqual({ speaker: carried.speaker, speaker_role: carried.speaker_role }, { speaker: 'Taylor Jamie Specimen', speaker_role: 'witness' })
  // Two witnesses sworn together: an "A." is a witness's answer, and the transcript does not say which.
  const joint = hit(NSW, 3, ['activity'])
  assert.deepEqual(joint, { excerpt: 'The funding model is activity based, with a block grant for the smaller sites.', speaker_role: 'witness' })
  // Without the document (no roles, no earlier pages) the old behaviour holds: labels only, no role.
  assert.deepEqual(api.excerpt('MS SPECIMEN: I did not see it.', ['see']), { excerpt: 'I did not see it.', speaker: 'Ms Specimen', speaker_label: 'MS SPECIMEN' })
})

// ---- the published data: what it carries today

const SEARCHES = [['robodebt', 'cth-robodebt', 'income averaging'], ['antisemitism', 'cth-antisemitism', 'curriculum'], ['nsw-healthcare-funding', 'nsw-healthcare-funding', 'duress alarms']]
test('the three indexed commissions: every quoted passage has a page and a date; roles ride in the citation and read back typed', async () => {
  for (const [commission, id, words] of SEARCHES) {
    const out = await api.callTool(env, 'royal_commissions', { view: 'transcripts', commission, words, limit: 8 })
    let quoted = 0, withRole = 0
    for (const [i, row] of out.rows.entries()) {
      const hits = (row.text_matches?.hits ?? []).filter(h => h.excerpt !== null)
      if (!hits.length) continue
      assert.equal(row.commission_id, id); assert.match(String(row.date), /^\d{4}-\d{2}-\d{2}$/)
      const turns = api.transcriptTurns(out.citations[i + 1].text)
      assert.equal(turns.length, hits.length, out.citations[i + 1].text)
      for (const [n, h] of hits.entries()) {
        quoted++
        assert.ok(h.transcript_page, `${id} ${row.key}: page`)
        assert.ok(h.excerpt.length <= 290, 'the excerpt cap: 280 characters and its ellipses')
        if (h.speaker_role) withRole++
        const t = turns[n]
        assert.deepEqual({ speaker: t.speaker, role: t.role, page: t.page, pdf_page: t.pdf_page, commission: t.commission, excerpt: t.excerpt },
          { speaker: h.speaker ?? '', role: h.speaker_role, page: h.transcript_page, pdf_page: h.pdf_page, commission: row.commission, excerpt: h.excerpt })
        assert.match(t.date, /^\d{1,2} [A-Z][a-z]+ \d{4}$/)
      }
    }
    assert.ok(quoted >= 4, `${id}: ${quoted} quoted passages`)
    assert.ok(withRole >= quoted / 2, `${id}: ${withRole} of ${quoted} passages carry a role`)
  }
})

test('coverage of the published text: every quotable page has a page number; role coverage per commission stays above its floor', async () => {
  const ix = await asset('/transcripts/index.json')
  const LABELS = /(?<=^|\s)((?:(?:THE|MR|MS|MRS|MISS|DR|PROF|UNCLE|AUNTY) )?[A-Z][A-Za-z'’.-]*[A-Z](?: [A-Z][A-Za-z'’.-]*[A-Z]){0,3}):(?=\s)/g
  const seen = {}
  for (const row of ix.docs) {
    if (row.quote_policy !== 'quote') continue
    const doc = await asset(row.file), role = api.speakerRoles(doc.pages), c = seen[row.commission] ??= { pages: 0, unpaged: 0, turns: 0, roles: 0 }
    for (const page of doc.pages) {
      c.pages++; if (!page.folio) c.unpaged++
      for (const m of String(page.text).replace(/^[ \t]*<[^\n]*$/gm, ' ').replace(/\s+/g, ' ').matchAll(LABELS)) { c.turns++; if (role(m[1])) c.roles++ }
    }
    cache.delete(row.file)
  }
  // Measured 16 Nov 2026 (labelled turns given a role): Robodebt 97.8%, NSW Healthcare Funding 97.3%, Antisemitism 87.6%.
  // The rest are speakers the cover does not list and no witness line names: quoted with "the transcript records".
  const floors = { 'cth-robodebt': 0.95, 'nsw-healthcare-funding': 0.95, 'cth-antisemitism': 0.85 }
  assert.deepEqual(Object.keys(seen).sort(), Object.keys(floors).sort())
  for (const [id, c] of Object.entries(seen)) {
    assert.equal(c.unpaged, 0, `${id}: every quotable page carries the transcript's page number`)
    assert.ok(c.roles / c.turns >= floors[id], `${id}: ${c.roles} of ${c.turns} labelled turns have a role`)
  }
})

// ---- the writer: typed facts, the fixed rule, the claim plan

const cite = (commission, title, date, turns) => `${commission}, ${title} (${date}), ${turns.map(([page, pdf, who, words]) => `transcript page ${page} (PDF page ${pdf}), hearing turn${who}: "${words}"`).join(' ')} ${LABEL}. © Commonwealth of Australia, licensed under CC BY 4.0.`
const ROBODEBT_CITE = cite('Royal Commission into the Robodebt Scheme', 'Transcript Hearing Day 46', '10 March 2023', [
  ['P-4899', 15, ' by Ms Specimen (witness)', 'Income averaging did not make sense to me.'],
  ['P-4933', 49, ' by Mr Sample (counsel assisting)', 'Do you agree that this approach described income averaging?']])
const ANTISEMITISM_CITE = cite('Royal Commission on Antisemitism and Social Cohesion', 'Transcript Day 3, Sydney', '1 July 2026', [
  ['P-180', 4, ' by Commissioner (commissioner)', 'What does the platform do when a report of abuse is made?'],
  ['P-181', 5, ' by Ms Placeholder SC (counsel for a party)', 'The State does not oppose the tender of the report.']])
const NSW_CITE = cite('Special Commission of Inquiry into Healthcare Funding', 'Day 006 – 20 February 2024', '20 February 2024', [
  ['601', 3, ' (witness)', 'The duress alarms did not work reliably when we first tested them.'],
  ['640', 42, ' by Ms Fixture', 'The roster was changed without notice to the ward.']])
const GRANT = 'Example Health Ltd was awarded a grant of $120,000 by the Department of Health in 2023-24.'
const fact = (id, text, url) => ({ id, text, cite: { kind: 'record', url, label: text } })
const transcriptFacts = () => api.writingFacts(undefined, [fact(1, ROBODEBT_CITE, 'https://robodebt.royalcommission.gov.au/day46.pdf#page=15'), fact(2, ANTISEMITISM_CITE, 'https://asc.royalcommission.gov.au/day3.pdf#page=4'), fact(3, NSW_CITE, 'https://healthcarefunding.specialcommission.nsw.gov.au/TRA.0006.pdf#page=3')])
const mixedFacts = () => api.writingFacts(undefined, [fact(1, ROBODEBT_CITE, 'https://robodebt.royalcommission.gov.au/day46.pdf#page=15'), fact(2, GRANT, 'https://opax.test/grants/example')])
const plainFacts = () => api.writingFacts(undefined, [fact(1, GRANT, 'https://opax.test/grants/example')])
const question = 'What was said about income averaging at the Robodebt Royal Commission?'

const RULE = ' A fact with an attribution field comes from a hearing transcript: it is evidence, not a finding. Attribute every statement taken from one to who said it and where, using the field\'s speaker_role, hearing_date and transcript_page: "a witness told the Commission on 10 March 2023 (page 41) that …", "counsel assisting put to the witness on 10 March 2023 (page 41) that …". Name the speaker only when the field gives a speaker. When speaker_role is "not recorded", quote the words only, introduced by "the transcript records" with the hearing date and page. Never state evidence, an allegation or a question put by counsel as fact. Do not characterise anyone\'s credibility. Do not draw conclusions the commission has not published as findings. Quote at most 280 characters, from one speaker\'s turn. Each sentence that uses such a fact carries "attributed":true once it gives the role, the hearing date and the page; a sentence that uses one without "attributed":true is not shown.'

test('the writer rule for transcript sources is fixed text', () => {
  assert.equal(api.TRANSCRIPT_ATTRIBUTION_RULE, RULE)
  assert.doesNotMatch(RULE, /—/)
})

test('the writer prompt for a transcript-sourced answer holds the rule and each passage\'s role, date, page and commission', () => {
  const facts = transcriptFacts(), prompt = JSON.parse(api.writingPrompt({ question, period, facts }))
  assert.ok(prompt.contract.includes(RULE))
  assert.equal(facts.length, 6)
  const attributions = prompt.facts.map(f => f.attribution)
  const plan = { source: 'hearing_transcript', status: 'evidence_not_finding', claim: 'attributed' }
  assert.deepEqual(attributions, [
    { ...plan, speaker_role: 'witness', speaker: 'Ms Specimen', commission: 'Royal Commission into the Robodebt Scheme', hearing_date: '10 March 2023', hearing_day: '46', transcript_page: 'P-4899' },
    { ...plan, speaker_role: 'counsel assisting', speaker: 'Mr Sample', commission: 'Royal Commission into the Robodebt Scheme', hearing_date: '10 March 2023', hearing_day: '46', transcript_page: 'P-4933' },
    { ...plan, speaker_role: 'commissioner', speaker: 'Commissioner', commission: 'Royal Commission on Antisemitism and Social Cohesion', hearing_date: '1 July 2026', hearing_day: '3', transcript_page: 'P-180' },
    { ...plan, speaker_role: 'counsel for a party', speaker: 'Ms Placeholder SC', commission: 'Royal Commission on Antisemitism and Social Cohesion', hearing_date: '1 July 2026', hearing_day: '3', transcript_page: 'P-181' },
    // An "A." answer where two witnesses are sworn: a witness, unnamed.
    { ...plan, speaker_role: 'witness', commission: 'Special Commission of Inquiry into Healthcare Funding', hearing_date: '20 February 2024', hearing_day: '006', transcript_page: '601' },
    // A speaker the transcript gives no role: quoted with "the transcript records", never as a bare claim.
    { ...plan, speaker_role: 'not recorded', speaker: 'Ms Fixture', commission: 'Special Commission of Inquiry into Healthcare Funding', hearing_date: '20 February 2024', hearing_day: '006', transcript_page: '640' },
  ])
  // Each fact's own text names the same things, and never the tool block or the licence line.
  assert.equal(prompt.facts[0].text, `Ms Specimen (witness) said at Royal Commission into the Robodebt Scheme on hearing day 46 (10 March 2023), transcript page P-4899: "Income averaging did not make sense to me.". ${LABEL}.`)
  assert.equal(prompt.facts[4].text, `A witness said at Special Commission of Inquiry into Healthcare Funding on hearing day 006 (20 February 2024), transcript page 601: "The duress alarms did not work reliably when we first tested them.". ${LABEL}.`)
  assert.equal(prompt.facts[5].text, `Ms Fixture said at Special Commission of Inquiry into Healthcare Funding on hearing day 006 (20 February 2024), transcript page 640: "The roster was changed without notice to the ward.". ${LABEL}.`)
  for (const f of prompt.facts) assert.doesNotMatch(f.text, /PDF page|©|CC BY/)
  // The fact lines read back to the same typed turns at every later boundary.
  for (const f of facts) assert.deepEqual(api.transcriptAttribution(api.transcriptTurns(f.text)[0]), api.transcriptAttribution(f.transcript))
  // The repair pass says what was missing, after the same rule.
  assert.ok(JSON.parse(api.writingPrompt({ question, period, facts }, true)).contract.includes(RULE + api.TRANSCRIPT_REPAIR_NOTE))
})

test('nothing changes for an answer with no transcript source', () => {
  const facts = plainFacts(), text = api.writingPrompt({ question: 'Which grants did Example Health receive?', period, facts }), prompt = JSON.parse(text)
  assert.doesNotMatch(text, /attribution|attributed|hearing transcript: it is evidence/)
  assert.equal(text, api.writingPrompt({ question: 'Which grants did Example Health receive?', period, facts }, true), 'a repair pass adds nothing without a transcript fact')
  assert.ok(prompt.contract.endsWith('under 180 words unless a requested annual or monthly series needs more.'))
  assert.equal(facts[0].source.title, GRANT); assert.equal(facts[0].source.transcript, undefined)
  // A sentence on a non-transcript fact needs no mark, and its payload has no transcript field or audit count.
  const raw = { answer_decision: 'answer', sentences: [{ text: 'Example Health Ltd was awarded a grant of $120,000 by the Department of Health in 2023-24.', facts: [1] }] }
  assert.equal(api.unattributedTranscriptSentences(raw, { question, period, facts }), 0)
  const out = api.verifyWrittenAnswer(raw, { question, period, facts })
  assert.equal(out.answer, raw.sentences[0].text)
  assert.ok(out.sources.every(s => !('transcript' in s)))
  assert.equal('attributions' in api.auditPayload('', out).counts, false)
})

test('the citation a reader sees is built from the typed facts: commission, hearing date, page and speaker role', () => {
  const facts = transcriptFacts()
  assert.deepEqual(facts.map(f => f.source.title), [
    `Royal Commission into the Robodebt Scheme, hearing transcript, 10 March 2023, page P-4899: A witness, Ms Specimen. ${LABEL}.`,
    `Royal Commission into the Robodebt Scheme, hearing transcript, 10 March 2023, page P-4933: Counsel assisting, Mr Sample. ${LABEL}.`,
    `Royal Commission on Antisemitism and Social Cohesion, hearing transcript, 1 July 2026, page P-180: The Commissioner. ${LABEL}.`,
    `Royal Commission on Antisemitism and Social Cohesion, hearing transcript, 1 July 2026, page P-181: Counsel for a party, Ms Placeholder SC. ${LABEL}.`,
    `Special Commission of Inquiry into Healthcare Funding, hearing transcript, 20 February 2024, page 601: A witness. ${LABEL}.`,
    `Special Commission of Inquiry into Healthcare Funding, hearing transcript, 20 February 2024, page 640: Ms Fixture, speaker's role not recorded. ${LABEL}.`,
  ])
  // Each card opens its own page of the publisher's PDF.
  assert.deepEqual(facts.slice(0, 2).map(f => f.source.url), ['https://robodebt.royalcommission.gov.au/day46.pdf#page=15', 'https://robodebt.royalcommission.gov.au/day46.pdf#page=49'])
  // A loose sentence (wrong date, no page) changes nothing on the card: date, page and role come from the record.
  const loose = { answer_decision: 'answer', sentences: [{ text: 'A witness said in early 2022 that income averaging did not make sense to her.', facts: [1], attributed: true }] }
  const out = api.groundAnswerPayload(api.verifyWrittenAnswer(loose, { question, period, facts }), question)
  const card = out.sources.find(s => s.cited)
  assert.equal(card.title, `Royal Commission into the Robodebt Scheme, hearing transcript, 10 March 2023, page P-4899: A witness, Ms Specimen. ${LABEL}.`)
  assert.deepEqual(card.transcript, { source: 'hearing_transcript', status: 'evidence_not_finding', claim: 'attributed', speaker_role: 'witness', speaker: 'Ms Specimen', commission: 'Royal Commission into the Robodebt Scheme', hearing_date: '10 March 2023', hearing_day: '46', transcript_page: 'P-4899' })
  assert.equal(card.url, 'https://robodebt.royalcommission.gov.au/day46.pdf#page=15')
  assert.match(card.snippet, /CC BY 4\.0/, 'the licence line stays on the card')
})

test('with no model, each passage is quoted with its role, date and page; no role means "The transcript records"', () => {
  const out = api.proseFallback({ question, period, facts: transcriptFacts() })
  assert.equal(out.answer, [
    'A witness, Ms Specimen, said on 10 March 2023 (page P-4899): “Income averaging did not make sense to me.”',
    'Counsel assisting, Mr Sample, asked on 10 March 2023 (page P-4933): “Do you agree that this approach described income averaging?”',
    'The Commissioner asked on 1 July 2026 (page P-180): “What does the platform do when a report of abuse is made?”',
    'Counsel for a party, Ms Placeholder SC, said on 1 July 2026 (page P-181): “The State does not oppose the tender of the report.”',
    'These are from hearing transcripts: evidence, not findings.',
  ].join('\n\n'))
  const nsw = api.proseFallback({ question, period, facts: api.writingFacts(undefined, [fact(1, NSW_CITE, 'https://healthcarefunding.specialcommission.nsw.gov.au/TRA.0006.pdf#page=3')]) })
  assert.equal(nsw.answer.split('\n\n')[0], 'A witness said on 20 February 2024 (page 601): “The duress alarms did not work reliably when we first tested them.”')
  assert.equal(nsw.answer.split('\n\n')[1], 'The transcript records Ms Fixture saying on 20 February 2024 (page 640): “The roster was changed without notice to the ward.”')
  assert.equal(nsw.answer_decision, 'answer')
})

test('claim plan: a transcript sentence without the attributed mark is left out, and only that sentence', () => {
  const input = { question, period, facts: mixedFacts() }
  assert.equal(input.facts.length, 3)
  const grant = { text: 'Example Health Ltd was awarded a grant of $120,000 by the Department of Health in 2023-24.', facts: [3] }
  const marked = { text: 'A witness, Ms Specimen, told the Commission on 10 March 2023 (page P-4899) that income averaging did not make sense to her.', facts: [1], attributed: true }
  const bare = { text: 'Income averaging did not make sense.', facts: [1] }
  assert.equal(api.unattributedTranscriptSentences({ sentences: [grant, marked, bare] }, input), 1)
  const out = api.verifyWrittenAnswer({ answer_decision: 'answer', sentences: [bare, marked, grant] }, input)
  assert.equal(out.answer, `${marked.text}\n\n${grant.text}`)
  // The stopped-writer draft follows the same plan.
  assert.equal(api.draftWrittenAnswer({ answer_decision: 'answer', sentences: [bare, grant] }, input).answer, grant.text)
  // Every sentence unmarked: nothing is verified, and the caller falls back to the passages as recorded.
  assert.equal(api.verifyWrittenAnswer({ answer_decision: 'answer', sentences: [bare] }, input), null)
  // The audit both sides share records the attributed claim, and a transcript passage cited without its typed
  // attribution as an unsupported one.
  const audit = api.auditPayload(question, out)
  assert.equal(audit.counts.attributions, 1)
  assert.deepEqual(audit.claims.filter(c => c.type === 'attribution').map(c => [c.entity, c.value, c.status]), [['Ms Specimen', 'P-4899', 'supported']])
  const raw = { answer: 'Income averaging did not make sense.', citations: { 'fact-1/t/body/0': [[0, 36]] }, sources: [{ resource: 'fact-1', slug: '', kind: 'record', title: ROBODEBT_CITE, snippet: ROBODEBT_CITE, url: 'https://robodebt.royalcommission.gov.au/day46.pdf#page=15', href: '', cited: true }] }
  const unsupported = api.auditPayload(question, raw)
  assert.deepEqual(unsupported.findings.filter(c => c.type === 'attribution').map(c => c.status), ['unverified'])
})

const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } }
const written = sentences => ({ content: [{ type: 'text', text: JSON.stringify({ answer_decision: 'answer', sentences }) }], finishReason: { unified: 'stop', raw: 'stop' }, usage, warnings: [] })
const dailyBudget = { reserve: async () => ({ settle: async () => {} }) }
async function write(replies, facts) {
  let turn = 0
  const model = new MockLanguageModelV4({ doGenerate: async () => written(replies[Math.min(turn++, replies.length - 1)]) })
  const out = await api.createAnswerWriter({ model, dailyBudget, modelBudgetSpent: async () => false })({ question, period, facts }, { rounds: 0, tokens: { input: 0, output: 0 }, turns: [] }, undefined, 20000)
  const prompts = model.doGenerateCalls.map(call => JSON.stringify(call.prompt))
  return { out, prompts }
}

test('an unmarked transcript sentence gets one repair pass; the repaired draft is the answer', async () => {
  const bare = { text: 'Income averaging did not make sense.', facts: [1] }
  const marked = { text: 'A witness, Ms Specimen, told the Commission on 10 March 2023 (page P-4899) that income averaging did not make sense to her.', facts: [1], attributed: true }
  const grant = { text: 'Example Health Ltd was awarded a grant of $120,000 by the Department of Health in 2023-24.', facts: [3] }
  const { out, prompts } = await write([[bare, grant], [marked, grant]], mixedFacts())
  assert.equal(prompts.length, 2)
  assert.ok(!prompts[0].includes('Your last draft used a hearing transcript fact')); assert.ok(prompts[1].includes('Your last draft used a hearing transcript fact'))
  assert.match(out.answer, /^A witness, Ms Specimen, told the Commission on 10 March 2023 \(page P-4899\)/)
  assert.match(out.answer, /\$120,000/)
})

test('still unmarked after the repair pass: that sentence alone goes, and a mixed answer keeps its other claims', async () => {
  const bare = { text: 'Income averaging did not make sense.', facts: [1] }
  const grant = { text: 'Example Health Ltd was awarded a grant of $120,000 by the Department of Health in 2023-24.', facts: [3] }
  const { out, prompts } = await write([[bare, grant]], mixedFacts())
  assert.equal(prompts.length, 2, 'one repair pass, no more')
  assert.doesNotMatch(out.answer, /did not make sense/)
  assert.match(out.answer, /Example Health Ltd was awarded a grant of \$120,000/)
  assert.equal(out.answer_decision, 'answer')
})

test('never an empty answer: with every transcript sentence unmarked, the passages are quoted as recorded', async () => {
  const { out, prompts } = await write([[{ text: 'Income averaging did not make sense.', facts: [1] }]], api.writingFacts(undefined, [fact(1, ROBODEBT_CITE, 'https://robodebt.royalcommission.gov.au/day46.pdf#page=15')]))
  assert.equal(prompts.length, 2)
  assert.match(out.answer, /^A witness, Ms Specimen, said on 10 March 2023 \(page P-4899\): “Income averaging did not make sense to me\.”/)
  assert.match(out.answer, /Counsel assisting, Mr Sample, asked on 10 March 2023 \(page P-4933\)/)
  assert.equal(out.answer_decision, 'answer')
})

test('a marked transcript answer is written in one pass, and no transcript-free answer is ever sent to repair', async () => {
  const marked = { text: 'Counsel assisting, Mr Sample, put to the witness on 10 March 2023 (page P-4933) that the approach described income averaging.', facts: [2], attributed: true }
  const one = await write([[marked]], mixedFacts())
  assert.equal(one.prompts.length, 1); assert.match(one.out.answer, /^Counsel assisting, Mr Sample, put to the witness/)
  const plain = await write([[{ text: 'Example Health Ltd was awarded a grant of $120,000 by the Department of Health in 2023-24.', facts: [1] }]], plainFacts())
  assert.equal(plain.prompts.length <= 1, true)
  assert.ok(plain.prompts.every(p => !p.includes('attribution field')))
})

// ---- the research loop: a point never words a transcript passage itself

test('a point that cites a transcript excerpt selects the record for the writer; the point\'s own wording is not used', async () => {
  const q = 'What is on the record about income averaging in the Robodebt scheme?'
  const reply = (toolName, args) => ({ content: [{ type: 'tool-call', toolName, toolCallId: toolName, input: JSON.stringify(args) }], finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage, warnings: [] })
  const records = await api.callTool(env, 'royal_commissions', { view: 'transcripts', commission: 'robodebt', words: 'income averaging', limit: 1 })
  const turn = api.transcriptTurns(records.citations[1].text)[0]
  for (const point of [{ id: 'fact-2', claim: 'The department knew income averaging was unlawful.' }, { id: 'unknown-document', quote: turn.excerpt, claim: 'The department knew income averaging was unlawful.' }]) {
    let call = 0
    const model = new MockLanguageModelV4({ doGenerate: async () => call++ === 0 ? reply('royal_commissions', { view: 'transcripts', commission: 'robodebt', words: 'income averaging', limit: 1 })
      : call === 2 ? reply('answer', { points: [point] }) : written([{ text: 'The department knew income averaging was unlawful.', facts: [1] }]) })
    const research = api.createResearch({ model, dailyBudget, modelBudgetSpent: async () => false })
    const out = await api.runAgentic(q, { origin: 'https://offline.test', asset, research, kb: async () => ({ resources: {} }), generate: async () => { throw Error('Must not invoke the planner') } }, async () => {}, 40000, undefined, {}, await api.resolveNamedScope(q, { asset }))
    assert.equal(out.answered, true, JSON.stringify(out.research?.rejections ?? []))
    assert.doesNotMatch(out.answer, /knew income averaging was unlawful/, JSON.stringify(point))
    assert.match(out.answer, /^(?:A witness|Counsel assisting|The Commissioner|Counsel for a party|The transcript records)[^\n]* on 10 March 2023 \(page P-\d+\): “/)
    const cards = out.qualitative.sources.filter(s => s.cited && !s.coverage)
    assert.ok(cards.length && cards.every(s => s.transcript?.claim === 'attributed' && /hearing transcript, 10 March 2023, page P-\d+: /.test(s.title)), JSON.stringify(cards.map(s => s.title)))
  }
})
