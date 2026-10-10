import test from 'node:test';
import assert from 'node:assert/strict';
import {isOrganisationDonor, withholdIndividualDonors, donorPrivacyIndex, donorNameWithheld} from '../public/donor-entity.js';

// Fictional names only: the export's own donors are exercised in donor-privacy.test.mjs.
test('a donor is an organisation only with positive evidence in its name; the industry never counts', () => {
  for (const [label, industry] of [['Jane Citizen','media'],['Ann Example','fossil_fuels'],['Mrs Jane Citizen AO','finance'],['Citizen, Jane','media'],['Bareword','other'],['Betwell','gambling'],['Coleman Example','retail']])
    assert.equal(isOrganisationDonor({label, industry, aliases: []}), false, label);
  for (const [label, industry] of [['Clubs Example','gambling'],['Example Energy Ltd','fossil_fuels'],['CFMEU','unions'],['SDA','unions'],["Australian Workers' Union",'unions'],['Unions Example','unions'],['Example Trades Hall Council','unions'],['Example Trades  Hall','unions'],['Example Holdings Pty Ltd','property'],['Citizen Family Trust','other'],
    ['Example & Smith Lawyers','legal'],['University of Example','education'],['Royal Example College of Surgeons','education'],['The Example Guild of Australia','pharmacy'],['Example Pastoral Co','agriculture'],['Smith & Co.','finance']])
    assert.equal(isOrganisationDonor({label, industry, aliases: []}), true, label);
  // An alias with a legal form is evidence; a personal name tagged as a union is not.
  assert.equal(isOrganisationDonor({label: 'Exco', industry: 'media', aliases: ['Exco Communication Pty Ltd']}), true);
  assert.equal(isOrganisationDonor({label: 'Mr John Citizen', industry: 'unions'}), false);
  assert.equal(isOrganisationDonor({label: 'Citizen, John', industry: 'unions'}), false);
  // An ABN or ACN is not evidence (sole traders have them), and no industry tag is, not even unions.
  for (const node of [{label: 'ABN 12 345 678 901', industry: 'other'}, {label: 'ACN 123 456 789', industry: 'other'},
    {label: 'Alex Example', industry: 'other', aliases: ['ABN 12 345 678 901']}, {label: 'Alex Example', industry: 'unions', aliases: []},
    {label: 'Alex Example', industry: 'unions', aliases: ['12345678901']}])
    assert.equal(isOrganisationDonor(node), false, `${node.label} / ${node.industry} / ${node.aliases?.join(';')}`);
  // A single all-capitals token is an acronym; an all-capitals or inverted personal name is not.
  for (const label of ['JOHN SMITH','Smith, John','SMITH, JOHN','J SMITH','Abc','ABCDEFGH','A']) assert.equal(isOrganisationDonor({label, industry: 'unions'}), false, label);
  assert.equal(isOrganisationDonor({label: 'Example Union Members', industry: 'unions', aliases: ['EUM']}), true);
  // Organisation words count only as whole tokens, and "Co" only as the last one.
  for (const label of ['Ingrid Bankston','Trustwell','Collegiate Smith','Co Example','Jane Lawyersmith','Hallam Trades']) assert.equal(isOrganisationDonor({label, industry: 'finance'}), false, label);
  assert.equal(isOrganisationDonor(null), false);
  assert.equal(isOrganisationDonor({label: '  ', industry: 'unions'}), false);
});

test('withheld donors are renamed and re-keyed in a server-side graph, never merged or dropped', () => {
  const graph = {meta: {}, nodes: [
    {id: 'donor:jane citizen', label: 'Jane Citizen', kind: 'donor', industry: 'media', aliases: ['J Citizen']},
    {id: 'donor:ann example', label: 'Ann Example', kind: 'donor', industry: 'individual'},
    {id: 'donor:example holdings', label: 'Example Holdings Pty Ltd', kind: 'donor', industry: 'property'},
    {id: 'party:Labor', label: 'Labor', kind: 'party'},
  ], edges: [
    {source: 'donor:jane citizen', target: 'party:Labor', total: 100, count: 1},
    {source: 'donor:ann example', target: 'party:Labor', total: 50, count: 1},
    {source: 'donor:example holdings', target: 'party:Labor', total: 25, count: 1},
  ]};
  const out = withholdIndividualDonors(graph);
  const text = JSON.stringify(out);
  for (const name of ['Jane Citizen','J Citizen','jane citizen','Ann Example','ann example']) assert.ok(!text.includes(name), name);
  assert.deepEqual(out.nodes.map(n => n.label), ['Donor 1 (name withheld)','Donor 2 (name withheld)','Example Holdings Pty Ltd','Labor']);
  assert.deepEqual(out.edges.map(e => [e.source, e.total]), [['donor:withheld-1',100],['donor:withheld-2',50],['donor:example holdings',25]]);
  assert.equal(out.nodes[0].industry, 'media');
  assert.equal(JSON.stringify(graph).includes('Jane Citizen'), true, 'the input graph is not mutated');
  const clean = {nodes: [graph.nodes[2], graph.nodes[3]], edges: []};
  assert.equal(withholdIndividualDonors(clean), clean);
});

test('a label is an organisation if any graph vouches for it; an unknown name is judged alone', () => {
  const index = donorPrivacyIndex([
    {nodes: [{label: 'Exco', kind: 'donor', aliases: ['Exco Pty Ltd']}, {label: 'Jane Citizen', kind: 'donor', industry: 'media'}]},
    {nodes: [{label: 'Exco', kind: 'donor', aliases: []}, {label: 'Labor', kind: 'party'}]},
  ]);
  assert.deepEqual([...index.organisations], ['exco']);
  assert.deepEqual([...index.withheld], ['jane citizen']);
  assert.equal(donorNameWithheld(index, 'Exco'), false);
  assert.equal(donorNameWithheld(index, 'jane  citizen'), true);
  assert.equal(donorNameWithheld(index, 'Unknown Person'), true);
  assert.equal(donorNameWithheld(index, 'Unknown Example Pty Ltd'), false);
});
