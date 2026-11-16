// Hearing transcript material in Ask: every passage carries the speaker's role (where the page itself settles it),
// the hearing date, the page and the commission, to the writer and to the citation a reader sees. No passage names
// its speaker: a role, or "the transcript records".
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
  "export {excerpt, pageTurns, pageHits, textIndex} from './src/tools/transcript-text'",
  "export {transcriptRoles, answeredQuestion} from './src/tools/transcript-roles'",
  "export {callTool} from './src/tools/index'",
  "export * from './src/transcript-answer'",
  "export {writingFacts, writingPrompt, verifyWrittenAnswer, draftWrittenAnswer, unattributedTranscriptSentences, wordedTranscriptFact, proseFallback, ANSWER_WRITING_VERSION} from './src/research-writing'",
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
// Later pages of the same NSW day. Page 4 runs on from the answer on page 3 and holds one "Q." and no "A."; page 5
// runs on from that question and holds one "A." and no "Q."; page 6 has a witness leave and the next sworn by video
// link, a line in a form the first pattern missed; page 7 has a "<" line no pattern places.
const NSW_LATER = [
  ...NSW,
  { n: 4, folio: '603', text: 'grant, and the smaller sites report against it each quarter to the district, which is how the shortfall was found.\nQ. What did the district do once the shortfall in the quarterly reports was found, and who decided\nthat the reserve would be used to meet it for the rest of that financial year?' },
  { n: 5, folio: '604', text: 'I ask because the board minutes record two different accounts of that decision about the reserve.\nA. The chief executive decided it, and the board was told at its next meeting in the ordinary way.' },
  { n: 6, folio: '605', text: 'THE COMMISSIONER: Thank you both.\n<THE WITNESSES WITHDREW\n<ROWAN JOHN PROXY, VIA VIDEO-CONFERENCE, SWORN [12.02 pm]\n<EXAMINATION BY MR SAMPLE:\nMR SAMPLE: Q. What is your role at the pathology service?\nA. I am the director of the pathology service and have been since the merger.\nQ. When did the merger take effect?\nA. The merger took effect in the winter of that year.' },
  { n: 7, folio: '606', text: 'THE COMMISSIONER: We will take the next witness.\n<THE WITNESS WITHDREW\n<SAM DUMMY, BY TELEPHONE FROM THE REGIONAL OFFICE\nMR SAMPLE: Q. Can you hear us on the telephone line?\nA. I can hear you clearly on the telephone line.' },
]
const hit = (pages, n, words) => api.excerpt(pages.find(p => p.n === n).text, words, n, api.transcriptRoles(pages))
// Each turn of a page that has words, as its role or, with no role, what opens it.
const turnsOf = (pages, n) => { const parsed = api.pageTurns(pages.find(p => p.n === n).text, n), roleFor = api.transcriptRoles(pages); return parsed.turns.filter(t => t.end > t.start).map(t => roleFor(parsed, t) ?? `no role (${t.opens})`) }
const NAMES = /Specimen|Sample|Placeholder|Standin|Fixture|Mockup|Template|Dummy|Proxy|Example/

test('Robodebt layout: the commissioner by the role word, counsel by the cover page; a witness under their own name has no role', () => {
  // A turn that opens on the page under its own heading carries that speaker's role, and never a name.
  assert.deepEqual(hit(ROBODEBT, 2, ['legal', 'advice']), { excerpt: 'Did you see the legal advice about income averaging before the measure began?', speaker_role: 'counsel assisting' })
  assert.deepEqual(hit(ROBODEBT, 2, ['object']), { excerpt: 'Commissioner, I object to the form of the question about averaging.', speaker_role: 'counsel for a party' })
  assert.deepEqual(hit(ROBODEBT, 3, ['thank']), { excerpt: 'Thank you.', speaker_role: 'commissioner' })
  // The witness's heading is their name. No name is read from a "<" line to make them a witness, so there is no role.
  assert.deepEqual(hit(ROBODEBT, 2, ['time']), { excerpt: 'I did not see any legal advice about income averaging at that time.' })
  // "for the Hon Morgan Fixture" names a party someone appears for: never read as counsel.
  assert.deepEqual(hit(ROBODEBT, 2, ['recall']), { excerpt: 'I recall the averaging brief only in general terms.' })
  // A turn that runs over the page has no role there: nothing is carried across a page break.
  assert.deepEqual(hit(ROBODEBT, 3, ['attention']), { excerpt: 'It was not something that was brought to my attention, and the averaging method was already in use by then.' })
  assert.deepEqual(turnsOf(ROBODEBT, 2), ['commissioner', 'counsel assisting', 'counsel assisting', 'no role (heading)', 'counsel for a party', 'no role (heading)'])
  assert.deepEqual(turnsOf(ROBODEBT, 3), ['no role (page)', 'commissioner'])
  // A word found only in a procedural line is never quoted.
  assert.doesNotMatch(hit(ROBODEBT, 2, ['affirmed']).excerpt, /<|AFFIRMED|EXAMINATION/)
})

test('Antisemitism layout: wrapped appearances; a witness titled Commissioner is not the commissioner', () => {
  assert.deepEqual(hit(ANTISEMITISM, 2, ['many']), { excerpt: 'How many reports about online abuse did your office receive last year?', speaker_role: 'counsel assisting' })
  assert.deepEqual(hit(ANTISEMITISM, 2, ['tender']), { excerpt: 'Commissioner, may I be heard on the tender of the abuse reports?', speaker_role: 'counsel for a party' })
  // "COMMISSIONER <NAME>" is not the role word, and the name is one a "<" line prints: no role.
  assert.deepEqual(hit(ANTISEMITISM, 2, ['received']), { excerpt: 'We received more reports about online abuse than in any earlier year.' })
  // A name above an unrelated line of the cover takes no role from it.
  assert.deepEqual(hit(ANTISEMITISM, 2, ['welcome']), { excerpt: 'I welcome everyone here to talk about online abuse today.' })
  assert.deepEqual(turnsOf(ANTISEMITISM, 2), ['commissioner', 'counsel assisting', 'counsel assisting', 'no role (heading)', 'counsel for a party', 'no role (heading)'])
})

