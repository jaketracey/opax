import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {isOrganisationDonor} from '../public/donor-entity.js';
import {renderPersonAnswer} from '../src/seo-content.ts';
import {personIndex} from '../src/person-slug.ts';

const pub = new URL('../public/', import.meta.url);
const json = path => JSON.parse(readFileSync(new URL(path, pub), 'utf8'));
const graphs = ['money.json','money.qld.json','money.vic.json','money.tas.json'].map(f => json(`graph/${f}`));
const donorNodes = graphs.flatMap(g => g.nodes.filter(n => n.kind === 'donor'));
// A label is unnameable when no graph gives positive organisation evidence for it.
const organisations = new Set(donorNodes.filter(isOrganisationDonor).map(n => n.label));
const individuals = new Set(donorNodes.map(n => n.label).filter(l => !organisations.has(l)));
const unescape = s => s.replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

test('a donor is an organisation only with positive evidence in its name; the industry never counts', () => {
  for (const [label, industry] of [['Roslyn Packer','media'],['Sara Prendergast','fossil_fuels'],['Mrs X AO','finance'],['Mrs Roslyn Packer AO','media'],['Packer, Roslyn','media'],['Visy','other'],['Sportsbet','gambling']])
    assert.equal(isOrganisationDonor({label, industry, aliases: []}), false, label);
  for (const [label, industry] of [['Clubs NSW','gambling'],['Woodside Energy Ltd','fossil_fuels'],['CFMEU','unions'],["Australian Workers' Union",'unions'],['Pratt Holdings Pty Ltd','property'],['X Family Trust','other'],['Electrical Trades Union of Australia','unions'],['ABN 12 345 678 901','other']])
    assert.equal(isOrganisationDonor({label, industry, aliases: []}), true, label);
  // An alias with a legal form is evidence; a personal name tagged as a union is not.
  assert.equal(isOrganisationDonor({label: 'Ikon', industry: 'media', aliases: ['Ikon Communication Pty Ltd']}), true);
  assert.equal(isOrganisationDonor({label: 'Mr John Citizen', industry: 'unions'}), false);
  assert.equal(isOrganisationDonor({label: 'Citizen, John', industry: 'unions'}), false);
  // Organisation words count only as whole tokens.
  assert.equal(isOrganisationDonor({label: 'Ingrid Bankston', industry: 'finance'}), false);
  assert.equal(isOrganisationDonor({label: 'Trustwell', industry: 'finance'}), false);
  assert.equal(isOrganisationDonor(null), false);
  assert.equal(isOrganisationDonor({label: '  ', industry: 'unions'}), false);
});

test('the exported money maps hold the known sector-tagged individuals as individuals', () => {
  for (const label of ['Roslyn Packer','Sara Prendergast']) assert.ok(individuals.has(label), label);
  for (const label of ['Clubs NSW','Mineralogy Pty Ltd']) assert.ok(organisations.has(label), label);
});

test('no server-rendered person page names a donor that fails the organisation test', async () => {
  const assets = new Map();
  const read = async path => { if (!assets.has(path)) assets.set(path, JSON.parse(readFileSync(new URL(path.slice(1), pub), 'utf8'))); return assets.get(path); };
  const roster = json('parliamentarians.json').people;
  const {slugOf} = personIndex(roster);
  let named = 0;
  for (const p of roster) {
    const {html} = await renderPersonAnswer(p, read, slugOf);
    const section = html.split('<h2>Donors to their party</h2>')[1]?.split('<h2>Bills sponsored</h2>')[0] || '';
    for (const [, href] of section.matchAll(/href="\/subject\/donor\/([^"]+)"/g)) {
      const label = decodeURIComponent(unescape(href));
      assert.ok(organisations.has(label), `${p.name}: ${label}`);
      named++;
    }
    for (const label of individuals) assert.ok(!section.includes(`>${label.replace(/&/g,'&amp;').replace(/'/g,'&#39;')}</a>`), `${p.name}: ${label}`);
  }
  assert.ok(named > 0, 'organisational donors are still listed');
  const morrison = roster.find(p => p.name === 'Scott Morrison');
  if (morrison) assert.doesNotMatch((await renderPersonAnswer(morrison, read, slugOf)).html, /Sara Prendergast|Roslyn Packer/);
});

test('the donors sitemap and the search catalogue hold no donor that fails the organisation test', () => {
  const xml = readFileSync(new URL('crawl/sitemaps/donors-1.xml', pub), 'utf8');
  const listed = [...xml.matchAll(/<loc>https:\/\/opax\.com\.au\/subject\/donor\/([^<]+)<\/loc>/g)].map(m => decodeURIComponent(unescape(m[1])));
  assert.ok(listed.length > 0);
  for (const label of listed) assert.ok(organisations.has(label), `sitemap: ${label}`);
  const {version} = json('search-catalog/manifest.json');
  for (const file of readdirSync(new URL(`search-catalog/${version}/`, pub)).filter(f => f.startsWith('records-'))) {
    for (const r of json(`search-catalog/${version}/${file}`)) {
      if (r.kind === 'donor') assert.ok(!individuals.has(r.title), `search donor: ${r.title}`);
      if (r.kind === 'receipt') assert.ok(!individuals.has(r.title.split(' → ')[0]), `search receipt: ${r.title}`);
    }
  }
});
