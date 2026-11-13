import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {notFoundHTML, notFoundWords, NOT_FOUND_KINDS, NOT_FOUND_LINE} from '../public/not-found.js';

const read = name => readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8');

test('the address comes back as words a reader would search for, never as an identifier', () => {
  assert.equal(notFoundWords('person', 'zz-nobody-here'), 'zz nobody here');
  assert.equal(notFoundWords('donor', 'Zzqx Nobody Pty Ltd'), 'Zzqx Nobody Pty Ltd');
  assert.equal(notFoundWords('donor', 'Zzqx%20Nobody%20Pty%20Ltd'), 'Zzqx Nobody Pty Ltd');
  assert.equal(notFoundWords('electorate', 'federal-representatives-nsw-nowhere'), 'nowhere');
  assert.equal(notFoundWords('electorate', 'vic-vic-la-vic-made-up-place'), 'made up place');
  assert.equal(notFoundWords('page', '/this-page-does-not-exist'), 'this page does not exist');
  assert.equal(notFoundWords('page', '/reports/climate?collection=x'), 'climate');
  // Keys, slugs and ids are not words.
  for (const [kind, slug] of [['bill', 'au-federal-r99999'], ['division', 'division-federal-senate-9999999'], ['document', 'speech-123'], ['recipient', 'abn:00000000000']])
    assert.equal(notFoundWords(kind, slug), '', kind);
  assert.equal(notFoundWords('person', 'smith-2'), 'smith');
});

test('one block for every empty address: the wombat, a plain title, one line, the search and one pill', () => {
  for (const kind of Object.keys(NOT_FOUND_KINDS)) {
    const html = notFoundHTML({kind, slug: 'au-federal-r99999', headingId: 'h'});
    assert.match(html, new RegExp(`<h1 id="h" tabindex="-1">${NOT_FOUND_KINDS[kind].title}</h1>`), kind);
    assert.ok(html.includes(`<p class="not-found-line">${NOT_FOUND_LINE}</p>`), kind);
    assert.match(html, /<div class="not-found-art" aria-hidden="true"><\/div>/, kind);
    assert.match(html, /<form class="not-found-search" action="\/ask" method="get" role="search"><input type="hidden" name="view" value="search">/, kind);
    assert.equal((html.match(/<a class="ui-button"/g) || []).length, 1, `${kind}: one pill`);
    // Nothing failed: no alert, no alarm colour, no source line, no profile shell, never the raw id.
    assert.doesNotMatch(html, /role="alert"|danger|ui-source|subject-portrait|r99999/, kind);
  }
  assert.equal(NOT_FOUND_KINDS.person.title, 'No parliamentarian at this address');
  assert.equal(NOT_FOUND_KINDS.bill.title, 'No bill at this address');
  assert.equal(NOT_FOUND_KINDS.donor.title, 'No donor by this name');
  assert.match(notFoundHTML({kind: 'person', slug: 'zz-nobody-here'}), /name="q" type="search" value="zz nobody here"/);
  assert.match(notFoundHTML({kind: 'donor', slug: '<b>"x"</b>'}), /value="&lt;b&gt;&quot;x&quot;&lt;\/b&gt;"/);
});

test('the app draws the same block where a record route lands on nothing, and the old shells are gone', () => {
  const app = read('app.js');
  // ("Document unavailable" stays for a document that failed to load: that is a failure, not an empty address.)
  for (const old of ['No speeches in the record under this name', 'No bill with this identifier', 'No document with this identifier'])
    assert.ok(!app.includes(old), old);
  assert.match(app, /showNotFound\(body, "person"/);
  assert.match(app, /showNotFound\(body, "donor"/);
  assert.match(app, /showNotFound\(body, "bill"/);
  assert.match(app, /showNotFound\(host, slug\.startsWith\("division-"\) \? "division" : "document"/);
  // A donor gets the block only for a name in no return, and only once the index has loaded.
  assert.match(app, /kind === "donor" && donorViewIndex\.size && !donorViewIndex\.has\(donorViewKey\(name\)\)/);
  assert.match(read('electorates.js'), /renderNotFound\(body, \{ kind: 'electorate'/);
  assert.match(read('grant-recipient.js'), /renderNotFound\(root, \{ kind: 'recipient'/);
  assert.ok(!read('electorates.js').includes('Electorate not found'));
  // The style hides nothing in red.
  assert.doesNotMatch(read('not-found.css'), /danger/);
});
