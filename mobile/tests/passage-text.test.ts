import {
  decodeEntities,
  passageText,
  serverPassage,
} from '../src/api/passage-text';
import {
  isVerbatimText,
  type DocumentRecord,
} from '../src/features/records/model';
import { cleanPassage } from '../src/features/people/model';
import { sourcePassage } from '../src/features/ask/model';
import searchRecords from '../scripts/fixtures/search/records.json';
import recordFixtures from '../scripts/fixtures/records/contracts.json';
import serverExcerpts from '../scripts/fixtures/search/server-excerpts.json';

// Real strings: the web's pinned evidence excerpts (portal/public/evidence,
// field `text`, from speeches.text_clean) and the pinned search fixture.
// Speech 796901 (Senate, 17 Nov 2009), as the exporter wrote it:
const yandina =
  ' was a project that supported jobs on the Sunshine Coast, not just jobs but much needed school infrastructure. At the opening, Katie O’Sullivan, the captain of Yandina State School, said—\n\nOpposition Senators:\n\nOpposition senatorsinterjecting—\n\nOrder! When the interjections cease, we will continue.\n\nThe school captain said:\n\nWe know perso';
// Speech 1249416 (Senate estimates, 28 May 2026):
const estimates =
  'ransport Legislation Committee 28/05/2026 Estimates AGRICULTURE, FISHERIES AND FORESTRY PORTFOLIO Meat &#38; Livestock Australia Limited] Senator CANAVAN:\n\n So Cattle Australia is on that?';
const snippet = (slug: string) =>
  searchRecords.find((r) => r.slug === slug)!.snippet;
// Server-format excerpts: real record text through the web's own
// normalizePassage and passageWindow (see the fixture's note).
const server = (id: string) =>
  serverExcerpts.rows.find((r) => r.id === id)!.excerpt;