test('NSW Healthcare Funding layout: an "A." is a witness, a bare "Q." is a question with no asker, "HEADING: Q." has the heading\'s role', () => {
  // "MR PLACEHOLDER: Q." is that heading's question. The bare "Q." after it prints no speaker: a question, no asker.
  assert.deepEqual(hit(NSW, 2, ['explain']), { excerpt: 'Can you explain how the duress alarms came to be installed at the unit?', speaker_role: 'counsel assisting' })
  assert.deepEqual(hit(NSW, 2, ['failing']), { excerpt: 'Who was told about the alarms failing?', speaker_role: 'question' })
  const answer = hit(NSW, 2, ['members'])
  assert.deepEqual(Object.keys(answer).sort(), ['excerpt', 'speaker_role']); assert.equal(answer.speaker_role, 'witness')
  assert.match(answer.excerpt, /^Yes\. The duress alarms were installed after members raised the issue/)
  assert.doesNotMatch(answer.excerpt, /Q\.|A\.|Who was told/, 'one turn only: the next question is not part of the answer')
  // The answer that began on the page before has no role on this page.
  assert.deepEqual(hit(NSW, 3, ['ministry']), { excerpt: 'We also told the ministry about the staffing roster at the same meeting, and nothing changed for some months.' })
  // Two witnesses sworn together: an "A." is a witness's answer, and nobody is named.
  assert.deepEqual(hit(NSW, 3, ['activity']), { excerpt: 'The funding model is activity based, with a block grant for the smaller sites.', speaker_role: 'witness' })
  assert.deepEqual(turnsOf(NSW, 2), ['commissioner', 'counsel assisting', 'witness', 'question', 'witness'])
  assert.deepEqual(turnsOf(NSW, 3), ['no role (page)', 'counsel for a party', 'counsel assisting', 'witness'])
  // Without the transcript's roles: the words only.
  assert.deepEqual(api.excerpt('MS SPECIMEN: I did not see it.', ['see']), { excerpt: 'I did not see it.' })
})

test('review P1-1: no answer is given a witness\'s name, and no "<" line makes anyone a witness', () => {
  // Page 6: the witness is sworn by a line with a clause between the name and "SWORN". The first version missed it
  // and gave every "A." after it the name of the witness sworn pages earlier. Page 7: a "<" line in no known form.
  for (const [n, words] of [[6, ['director']], [6, ['winter']], [7, ['clearly']]]) assert.deepEqual(Object.keys(hit(NSW_LATER, n, words)).sort().join() + ' ' + hit(NSW_LATER, n, words).speaker_role, 'excerpt,speaker_role witness')
  assert.deepEqual(turnsOf(NSW_LATER, 6), ['commissioner', 'counsel assisting', 'witness', 'question', 'witness'])
  // No excerpt on any page of any layout carries more than its words and a role.
  for (const pages of [ROBODEBT, ANTISEMITISM, NSW_LATER]) for (const page of pages.slice(1)) for (const word of page.text.toLowerCase().match(/[a-z]{6,}/g)) {
    const out = hit(pages, page.n, [word])
    assert.ok(Object.keys(out).every(k => k === 'excerpt' || k === 'speaker_role'), Object.keys(out).join())
    assert.doesNotMatch(out.excerpt, /[\u0000-\u0008]/)
  }
  // Counsel whose surname a "<" line also prints (a witness of the same name) takes no role from the cover.
  const twin = [NSW[0], { n: 2, folio: '700', text: '<JAMIE SAMPLE, sworn: [10am]\nMR PLACEHOLDER: Q. What is your name?\nA. Jamie Sample.\nQ. Your role?\nA. Director.\nQ. Since when?\nA. Since 2020.\nMR SAMPLE: May I be heard?' }]
  assert.deepEqual(turnsOf(twin, 2), ['counsel assisting', 'witness', 'question', 'witness', 'question', 'witness', 'no role (heading)'])
  // A line that opens "A." in a transcript not printed as questions and answers is not an answer.
  assert.deepEqual(turnsOf([ROBODEBT[0], { n: 2, folio: 'P-8', text: 'MR SAMPLE: The schedule has two parts.\nA. The first part lists the payments.' }], 2), ['counsel assisting', 'no role (mark)'])
  // Two turns running under one heading: one may be the publisher's slip, so neither has a role.
  const slip = [ROBODEBT[0], { n: 2, folio: 'P-9', text: 'COMMISSIONER: Yes.\nMR SAMPLE: Did you read the brief?\nMR SAMPLE: I read it that week.\nCOMMISSIONER: Thank you.' }]
  assert.deepEqual(turnsOf(slip, 2), ['commissioner', 'no role (heading)', 'no role (heading)', 'commissioner'])
})

test('review P1-2: across a page break a question and an answer never swap speakers; nothing is carried to a "Q." or an "A."', () => {
  // Page 4: the top runs on from the witness's answer on page 3, then one "Q." and no "A.". The first version gave
  // the top to the examiner and the question to the witness.
  assert.deepEqual(hit(NSW_LATER, 4, ['quarter']), { excerpt: 'grant, and the smaller sites report against it each quarter to the district, which is how the shortfall was found.' })
  const question = hit(NSW_LATER, 4, ['reserve'])
  assert.equal(question.speaker_role, 'question'); assert.match(question.excerpt, /the reserve would be used/)
  assert.doesNotMatch(question.excerpt, /shortfall was found\.|Q\./, 'the question does not run on from the answer above it')
  // Page 5: the top runs on from that question, then one "A." and no "Q.".
  assert.deepEqual(hit(NSW_LATER, 5, ['minutes']), { excerpt: 'I ask because the board minutes record two different accounts of that decision about the reserve.' })
  assert.deepEqual(hit(NSW_LATER, 5, ['executive']), { excerpt: 'The chief executive decided it, and the board was told at its next meeting in the ordinary way.', speaker_role: 'witness' })
  assert.deepEqual(turnsOf(NSW_LATER, 4), ['no role (page)', 'question']); assert.deepEqual(turnsOf(NSW_LATER, 5), ['no role (page)', 'witness'])
  // The published page this is shaped on prints "THE COMMISSIONER: Q.", an answer, then a bare "Q.": nothing printed
  // says who asked the second, so it is a question with no asker, never the Commissioner's or counsel's.
  const broken = [NSW[0], { n: 2, folio: '710', text: 'MR SAMPLE: Q. Was the alarm tested?\nA. It was.\nTHE COMMISSIONER: Q. When?\nA. In the spring.\nQ. Was that before the ward opened?\nA. Before it opened.' }]
  assert.deepEqual(turnsOf(broken, 2), ['counsel assisting', 'witness', 'commissioner', 'witness', 'question', 'witness'])
  // A heading in title case is counsel addressing someone, not that person speaking; a bare role word in title case is the role.
  const addressed = [NSW[0], { n: 2, folio: '711', text: 'MR SAMPLE: Thank you.\nMr Standin: at the time you were the director, were you not?\nCommissioner: Yes, go on.' }]
  assert.deepEqual(turnsOf(addressed, 2).filter(r => r !== 'counsel assisting').every(r => r === 'commissioner' || r.startsWith('no role')), true)
  assert.ok(!turnsOf(addressed, 2).includes('counsel for a party'))
})

