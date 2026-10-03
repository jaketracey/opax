import { test } from 'node:test';
import assert from 'node:assert/strict';
import { privacyPlaceholders } from '../../scripts/check_privacy_placeholders.mjs';

// The guard behind `npm run check` and the deploy scripts. The page itself is
// not asserted here: it carries placeholders until Jake fills them, and
// blocking there (not in tests) is what keeps them from shipping.

test('every privacy placeholder is found, labelled or not', () => {
  const html = `<p>Kept for <mark class="privacy-confirm" data-confirm="P5">[To confirm]</mark> days.
    <mark data-confirm="P16" class="note privacy-confirm">x</mark>
    <span class="privacy-confirm">unlabelled</span>
    <mark data-confirm='P2'>single quotes still counts</mark></p>`;
  assert.deepEqual(privacyPlaceholders(html), ['P5', 'P16', '?', '?']);
});

test('comments, styles and ordinary marks are not placeholders', () => {
  const html = `<!-- Each <mark class="privacy-confirm" data-confirm="P1"> is a gap -->
    <style>mark.privacy-confirm { outline: 1px dashed; }</style>
    <p>Filled text with <mark>a highlight</mark> and the word privacy-confirm in prose.</p>`;
  assert.deepEqual(privacyPlaceholders(html), []);
});
