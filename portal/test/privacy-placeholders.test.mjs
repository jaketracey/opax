import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privacyPlaceholders } from '../../scripts/check_privacy_placeholders.mjs';

// The guard behind `npm run check` and the deploy scripts. The page itself is
// not asserted here: it carries placeholders until Jake fills them, and
// blocking there (not in tests) is what keeps them from shipping.

const GUARD = fileURLToPath(new URL('../../scripts/check_privacy_placeholders.mjs', import.meta.url));
const runGuard = (html) => {
  const file = join(mkdtempSync(join(tmpdir(), 'privacy-guard-')), 'page.html');
  writeFileSync(file, html);
  return spawnSync(process.execPath, [GUARD, file], { encoding: 'utf8' });
};

test('placeholders are found in every attribute quoting, labelled or not', () => {
  const html = `<p>Kept for <mark class="privacy-confirm" data-confirm="P5">[To confirm: days]</mark>.
    <mark data-confirm="P16" class="note privacy-confirm">x</mark>
    <span class="privacy-confirm">double-quoted class only</span>
    <mark class='privacy-confirm'>[To confirm: actual retention]</mark>
    <mark class=privacy-confirm>unquoted class only</mark>
    <mark data-confirm=P7>unquoted label</mark>
    <MARK CLASS='privacy-confirm' DATA-CONFIRM='P2'>upper case</MARK>
    <mark title="a > b" class="privacy-confirm">a quoted > before the class</mark></p>`;
  assert.deepEqual(privacyPlaceholders(html), ['P5', 'P16', '?', '?', '?', 'P7', 'P2', '?']);
});

test('fails closed on a lost wrapper or a stray marker', () => {
  assert.deepEqual(privacyPlaceholders('<p>Kept for [To confirm: days] days.</p>'), ['?']);
  assert.deepEqual(privacyPlaceholders('<p>[to decide: a minimum age]</p>'), ['?']);
  assert.deepEqual(privacyPlaceholders('<p class="lede privacy-confirmed">See privacy-confirm.</p>'), ['?', '?']);
});

test('comments, style blocks and ordinary marks are not placeholders', () => {
  const html = `<!-- Each <mark class="privacy-confirm" data-confirm="P1">[To confirm]</mark> is a gap -->
    <style>mark.privacy-confirm { outline: 1px dashed; }</style>
    <p>Filled text with <mark>a highlight</mark>, kept for 7 days.</p>`;
  assert.deepEqual(privacyPlaceholders(html), []);
});

test('the command exits 1 on single-quoted and unquoted markers and 0 on a filled page', () => {
  for (const html of [
    "<p><mark class='privacy-confirm'>[To confirm: actual retention]</mark></p>",
    '<p><mark class=privacy-confirm>retention</mark></p>',
    '<p>Kept for [To confirm: days].</p>',
  ]) {
    const run = runGuard(html);
    assert.equal(run.status, 1, html);
    assert.match(run.stderr, /page\.html \?/);
  }
  const clean = runGuard('<p>Kept for 7 days.</p>');
  assert.equal(clean.status, 0, clean.stderr);
});

test('release scripts contain no donor withholding or privacy re-checks',()=>{
 const {scripts}=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 for(const name of ['check','deploy','deploy:staging','deploy:built','build:search','build:release'])assert.doesNotMatch(scripts[name],/build:privacy|test:privacy|withhold_donor_assets|check_privacy_placeholders/);
});