// ---- the published data: what it carries today

const SEARCHES = [['robodebt', 'cth-robodebt', 'income averaging'], ['antisemitism', 'cth-antisemitism', 'curriculum'], ['nsw-healthcare-funding', 'nsw-healthcare-funding', 'duress alarms']]
test('the three indexed commissions: every quoted passage has a page, a date and its commission\'s record id; a role rides in the citation and reads back typed, with no name', async () => {
  let withRole = 0
  for (const [commission, id, words] of SEARCHES) {
    const out = await api.callTool(env, 'royal_commissions', { view: 'transcripts', commission, words, limit: 8 })
    let quoted = 0
    for (const [i, row] of out.rows.entries()) {
      const hits = (row.text_matches?.hits ?? []).filter(h => h.excerpt !== null)
      if (!hits.length) continue
      assert.equal(row.commission_id, id); assert.match(String(row.date), /^\d{4}-\d{2}-\d{2}$/)
      const turns = api.transcriptTurns(out.citations[i + 1].text)
      assert.equal(turns.length, hits.length, out.citations[i + 1].text)
      assert.doesNotMatch(out.citations[i + 1].text, /hearing turn by /)
      for (const [n, h] of hits.entries()) {
        quoted++
        assert.ok(h.transcript_page, `${id} ${row.key}: page`)
        assert.ok(h.excerpt.length <= 290, 'the excerpt cap: 280 characters and its ellipses')
        if (h.speaker_role) withRole++
        const t = turns[n]
        assert.deepEqual({ role: t.role, page: t.page, pdf_page: t.pdf_page, commission: t.commission, source: t.source, excerpt: t.excerpt },
          { role: h.speaker_role, page: h.transcript_page, pdf_page: h.pdf_page, commission: row.commission, source: id, excerpt: h.excerpt })
        assert.deepEqual(Object.keys(h).sort(), ['excerpt', 'pdf_page', 'transcript_page', 'url', ...(h.speaker_role ? ['speaker_role'] : []), ...(h.question ? ['question'] : [])].sort(), 'a hit carries its words, its page, at most a role and, for a one-line answer, its question')
        // Hub ruling: the source title that reaches the follow-ups model (and the card) is commission, hearing,
        // date, page and a role from a fixed list. No heading text, so no name, can be in it.
        for (const f of api.writingFacts(undefined, [fact(1, out.citations[i + 1].text, h.url)])) assert.match(f.source.title, new RegExp(`^${row.commission.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, hearing transcript, \\d{1,2} [A-Z][a-z]+ \\d{4}, page \\S+: (?:A witness|Counsel assisting|The Commissioner|Counsel for a party|A question was put|speaker's role not recorded)\\. ${LABEL}\\.$`))
        assert.doesNotMatch(h.excerpt, /[\u0000-\u0008]/); assert.equal(api.writerMayWord(t), true)
        assert.match(t.date, /^\d{1,2} [A-Z][a-z]+ \d{4}$/)
      }
    }
    assert.ok(quoted >= 4, `${id}: ${quoted} quoted passages`)
  }
  assert.ok(withRole >= 3, `${withRole} passages carry a role`)
})

test('coverage of the published text: every quotable page has a page number; the share of turns with a role stays above its floor', async () => {
  const ix = await asset('/transcripts/index.json')
  const seen = {}
  for (const row of ix.docs) {
    if (row.quote_policy !== 'quote') continue
    const doc = await asset(row.file), roleFor = api.transcriptRoles(doc.pages), c = seen[row.commission] ??= { pages: 0, unpaged: 0, turns: 0, roles: 0, carried: 0 }
    for (const page of doc.pages) {
      c.pages++; if (!page.folio) c.unpaged++
      const parsed = api.pageTurns(String(page.text), page.n)
      for (const t of parsed.turns) {
        if (t.end <= t.start) continue
        const role = roleFor(parsed, t)
        c.turns++; if (role) c.roles++
        // Never a role on text that runs on from the page before or that follows a "<" line.
        if (role && (t.opens === 'page' || t.opens === 'note')) c.carried++
      }
    }
    cache.delete(row.file)
  }
  // Measured 16 Nov 2026 (scripts/transcript-parser-audit.mjs). The rest are quoted with "the transcript records".
  const floors = { 'cth-robodebt': 0.45, 'nsw-healthcare-funding': 0.7, 'cth-antisemitism': 0.36 }
  assert.deepEqual(Object.keys(seen).sort(), Object.keys(floors).sort())
  for (const [id, c] of Object.entries(seen)) {
    assert.equal(c.unpaged, 0, `${id}: every quotable page carries the transcript's page number`)
    assert.equal(c.carried, 0, `${id}: no role is carried`)
    assert.ok(c.roles / c.turns >= floors[id], `${id}: ${c.roles} of ${c.turns} turns have a role`)
  }
})

// ---- the writer: typed facts, the fixed rule, the claim plan

const cite = (commission, title, date, turns, record) => `${commission}, ${title} (${date}), ${turns.map(([page, pdf, who, words]) => `transcript page ${page} (PDF page ${pdf}), hearing turn${who}: "${words}"`).join(' ')} ${LABEL}. © Commonwealth of Australia, licensed under CC BY 4.0.${record ? ` Commission record: ${record}.` : ''}`
const ROBODEBT_CITE = cite('Royal Commission into the Robodebt Scheme', 'Transcript Hearing Day 46', '10 March 2023', [
  ['P-4899', 15, ' (witness)', 'Income averaging did not make sense to me.'],
  ['P-4933', 49, ' (counsel assisting)', 'Do you agree that this approach described income averaging?']], 'cth-robodebt')