describe('passage text', () => {
  test('a tag between two words leaves a space, never a join', () => {
    // The Yandina interjection with the inline markup Hansard carries
    // around the speaker and the interjection; the exporter dropped it
    // without a space, which is how "senatorsinterjecting" reached the app.
    expect(
      passageText(
        'Order! When the interjections cease, we will continue.<p><span class="HPS-OfficeInterjecting">Opposition senators</span><span class="HPS-Interjecting">interjecting—</span></p>',
        { paragraphs: true },
      ),
    ).toBe(
      'Order! When the interjections cease, we will continue.\nOpposition senators interjecting—',
    );
    expect(passageText('Senator Allison<br/>until there is order.')).toBe(
      'Senator Allison until there is order.',
    );
    // Tags inside a word, or next to punctuation, add nothing.
    expect(passageText('the <i>Hansard</i>’s record')).toBe(
      'the Hansard’s record',
    );
    expect(passageText('a < b and c > d')).toBe('a < b and c > d');
  });

  test('interjection markup becomes its own line', () => {
    expect(
      passageText(
        'said—<interjection><talker><name>Opposition senators</name></talker>interjecting—</interjection>Order!',
        { paragraphs: true },
      ),
    ).toBe('said—\nOpposition senators interjecting—\nOrder!');
  });

  test('words the source already joined are left alone, not guessed apart', () => {
    expect(passageText(yandina, { paragraphs: true })).toContain(
      'Opposition senatorsinterjecting—',
    );
    expect(passageText(snippet('speech-1198151'))).toContain(
      'whenMalcolm Turnbullwas prime minister',
    );
  });

  test('entities decode once: named, decimal and hex', () => {
    expect(passageText(estimates)).toContain('Meat & Livestock Australia');
    // reports/media.json and bill sponsor_party, as published:
    expect(decodeEntities('AI in Australia&#039;s interests')).toBe(
      "AI in Australia's interests",
    );
    expect(decodeEntities('&#34;Independent Members&#34;')).toBe(
      '"Independent Members"',
    );
    expect(
      decodeEntities('Ayes&nbsp;&mdash; 76 &#x2014; noes &#8217;s &quot;'),
    ).toBe('Ayes\u00a0— 76 — noes ’s "');
    // A Queensland grant recipient: a name, not an entity.
    expect(decodeEntities('LAFFY DR&VM; amount')).toBe('LAFFY DR&VM; amount');
  });

  test('double-encoded entities decode exactly once', () => {
    expect(decodeEntities('Meat &amp;amp; Livestock')).toBe(
      'Meat &amp; Livestock',
    );
    expect(decodeEntities('&amp;#38;')).toBe('&#38;');
    expect(passageText('Meat &amp;#38; Livestock')).toBe(
      'Meat &#38; Livestock',
    );
  });

  test('paragraph starts lose their stray spaces; breaks are kept', () => {
    expect(passageText(estimates, { paragraphs: true })).toBe(
      'ransport Legislation Committee 28/05/2026 Estimates AGRICULTURE, FISHERIES AND FORESTRY PORTFOLIO Meat & Livestock Australia Limited] Senator CANAVAN:\n\nSo Cattle Australia is on that?',
    );
    const kept = passageText(yandina, { paragraphs: true });
    expect(kept.startsWith('was a project')).toBe(true);
    expect(kept).toContain('said—\n\nOpposition Senators:\n\nOpposition');
    expect(kept).not.toMatch(/\n /);
    expect(passageText('a\n\n\n\n  b \u00a0 c', { paragraphs: true })).toBe(
      'a\n\nb c',
    );
    expect(passageText(yandina)).not.toMatch(/\n|\s{2}/);
  });

  test('cuts land on a word boundary with an ellipsis', () => {
    // Ask answers saved before 9 Oct hold `.trim().slice(0, 600)` of the raw
    // passage. Sliced the same way from a pinned record text, it can end
    // mid-word.
    const full = (
      recordFixtures.responses as Record<string, { text?: string }>
    )['/api/resource/speech-1205524']!.text!;
    const cut = full.trim().slice(0, 600);
    const shown = sourcePassage(cut);
    expect(shown.endsWith('…')).toBe(true);
    const words = shown.slice(0, -1);
    expect(full.trim().startsWith(words)).toBe(true);
    expect(/\s/.test(full.trim()[words.length]!)).toBe(true);
    // A shorter passage is whole, and one that ends a sentence stays as is.
    expect(sourcePassage('A complete source sentence')).toBe(
      'A complete source sentence',
    );
    const sentence = `${'word '.repeat(119)}ends.`;
    expect(sentence).toHaveLength(600);
    expect(sourcePassage(sentence)).toBe(sentence);
    // Search windows that open mid-word ("…nder" for "under") start on the
    // next whole word; one left open at the end closes on a whole word.
    expect(passageText(snippet('speech-1205068'))).toMatch(
      /^…this government's housing policy failures, many senior/,
    );
    expect(passageText(snippet('speech-1203451'))).toMatch(
      /^…property and retain access to the 50 per cent CGT/,
    );
    expect(passageText('…The school captain said: We know perso')).toBe(
      '…The school captain said: We know…',
    );
    expect(passageText(yandina, { max: 120 })).toBe(
      'was a project that supported jobs on the Sunshine Coast, not just jobs but much needed school infrastructure. At the…',
    );
    expect(passageText('one two three', { max: 7 })).toBe('one two…');
  });

  test('people rows share the pipeline (what they talk about)', () => {
    expect(cleanPassage(estimates)).toBe('So Cattle Australia is on that?');
    // Person rows come from /api/search, already decoded once by the Worker:
    // a literal "&#38;" left by that decode is the record's own text.
    expect(cleanPassage('Meat &#38; Livestock Australia said so.')).toBe(
      'Meat &#38; Livestock Australia said so.',
    );
    expect(
      cleanPassage(server('search-opens-mid-paragraph-ends-on-colon')),
    ).toBe('Senator CANAVAN:');
    expect(cleanPassage('Heading\n\n A complete source sentence.')).toBe(
      'A complete source sentence.',
    );
  });

  test('Worker-normalized text is never decoded twice', () => {
    // "&amp;#38;" in the source: the Worker decodes once to a literal "&#38;";
    // encoded tags reach the app as literal text, not markup.
    const literal = server('literal-entity-text');
    expect(literal).toBe('& & 😀 — &#38; <b>literal</b>');
    expect(serverPassage(literal)).toBe(literal);
    expect(sourcePassage(literal)).toBe(literal);
    expect(sourcePassage(literal, false)).toBe(literal);
    // The raw pipeline still decodes static shards and catalog text once.
    expect(passageText(estimates)).toContain('Meat & Livestock');
    expect(passageText('Meat &amp;#38; Livestock')).toBe(
      'Meat &#38; Livestock',
    );
  });

  test("search excerpts keep their last word: the server's … marks real cuts", () => {
    for (const id of [
      'search-opens-mid-paragraph-ends-on-dash',
      'search-opens-mid-paragraph-ends-on-colon',
    ]) {
      const excerpt = server(id);
      expect(excerpt.startsWith('… ')).toBe(true);
      expect(excerpt).not.toMatch(/[.!?…]$/);
      expect(serverPassage(excerpt)).toBe(excerpt);
    }
    expect(
      serverPassage(server('search-opens-mid-paragraph-ends-on-dash')),
    ).toMatch(/ another 100,000 Australians—$/);
    expect(
      serverPassage(server('search-opens-mid-paragraph-ends-on-colon')),
    ).toMatch(/ Senator CANAVAN:$/);
    // The old trim rule, kept for raw text, is what dropped those words.
    expect(
      passageText(server('search-opens-mid-paragraph-ends-on-colon')),
    ).toBe('… Meat & Livestock Australia Limited] Senator…');
  });

  test('Ask source snippets are drawn as the Worker cut them', () => {
    for (const id of ['ask-cut-at-600', 'ask-opens-and-cuts']) {
      const excerpt = server(id);
      expect(excerpt.length).toBeLessThanOrEqual(600);
      expect(excerpt.endsWith(' …')).toBe(true);
      expect(sourcePassage(excerpt)).toBe(excerpt);
    }
    // Words on either side of each marker are whole.
    expect(server('ask-cut-at-600')).toMatch(/ stopping the stimulus or …$/);
    expect(server('ask-opens-and-cuts')).toMatch(/^… Withdrawing the stimulus/);
    // The app's own length cap still closes on a word.
    expect(serverPassage(server('ask-cut-at-600'), { max: 40 })).toBe(
      'My question is to Senator Arbib, the…',
    );
  });

  test('record text: Worker-normalized, except verbatim bill text', () => {
    const doc = (slug: string, kind: string) =>
      ({ slug, labels: { kind } }) as unknown as DocumentRecord;
    expect(isVerbatimText(doc('speech-1205524', 'speech'))).toBe(false);
    expect(isVerbatimText(doc('bill-text-au-federal-r7534-aspassed', ''))).toBe(
      true,
    );
    expect(isVerbatimText(doc('press-1', 'bill_text'))).toBe(true);
  });
});
