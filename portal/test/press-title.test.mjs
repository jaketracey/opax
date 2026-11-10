// PM Transcripts titles stored entity-encoded (speeches-press-005) are decoded at read time,
// once, and only on press-pmt records.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodeTitleEntities, pressTitle, pressHeadlineAndText} from '../src/press-title.ts';

test('the published entity forms decode to the characters the source page shows', () => {
  // press-pmt-47226 and press-pmt-47201 as the knowledge box holds them.
  assert.equal(pressTitle('press-pmt-47226', 'Anthony Albanese — Doorstop - The Royal Children&#039;s Hospital, Melbourne — 2026-03-04'),
    "Anthony Albanese — Doorstop - The Royal Children's Hospital, Melbourne — 2026-03-04");
  assert.equal(pressTitle('press-pmt-47201', 'Anthony Albanese - International Women&#039;s Day - 2026-02-05'), "Anthony Albanese - International Women's Day - 2026-02-05");
  assert.equal(decodeTitleEntities('Q&amp;A with &quot;the PM&quot; &lt;live&gt;'), 'Q&A with "the PM" <live>');
  assert.equal(decodeTitleEntities('Caf&#xe9; &#8211; news&nbsp;day'), 'Café – news day');
});

test('one pass only, malformed references stay as printed, and other records are untouched', () => {
  assert.equal(decodeTitleEntities('AT&amp;amp;T'), 'AT&amp;T', 'an encoded ampersand decodes once');
  assert.equal(decodeTitleEntities('Fish & chips &#0; &#xD800; &bogus;'), 'Fish & chips &#0; &#xD800; &bogus;');
  assert.equal(pressTitle('press-nsw-113796', 'Q&amp;A'), 'Q&amp;A', 'only PM Transcripts encodes');
  assert.equal(pressTitle('speech-71469', 'Children&#039;s'), 'Children&#039;s');
  assert.equal(pressTitle('press-pmt-1', undefined), undefined);
  assert.equal(pressTitle('press-pmt-1', 'Plain title'), 'Plain title');
});

test('the headline and its copy at the head of the body decode; the transcript does not change', () => {
  const headline = 'Doorstop - The Royal Children&#039;s Hospital, Melbourne';
  const body = `${headline}\n\nPRIME MINISTER: It's great to be here &amp; it is. Q&#039;s welcome.`;
  const out = pressHeadlineAndText('press-pmt-47226', headline, body);
  assert.equal(out.headline, "Doorstop - The Royal Children's Hospital, Melbourne");
  assert.equal(out.text, "Doorstop - The Royal Children's Hospital, Melbourne\n\nPRIME MINISTER: It's great to be here &amp; it is. Q&#039;s welcome.");
  // A body that does not open with the headline is left alone.
  assert.equal(pressHeadlineAndText('press-pmt-47226', headline, 'Transcript only').text, 'Transcript only');
  assert.deepEqual(pressHeadlineAndText('press-qld-1', headline, body), {headline, text: body});
  assert.deepEqual(pressHeadlineAndText('press-pmt-1', undefined, body), {headline: undefined, text: body});
});