const ANTISEMITISM_CITE = cite('Royal Commission on Antisemitism and Social Cohesion', 'Transcript Day 3, Sydney', '1 July 2026', [
  ['P-180', 4, ' (commissioner)', 'What does the platform do when a report of abuse is made?'],
  ['P-181', 5, ' (counsel for a party)', 'The State does not oppose the tender of the report.']], 'cth-antisemitism')
const NSW_CITE = cite('Special Commission of Inquiry into Healthcare Funding', 'Day 006 – 20 February 2024', '20 February 2024', [
  ['601', 3, ' (witness)', 'The duress alarms did not work reliably when we first tested them.'],
  ['640', 42, '', 'The roster was changed without notice to the ward.']], 'nsw-healthcare-funding')
// The citation form before 16 November 2026 named the speaker ("hearing turn by ..."). Read today, the name is dropped.
const NAMED_CITE = cite('Royal Commission into the Robodebt Scheme', 'Transcript Hearing Day 46', '10 March 2023', [['P-4899', 15, ' by Ms Specimen (witness)', 'Income averaging did not make sense to me.']], 'cth-robodebt')
// A source Ask has no policy for (an invented id), and a passage with no record id at all: quoted by code only.
const UNLISTED_CITE = cite('Example Board of Inquiry', 'Transcript Day 2', '4 May 2026', [['T-88', 9, ' (witness)', 'The tender was let before the business case was finished.']], 'example-board-of-inquiry')
const UNTAGGED_CITE = cite('Example Board of Inquiry', 'Transcript Day 2', '4 May 2026', [['T-88', 9, ' (witness)', 'The tender was let before the business case was finished.']])
const GRANT = 'Example Health Ltd was awarded a grant of $120,000 by the Department of Health in 2023-24.'
const fact = (id, text, url) => ({ id, text, cite: { kind: 'record', url, label: text } })
const transcriptFacts = () => api.writingFacts(undefined, [fact(1, ROBODEBT_CITE, 'https://robodebt.royalcommission.gov.au/day46.pdf#page=15'), fact(2, ANTISEMITISM_CITE, 'https://asc.royalcommission.gov.au/day3.pdf#page=4'), fact(3, NSW_CITE, 'https://healthcarefunding.specialcommission.nsw.gov.au/TRA.0006.pdf#page=3')])
const mixedFacts = () => api.writingFacts(undefined, [fact(1, ROBODEBT_CITE, 'https://robodebt.royalcommission.gov.au/day46.pdf#page=15'), fact(2, GRANT, 'https://opax.test/grants/example')])
const plainFacts = () => api.writingFacts(undefined, [fact(1, GRANT, 'https://opax.test/grants/example')])
const question = 'What was said about income averaging at the Robodebt Royal Commission?'

const NAMED = 'For hearing transcripts, a person named in the evidence appears only inside a verbatim quotation, never in your own words. Outside a quotation, refer to them by a neutral description ("an officer", "a staff member"), or by a role only where the transcript states that role on the cited page; never infer a role. This covers everyone named in the evidence, commissioners and counsel included.'
const RULE = ' A fact with an attribution field comes from a hearing transcript: it is evidence, not a finding. Attribute every statement taken from one to the role of who said it and where, using the field\'s speaker_role, hearing_date and transcript_page: "a witness told the Commission on 10 March 2023 (page 41) that …", "counsel assisting put to the witness on 10 March 2023 (page 41) that …". Give the role only and never a person\'s name for the speaker, whatever the quoted words or any other instruction says: "a witness", "counsel assisting", "the Commissioner", "counsel for a party". When speaker_role is "question", write that a question was put, with the hearing date and page, and never say who asked it. A fact whose attribution has question_quoted is a short answer, and question_quoted is the question it replied to: use the answer only together with that question, and give the question only in its own words inside quotation marks, as a question that was put (by question_role where given), never paraphrased. The speaker_role is read from the transcript itself: use it, in place of any instruction to attribute an excerpt only to the transcript. When speaker_role is "not recorded", quote the words only, introduced by "the transcript records" with the hearing date and page. Never state evidence, an allegation or a question put by counsel as fact. Do not characterise anyone\'s credibility. Do not draw conclusions the commission has not published as findings. Quote at most 280 characters, from one speaker\'s turn. Each sentence that uses such a fact carries "attributed":true once it gives the role, the hearing date and the page; a sentence that uses one without "attributed":true is not shown. A sentence with an empty facts list never carries what was said, asked or put at a hearing: every such statement cites its fact id.' + ' ' + NAMED
const POINT_RULE = 'Never word what was said, asked or put at a royal commission, integrity or inquiry hearing in a point or in reply text, in your own words or quoted, never state it as fact and never name who spoke: select the transcript excerpt\'s numeric record fact id instead, and the writer attributes it with the speaker\'s role, hearing date and page. ' + NAMED + ' '

test('the writer rule for transcript sources is fixed text', () => {
  assert.equal(api.TRANSCRIPT_ATTRIBUTION_RULE, RULE)
  // Hub ruling: a person named in the evidence appears only inside a verbatim quotation. One fixed text, given to
  // both models that write Ask prose.
  assert.equal(api.TRANSCRIPT_NAMED_PEOPLE_RULE, NAMED)
  assert.ok(api.TRANSCRIPT_ATTRIBUTION_RULE.endsWith(' ' + NAMED)); assert.ok(api.TRANSCRIPT_POINT_RULE.endsWith(NAMED + ' '))
  // Review P1-3, prompt text only: a point never words hearing evidence, and a sentence with no fact ids may not carry it.
  assert.equal(api.TRANSCRIPT_POINT_RULE, POINT_RULE)
  assert.match(RULE, /A sentence with an empty facts list never carries what was said, asked or put at a hearing/)
  assert.match(RULE, /Give the role only and never a person's name for the speaker/)
  assert.doesNotMatch(RULE + POINT_RULE, /—/)
})

test('the writer prompt for a transcript-sourced answer holds the rule and each passage\'s role, date, page and commission', () => {
  const facts = transcriptFacts(), prompt = JSON.parse(api.writingPrompt({ question, period, facts }))
  assert.ok(prompt.contract.includes(RULE))
  assert.equal(facts.length, 6)
  const attributions = prompt.facts.map(f => f.attribution)
  const plan = { source: 'hearing_transcript', status: 'evidence_not_finding', claim: 'attributed' }
  const robodebt = { commission: 'Royal Commission into the Robodebt Scheme', commission_id: 'cth-robodebt', hearing_date: '10 March 2023', hearing_day: '46' }
  const antisemitism = { commission: 'Royal Commission on Antisemitism and Social Cohesion', commission_id: 'cth-antisemitism', hearing_date: '1 July 2026', hearing_day: '3' }
  const nsw = { commission: 'Special Commission of Inquiry into Healthcare Funding', commission_id: 'nsw-healthcare-funding', hearing_date: '20 February 2024', hearing_day: '006' }
  assert.deepEqual(attributions, [
    { ...plan, speaker_role: 'witness', ...robodebt, transcript_page: 'P-4899' },
    { ...plan, speaker_role: 'counsel assisting', ...robodebt, transcript_page: 'P-4933' },
    { ...plan, speaker_role: 'commissioner', ...antisemitism, transcript_page: 'P-180' },
    { ...plan, speaker_role: 'counsel for a party', ...antisemitism, transcript_page: 'P-181' },
    { ...plan, speaker_role: 'witness', ...nsw, transcript_page: '601' },
    // A turn whose speaker the page does not settle: quoted with "the transcript records", never as a bare claim.
    { ...plan, speaker_role: 'not recorded', ...nsw, transcript_page: '640' },
  ])
  // Each fact's own text gives the role, never a name, the tool block or the licence line.
  assert.equal(prompt.facts[0].text, `A witness said at Royal Commission into the Robodebt Scheme on hearing day 46 (10 March 2023), transcript page P-4899: "Income averaging did not make sense to me.". ${LABEL}. Commission record: cth-robodebt.`)
  assert.equal(prompt.facts[2].text, `The Commissioner said at Royal Commission on Antisemitism and Social Cohesion on hearing day 3 (1 July 2026), transcript page P-180: "What does the platform do when a report of abuse is made?". ${LABEL}. Commission record: cth-antisemitism.`)
  assert.equal(prompt.facts[5].text, `The transcript records at Special Commission of Inquiry into Healthcare Funding on hearing day 006 (20 February 2024), transcript page 640: "The roster was changed without notice to the ward.". ${LABEL}. Commission record: nsw-healthcare-funding.`)
  for (const f of prompt.facts) { assert.doesNotMatch(f.text, /PDF page|©|CC BY/); assert.equal('speaker' in f, false); assert.equal('speaker' in f.attribution, false) }
  // The fact lines read back to the same typed turns at every later boundary.
  for (const f of facts) assert.deepEqual(api.transcriptAttribution(api.transcriptTurns(f.text)[0]), api.transcriptAttribution(f.transcript))
  // Hub ruling: the writer is given the role, hearing date and page, never the person's name. A citation in the
  // earlier form, which named the speaker, reaches the writer and the card with the name gone.
  const named = api.writingFacts(undefined, [fact(1, NAMED_CITE, 'https://robodebt.royalcommission.gov.au/day46.pdf#page=15')])
  assert.doesNotMatch(api.writingPrompt({ question, period, facts: named }), /Specimen/)
  assert.doesNotMatch(JSON.stringify(named.map(f => [f.text, f.source.title, f.source.speaker, f.source.transcript, f.transcript])), /Specimen/)
  assert.equal(named[0].text, prompt.facts[0].text)
  // The names-off release's line form reads back as a turn with no role.
  assert.deepEqual(api.transcriptTurns(`The transcript of Royal Commission into the Robodebt Scheme on hearing day 46 (10 March 2023), transcript page P-4899, records: "Income averaging did not make sense to me.". ${LABEL}.`),
    [{ commission: 'Royal Commission into the Robodebt Scheme', page: 'P-4899', excerpt: 'Income averaging did not make sense to me.', day: '46', date: '10 March 2023' }])
  // The repair pass says what was missing, after the same rule.
  assert.ok(JSON.parse(api.writingPrompt({ question, period, facts }, true)).contract.includes(RULE + api.TRANSCRIPT_REPAIR_NOTE))
})

test('nothing changes for an answer with no transcript source', () => {
  const facts = plainFacts(), text = api.writingPrompt({ question: 'Which grants did Example Health receive?', period, facts }), prompt = JSON.parse(text)
  assert.doesNotMatch(text, /attribution|\\"attributed\\"|hearing transcript: it is evidence/)
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
    `Royal Commission into the Robodebt Scheme, hearing transcript, 10 March 2023, page P-4899: A witness. ${LABEL}.`,
    `Royal Commission into the Robodebt Scheme, hearing transcript, 10 March 2023, page P-4933: Counsel assisting. ${LABEL}.`,
    `Royal Commission on Antisemitism and Social Cohesion, hearing transcript, 1 July 2026, page P-180: The Commissioner. ${LABEL}.`,
    `Royal Commission on Antisemitism and Social Cohesion, hearing transcript, 1 July 2026, page P-181: Counsel for a party. ${LABEL}.`,
    `Special Commission of Inquiry into Healthcare Funding, hearing transcript, 20 February 2024, page 601: A witness. ${LABEL}.`,
    `Special Commission of Inquiry into Healthcare Funding, hearing transcript, 20 February 2024, page 640: speaker's role not recorded. ${LABEL}.`,
  ])
  assert.ok(facts.every(f => f.source.speaker === undefined))
  // Each card opens its own page of the publisher's PDF.
  assert.deepEqual(facts.slice(0, 2).map(f => f.source.url), ['https://robodebt.royalcommission.gov.au/day46.pdf#page=15', 'https://robodebt.royalcommission.gov.au/day46.pdf#page=49'])
  // A loose sentence (wrong date, no page) changes nothing on the card: date, page and role come from the record.
  const loose = { answer_decision: 'answer', sentences: [{ text: 'A witness said in early 2022 that income averaging did not make sense to her.', facts: [1], attributed: true }] }
  const out = api.groundAnswerPayload(api.verifyWrittenAnswer(loose, { question, period, facts }), question)
  const card = out.sources.find(s => s.cited)
  assert.equal(card.title, `Royal Commission into the Robodebt Scheme, hearing transcript, 10 March 2023, page P-4899: A witness. ${LABEL}.`)
  assert.deepEqual(card.transcript, { source: 'hearing_transcript', status: 'evidence_not_finding', claim: 'attributed', speaker_role: 'witness', commission: 'Royal Commission into the Robodebt Scheme', commission_id: 'cth-robodebt', hearing_date: '10 March 2023', hearing_day: '46', transcript_page: 'P-4899' })
  assert.equal(card.url, 'https://robodebt.royalcommission.gov.au/day46.pdf#page=15')
  assert.match(card.snippet, /CC BY 4\.0/, 'the licence line stays on the card')
})

test('review P3: the hearing day and date are the listing\'s own, never words inside the quoted evidence', () => {
  // A title with no "Day N", and evidence that says "day 2" and gives another date in brackets.
  const text = cite('Royal Commission into the Robodebt Scheme', 'Transcript of the opening hearing', '31 October 2022', [['P-12', 14, ' (witness)', 'On day 2 of the pilot (3 March 2020) the letters went out, as I said on Day 9.']], 'cth-robodebt')
  const [turn] = api.transcriptTurns(text)
  assert.equal(turn.day, undefined); assert.equal(turn.date, '31 October 2022')
  assert.equal(api.transcriptAttribution(turn).hearing_day, undefined)
  // The fact line built from it reads back the same.
  const { pdf_page, ...typed } = turn
  assert.deepEqual(api.transcriptTurns(api.transcriptFactLine(turn))[0], typed)
})

test('review addendum: one predicate, keyed on the commission\'s record id, decides whether the writer may word a passage', async () => {
  const turn = text => api.transcriptTurns(text)[0]
  for (const [text, id] of [[ROBODEBT_CITE, 'cth-robodebt'], [ANTISEMITISM_CITE, 'cth-antisemitism'], [NSW_CITE, 'nsw-healthcare-funding']]) { assert.equal(turn(text).source, id); assert.equal(api.writerMayWord(turn(text)), true); assert.equal(api.transcriptUse(id), 'writer') }
  // A source with no policy, and a passage with no record id: no model words it.
  assert.equal(turn(UNLISTED_CITE).source, 'example-board-of-inquiry'); assert.equal(api.writerMayWord(turn(UNLISTED_CITE)), false)
  assert.equal(turn(UNTAGGED_CITE).source, undefined); assert.equal(api.writerMayWord(turn(UNTAGGED_CITE)), false)
  for (const id of [undefined, '', 'constructor', 'toString', 'example-board-of-inquiry']) assert.equal(api.transcriptUse(id), 'quote_only', String(id))
  for (const text of [UNLISTED_CITE, UNTAGGED_CITE]) {
    // Never in the writer's prompt, and the prompt has no transcript rule for it.
    const facts = api.writingFacts(undefined, [fact(1, text, 'https://inquiry.example/day2.pdf#page=9'), fact(2, GRANT, 'https://opax.test/grants/example')])
    assert.equal(facts.length, 2); assert.equal(api.wordedTranscriptFact(facts[0]), false); assert.equal(facts[0].source.transcript.claim, 'quoted')
    const prompt = api.writingPrompt({ question, period, facts })
    assert.doesNotMatch(prompt, /tender was let|attribution|hearing transcript: it is evidence/)
    assert.deepEqual(JSON.parse(prompt).facts.map(f => f.id), [2])
    // A sentence that cites it is left out, marked or not; the rest of the answer stands.
    const grant = { text: 'Example Health Ltd was awarded a grant of $120,000 by the Department of Health in 2023-24.', facts: [2] }
    const worded = { text: 'A witness told the inquiry on 4 May 2026 (page T-88) that the tender was let early.', facts: [1], attributed: true }
    assert.equal(api.verifyWrittenAnswer({ answer_decision: 'answer', sentences: [worded, grant] }, { question, period, facts }).answer, grant.text)
    // With nothing else found, the passage is quoted by code with no model call.
    const only = await write([[worded]], api.writingFacts(undefined, [fact(1, text, 'https://inquiry.example/day2.pdf#page=9')]))
    assert.equal(only.prompts.length, 0)
    assert.equal(only.out.answer.split('\n\n')[0], 'A witness said on 4 May 2026 (page T-88): “The tender was let before the business case was finished.”')
    assert.equal(only.out.answer_decision, 'answer')
  }
})

test('with no model, each passage is quoted with its role, date and page; no role means "The transcript records"', () => {
  const out = api.proseFallback({ question, period, facts: transcriptFacts() })
  assert.equal(out.answer, [
    'A witness said on 10 March 2023 (page P-4899): “Income averaging did not make sense to me.”',
    'Counsel assisting asked on 10 March 2023 (page P-4933): “Do you agree that this approach described income averaging?”',
    'The Commissioner asked on 1 July 2026 (page P-180): “What does the platform do when a report of abuse is made?”',
    'Counsel for a party said on 1 July 2026 (page P-181): “The State does not oppose the tender of the report.”',
  ].join('\n\n'), 'the evidence, not findings line is added on the way out of /api/ask, not here')
  const nsw = api.proseFallback({ question, period, facts: api.writingFacts(undefined, [fact(1, NSW_CITE, 'https://healthcarefunding.specialcommission.nsw.gov.au/TRA.0006.pdf#page=3')]) })
  assert.equal(nsw.answer.split('\n\n')[0], 'A witness said on 20 February 2024 (page 601): “The duress alarms did not work reliably when we first tested them.”')
  assert.equal(nsw.answer.split('\n\n')[1], 'The transcript records on 20 February 2024 (page 640): “The roster was changed without notice to the ward.”')
  assert.equal(nsw.answer_decision, 'answer')
  assert.doesNotMatch(out.answer + nsw.answer, NAMES)
  // A "Q." that prints no speaker: a question was put, and nobody is said to have asked it.
  const put = { role: 'question', commission: 'Special Commission of Inquiry into Healthcare Funding', source: 'nsw-healthcare-funding', date: '26 February 2024', page: '1062', excerpt: 'Was the alarm tested?' }
  assert.equal(api.transcriptLead(put), 'A question was put on 26 February 2024 (page 1062)')
  assert.equal(api.transcriptCitation(put), `Special Commission of Inquiry into Healthcare Funding, hearing transcript, 26 February 2024, page 1062: A question was put. ${LABEL}.`)
  assert.equal(api.transcriptFactLine(put), `A question was put at Special Commission of Inquiry into Healthcare Funding (26 February 2024), transcript page 1062: "Was the alarm tested?". ${LABEL}. Commission record: nsw-healthcare-funding.`)
  assert.deepEqual(api.transcriptTurns(api.transcriptFactLine(put))[0], put)
  assert.equal(api.transcriptAttribution(put).speaker_role, 'question')
})

test('claim plan: a transcript sentence without the attributed mark is left out, and only that sentence', () => {
  const input = { question, period, facts: mixedFacts() }
  assert.equal(input.facts.length, 3)
  const grant = { text: 'Example Health Ltd was awarded a grant of $120,000 by the Department of Health in 2023-24.', facts: [3] }
  const marked = { text: 'A witness told the Commission on 10 March 2023 (page P-4899) that income averaging did not make sense to her.', facts: [1], attributed: true }
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
  assert.deepEqual(audit.claims.filter(c => c.type === 'attribution').map(c => [c.entity, c.value, c.status]), [['witness', 'P-4899', 'supported']])
  const raw = { answer: 'Income averaging did not make sense.', citations: { 'fact-1/t/body/0': [[0, 36]] }, sources: [{ resource: 'fact-1', slug: '', kind: 'record', title: ROBODEBT_CITE, snippet: ROBODEBT_CITE, url: 'https://robodebt.royalcommission.gov.au/day46.pdf#page=15', href: '', cited: true }] }
  const unsupported = api.auditPayload(question, raw)
  assert.deepEqual(unsupported.findings.filter(c => c.type === 'attribution').map(c => c.status), ['unverified'])
})

test('review P2: an unmarked sentence that cites a transcript fact and another fact is left out whole; the other fact survives in its own sentence', async () => {
  const input = { question, period, facts: mixedFacts() }
  const grant = { text: 'Example Health Ltd was awarded a grant of $120,000 by the Department of Health in 2023-24.', facts: [3] }
  const both = { text: 'Income averaging did not make sense, and Example Health Ltd was awarded a grant of $120,000 by the Department of Health in 2023-24.', facts: [1, 3] }
  assert.equal(api.unattributedTranscriptSentences({ sentences: [both] }, input), 1)
  // Both of its claims go with it: the sentence is not edited to keep the grant.
  assert.equal(api.verifyWrittenAnswer({ answer_decision: 'answer', sentences: [both] }, input), null)
  assert.equal(api.draftWrittenAnswer({ answer_decision: 'answer', sentences: [both] }, input).answer, '')
  assert.equal(api.verifyWrittenAnswer({ answer_decision: 'answer', sentences: [both, grant] }, input).answer, grant.text)
  // Marked, the same sentence stands, and the card for the transcript fact is the typed one.
  const kept = api.verifyWrittenAnswer({ answer_decision: 'answer', sentences: [{ ...both, text: 'A witness told the Commission on 10 March 2023 (page P-4899) that income averaging did not make sense, and Example Health Ltd was awarded a grant of $120,000 by the Department of Health in 2023-24.', attributed: true }] }, input)
  assert.match(kept.answer, /^A witness told the Commission on 10 March 2023 \(page P-4899\)/); assert.match(kept.answer, /\$120,000/)
  // Through the writer: one repair pass, and with the mixed sentence still unmarked the reader gets the facts as
  // recorded, never an empty answer.
  const { out, prompts } = await write([[both]], mixedFacts())
  assert.equal(prompts.length, 2); assert.ok(out.answer.trim().length > 0); assert.equal(out.answer_decision, 'answer')
  assert.doesNotMatch(out.answer, /Income averaging did not make sense, and Example/)
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
  const marked = { text: 'A witness told the Commission on 10 March 2023 (page P-4899) that income averaging did not make sense to her.', facts: [1], attributed: true }
  const grant = { text: 'Example Health Ltd was awarded a grant of $120,000 by the Department of Health in 2023-24.', facts: [3] }
  const { out, prompts } = await write([[bare, grant], [marked, grant]], mixedFacts())
  assert.equal(prompts.length, 2)
  assert.ok(!prompts[0].includes('Your last draft used a hearing transcript fact')); assert.ok(prompts[1].includes('Your last draft used a hearing transcript fact'))
  assert.match(out.answer, /^A witness told the Commission on 10 March 2023 \(page P-4899\)/)
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
  assert.match(out.answer, /^A witness said on 10 March 2023 \(page P-4899\): “Income averaging did not make sense to me\.”/)
  assert.match(out.answer, /Counsel assisting asked on 10 March 2023 \(page P-4933\)/)
  assert.equal(out.answer_decision, 'answer')
})

test('a marked transcript answer is written in one pass, and no transcript-free answer is ever sent to repair', async () => {
  const marked = { text: 'Counsel assisting put to the witness on 10 March 2023 (page P-4933) that the approach described income averaging.', facts: [2], attributed: true }
  const one = await write([[marked]], mixedFacts())
  assert.equal(one.prompts.length, 1); assert.match(one.out.answer, /^Counsel assisting put to the witness/)
  const plain = await write([[{ text: 'Example Health Ltd was awarded a grant of $120,000 by the Department of Health in 2023-24.', facts: [1] }]], plainFacts())
  assert.equal(plain.prompts.length <= 1, true)
  assert.ok(plain.prompts.every(p => !p.includes('attribution field')))
})

// ---- a one-line answer and the question it replied to

test('hub ruling: a one-line "A." comes with the question straight before it, quoted and never paraphrased; not for a quote-only source', async () => {
  const SHORT = [NSW[0], { n: 2, folio: '720', text: 'MR SAMPLE: Q. You are the director of the unit; is that right?\nA. Correct.\nQ. And Mr Standin reported to you?\nA. Yes, he did.\nQ. What did the review find?\nA. It found that the alarms on the ward were not tested in the first year.\nTHE COMMISSIONER: Thank you.\nA. Yes.' },
    { n: 3, folio: '721', text: 'A. Correct.\nQ. Was that in the spring?' }]
  // When: a bare "A." of at most six words, shown whole, with a "Q." straight before it on the same page.
  assert.deepEqual(hit(SHORT, 2, ['correct']), { excerpt: 'Correct.', speaker_role: 'witness', question: { text: 'You are the director of the unit; is that right?', role: 'counsel assisting' } })
  assert.deepEqual(hit(SHORT, 2, ['did']), { excerpt: 'Yes, he did.', speaker_role: 'witness', question: { text: 'And Mr Standin reported to you?' } })
  // Not for a longer answer, not when another speaker's turn lies between, and never from the page before.
  assert.equal('question' in hit(SHORT, 2, ['tested']), false)
  assert.deepEqual(api.excerpt(SHORT[1].text, ['yes'], 2, api.transcriptRoles(SHORT)).question?.text, 'And Mr Standin reported to you?')
  const last = api.pageTurns(SHORT[1].text, 2), yes = last.turns.at(-1)
  assert.equal(api.answeredQuestion(last, yes, api.transcriptRoles(SHORT), 280), undefined, 'the Commissioner spoke between the question and this answer')
  assert.deepEqual(hit(SHORT, 3, ['correct']), { excerpt: 'Correct.', speaker_role: 'witness' })
  // A long question is cut from the front, so the end the witness answered is kept, inside the 280 cap with the answer.
  const long = [NSW[0], { n: 2, folio: '722', text: `MR SAMPLE: Q. ${'The board met in each quarter of that year and received a report on the alarms from the district. '.repeat(4)}Is that right?\nA. Correct.\nQ. In each year?\nA. In each of the three years I was there.\nQ. Thank you.\nA. Thank you.` }]
  const cut = hit(long, 2, ['correct'])
  assert.match(cut.question.text, /^\.\.\..* Is that right\?$/); assert.ok((cut.excerpt + cut.question.text).length <= 280)

  // The citation carries it; it reads back typed; the writer is given it as a question to quote.
  const at = (record, answer, question) => cite('Special Commission of Inquiry into Healthcare Funding', 'Day 006 – 20 February 2024', '20 February 2024', [['720', 2, ' (witness)', `${answer}" [answer to${question[0]}: "${question[1]}`]], record).replace(`${question[1]}"`, `${question[1]}"]`)
  const wordable = at('nsw-healthcare-funding', 'Yes, he did.', ['', 'And Mr Standin reported to you?'])
  const [turn] = api.transcriptTurns(wordable)
  assert.deepEqual(turn.question, { text: 'And Mr Standin reported to you?' }); assert.equal(turn.excerpt, 'Yes, he did.')
  assert.deepEqual(api.transcriptTurns(at('nsw-healthcare-funding', 'Correct.', [' (counsel assisting)', 'You are the director; is that right?']))[0].question, { text: 'You are the director; is that right?', role: 'counsel assisting' })
  const facts = api.writingFacts(undefined, [fact(1, wordable, 'https://healthcarefunding.specialcommission.nsw.gov.au/TRA.0006.pdf#page=2')])
  assert.equal(facts[0].text, `A witness said at Special Commission of Inquiry into Healthcare Funding on hearing day 006 (20 February 2024), transcript page 720: "Yes, he did." in answer to a question: "And Mr Standin reported to you?". ${LABEL}. Commission record: nsw-healthcare-funding.`)
  assert.deepEqual(api.transcriptTurns(facts[0].text)[0].question, { text: 'And Mr Standin reported to you?' })
  const prompt = JSON.parse(api.writingPrompt({ question, period, facts }))
  assert.equal(prompt.facts[0].attribution.question_quoted, 'And Mr Standin reported to you?')
  assert.match(prompt.contract, /question_quoted is the question it replied to: use the answer only together with that question, and give the question only in its own words inside quotation marks, as a question that was put \(by question_role where given\), never paraphrased\./)
  // The question names a person. The name reaches the writer only as the question's own quoted words (the fact's
  // line and question_quoted); no instruction holds it, and none invites a paraphrase of the question.
  const whole = api.writingPrompt({ question, period, facts })
  assert.equal(whole.split('Standin').length - 1, 2); assert.doesNotMatch(prompt.contract, /Standin/)
  assert.doesNotMatch(JSON.stringify({ ...prompt.facts[0], text: '', attribution: { ...prompt.facts[0].attribution, question_quoted: '' } }), /Standin/)
  // The card and the quoted fallback show the answer, not the question: a reader sees the question only where an
  // answer cites it in words.
  assert.doesNotMatch(facts[0].source.title, /Standin|reported/)
  assert.doesNotMatch(api.proseFallback({ question, period, facts }).answer, /reported to you/)

  // A source the writer may not word: the question is never handed over as something to write from.
  for (const record of ['example-board-of-inquiry', undefined]) {
    const held = at(record, 'Yes, he did.', ['', 'And Mr Standin reported to you?'])
    const quoteOnly = api.transcriptTurns(held)[0]
    assert.equal(api.writerMayWord(quoteOnly), false)
    assert.equal('question_quoted' in api.transcriptAttribution(quoteOnly), false)
    const text = api.writingPrompt({ question, period, facts: api.writingFacts(undefined, [fact(1, held, 'https://inquiry.example/day2.pdf#page=2')]) })
    assert.doesNotMatch(text, /Standin|question_quoted|Yes, he did/)
  }
  // The tool attaches the question only for a wordable source, and every published one-line answer keeps to the cap.
  const out = await api.callTool(env, 'royal_commissions', { view: 'transcripts', commission: 'nsw-healthcare-funding', words: 'correct', limit: 8 })
  for (const [i, row] of out.rows.entries()) for (const h of row.text_matches?.hits ?? []) if (h.question) {
    assert.ok(out.citations[i + 1].text.includes(`"${h.excerpt}" [answer to${h.question.role ? ` (${h.question.role})` : ''}: "${h.question.text}"]`))
    assert.ok(h.excerpt.split(/\s+/).length <= 6 && (h.excerpt + h.question.text).length <= 280)
  }
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
    // Review P1-3: the loop is told, in fixed words, never to word hearing evidence in a point.
    assert.ok(JSON.stringify(model.doGenerateCalls[0].prompt).includes(JSON.stringify(POINT_RULE.trim()).slice(1, -1)))
    // What the research model reads back from the tool (rows and citation text) names no speaker.
    for (const c of model.doGenerateCalls) { const seen = JSON.stringify(c.prompt); assert.doesNotMatch(seen, /hearing turn by |speaker_label|\\"speaker\\"/) }
    assert.doesNotMatch(out.answer, /knew income averaging was unlawful/, JSON.stringify(point))
    assert.match(out.answer, /^(?:A witness|Counsel assisting|The Commissioner|Counsel for a party|The transcript records)[^\n]* on 10 March 2023 \(page P-\d+\): “/)
    const cards = out.qualitative.sources.filter(s => s.cited && !s.coverage)
    assert.ok(cards.length && cards.every(s => s.transcript?.claim === 'attributed' && /hearing transcript, 10 March 2023, page P-\d+: /.test(s.title)), JSON.stringify(cards.map(s => s.title)))
  }
})
