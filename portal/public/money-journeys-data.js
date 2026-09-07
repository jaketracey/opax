/** Guided views derived only from exported graph relationships and year cells. */
const EXCLUDED_INDUSTRIES = new Set(['individual', 'individuals', 'unions', 'party_internal', 'government', 'other', 'unidentified']);
const COMPANY_WORD = /\b(?:pty|ltd|limited|corporation|corp|bank|banking|group|holdings|plc)\b/i;
const NON_COMPANY_WORD = /\b(?:association|foundation|university|college|federation|council|union|society|electoral|parliament|party|institute)\b/i;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const nodeId = value => typeof value === 'string' ? value : value?.id;
const compareId = (a, b) => String(a.id).localeCompare(String(b.id), 'en');
const amount = edges => edges.reduce((sum, edge) => sum + edge.total, 0);
const dollars = value => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(value);
const metric = (label, value, format = 'currency') => ({ label, value, format });
const pairs = edges => edges.map(({ source, target }) => ({ source, target }));
const unique = values => [...new Set(values)];
const companyLike = node => node.kind === 'donor' && typeof node.industry === 'string'
  && !EXCLUDED_INDUSTRIES.has(node.industry.toLowerCase())
  && COMPANY_WORD.test(node.label || '') && !NON_COMPANY_WORD.test(node.label || '');
const donorLink = node => ({ label: `Open ${node.label}`, href: `/subject/donor/${encodeURIComponent(node.label)}` });
const scene = (focusId, nodes, edges, dates = {}) => ({ focusId, withIds: unique(nodes), edges: pairs(edges), ...dates });
const rankedEdges = edges => [...edges].sort((a, b) => b.total - a.total || a.target.localeCompare(b.target, 'en'));

function dataView(data) {
  const nodes = new Map();
  for (const node of Array.isArray(data?.nodes) ? data.nodes : []) {
    if (typeof node?.id === 'string' && typeof node.label === 'string') nodes.set(node.id, node);
  }
  // The scene API identifies edges by endpoints. Ignore ambiguous duplicate
  // pairs rather than inflating them or displaying an unspecified relationship.
  const edges = [], seen = new Set(), duplicates = new Set();
  for (const raw of Array.isArray(data?.edges) ? data.edges : []) {
    const source = nodeId(raw?.source), target = nodeId(raw?.target);
    if (!nodes.has(source) || !nodes.has(target) || !finite(raw.total) || raw.total <= 0) continue;
    const key = JSON.stringify([source, target]);
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
    edges.push({ ...raw, source, target, key });
  }
  const clean = edges.filter(edge => !duplicates.has(edge.key));
  const companies = [...nodes.values()].filter(companyLike).sort(compareId);
  const giving = clean.filter(e => nodes.get(e.source).kind === 'donor' && nodes.get(e.target).kind === 'party' && !e.grant && !e.flow);
  const outgoing = new Map(companies.map(n => [n.id, rankedEdges(giving.filter(e => e.source === n.id))]));
  return { nodes, edges: clean, companies, giving, outgoing, jurisdiction: data?.meta?.jurisdiction || 'federal' };
}

function selection(candidates, requested, value, label, selectorLabel) {
  return {
    choices: candidates.map(item => ({ value: value(item), label: label(item) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'en') || a.value.localeCompare(b.value, 'en')),
    selected: candidates.find(item => value(item) === requested), selectorLabel,
  };
}
function publicMoneyJourney(view, requested) {
  const companyIds = new Set(view.companies.map(n => n.id));
  const incoming = view.edges.filter(e => view.nodes.get(e.source).kind === 'grantor'
    && companyIds.has(e.target) && view.outgoing.get(e.target)?.length
    && (e.grant || e.flow === 'contracts' || e.flow === 'grants'));
  const isContract = edge => edge.flow === 'contracts' || view.nodes.get(edge.source).flow === 'contracts';
  incoming.sort((a, b) => Number(isContract(b)) - Number(isContract(a))
    || b.total - a.total || a.key.localeCompare(b.key, 'en'));
  if (!incoming.length) return null;
  const pick = selection(incoming, requested, e => e.key,
    e => `${view.nodes.get(e.target).label} — ${view.nodes.get(e.source).label}`, 'Recipient');
  const base = { id: 'public-money', title: 'Contracts & grants', description: 'Choose a recipient. Follow the money in and out.',
    choices: pick.choices, selectorLabel: pick.selectorLabel, selection: pick.selected?.key || '', steps: [] };
  const edge = pick.selected;
  if (!edge) return base;
  const donor = view.nodes.get(edge.target), hub = view.nodes.get(edge.source);
  const contracts = edge.flow === 'contracts' || hub.flow === 'contracts';
  const noun = contracts ? 'contract awards' : 'grant awards';
  const giving = view.outgoing.get(donor.id).slice(0, 4);
  const parties = giving.map(e => e.target), recorded = amount(giving);
  const links = [donorLink(donor)];
  if (contracts && view.jurisdiction === 'federal') links.push({ label: 'Explore its supplier profiles', href: `/subject/supplier?donor=${encodeURIComponent(donor.id)}` });
  return {
    ...base,
    steps: [
      { title: `Start at ${hub.label}`, body: `Follow the line to ${donor.label}. It shows recorded ${noun}, not payments.`, metric: metric(`Recorded ${noun}`, edge.total), scene: scene(hub.id, [donor.id], [edge]) },
      { title: `Meet ${donor.label}`, body: 'This organisation also appears in the funding record. Open its profile to inspect the connection and supporting records.', scene: scene(donor.id, [hub.id], [edge]), links },
      { title: 'Now follow the party receipts', body: `Now follow its ${giving.length} party connections. These receipts cover a different set of records and years from the awards.`, metric: metric('Receipts on the links shown', recorded), scene: scene(donor.id, parties, giving) },
      { title: 'Keep the two directions separate', body: 'Awards come in; party receipts go out. These are separate flows. A connection does not establish that one funded the other or bought influence.', scene: scene(donor.id, [hub.id, ...parties], [edge, ...giving]), links },
    ],
  };
}

function multiplePartiesJourney(view, requested) {
  const candidates = view.companies.filter(n => view.outgoing.get(n.id).length >= 2);
  candidates.sort((a, b) => view.outgoing.get(b.id).length - view.outgoing.get(a.id).length
    || amount(view.outgoing.get(b.id)) - amount(view.outgoing.get(a.id)) || compareId(a, b));
  if (!candidates.length) return null;
  const pick = selection(candidates, requested, n => n.id, n => n.label, 'Organisation');
  const base = { id: 'multiple-parties', title: 'More than one party', description: 'Choose an organisation and compare its connections.',
    choices: pick.choices, selectorLabel: pick.selectorLabel, selection: pick.selected?.id || '', steps: [] };
  const donor = pick.selected;
  if (!donor) return base;
  const all = view.outgoing.get(donor.id), shown = all.slice(0, 4), first = shown[0], second = shown[1];
  return {
    ...base,
    steps: [
      { title: `Start with ${donor.label}`, body: `Its funding reaches several parties. Start with the ${shown.length} largest connections shown here.`, metric: metric('Parties linked in this record', all.length, 'number'), scene: scene(donor.id, shown.map(e => e.target), shown), links: [donorLink(donor)] },
      { title: `Its largest link: ${view.nodes.get(first.target).label}`, body: 'This is its largest recorded party connection across the years covered by the map.', metric: metric('Recorded receipts', first.total), scene: scene(first.target, [donor.id], [first]) },
      { title: `There is also ${view.nodes.get(second.target).label}`, body: 'The next-largest connection leads somewhere else. A single headline total would miss this part of the picture.', metric: metric('Recorded receipts', second.total), scene: scene(second.target, [donor.id], [second]) },
      { title: 'Put the destinations side by side', body: `Compare the ${shown.length} largest connections. Smaller or undisclosed receipts may be missing from the map.`, breakdown: shown.map(edge => ({ label: view.nodes.get(edge.target).label, value: edge.total })), scene: scene(donor.id, shown.map(e => e.target), shown), links: [donorLink(donor)] },
    ],
  };
}

function industryJourney(view, requested) {
  const groups = new Map();
  for (const donor of view.companies) {
    if (!view.outgoing.get(donor.id).length) continue;
    if (!groups.has(donor.industry)) groups.set(donor.industry, []);
    groups.get(donor.industry).push(donor);
  }
  const candidates = [...groups.entries()].filter(([, ns]) => ns.length >= 2)
    .map(([industry, ns]) => ({ industry, nodes: ns.sort((a, b) => amount(view.outgoing.get(b.id)) - amount(view.outgoing.get(a.id)) || compareId(a, b)).slice(0, 3) }));
  candidates.sort((a, b) => b.nodes.reduce((s, n) => s + amount(view.outgoing.get(n.id)), 0) - a.nodes.reduce((s, n) => s + amount(view.outgoing.get(n.id)), 0) || a.industry.localeCompare(b.industry, 'en'));
  if (!candidates.length) return null;
  const pick = selection(candidates, requested, g => g.industry, g => g.industry.replaceAll('_', ' '), 'Industry');
  const base = { id: 'industry', title: 'Explore an industry', description: 'A shared industry. Different connections.',
    choices: pick.choices, selectorLabel: pick.selectorLabel, selection: pick.selected?.industry || '', steps: [] };
  const group = pick.selected;
  if (!group) return base;
  const selected = group.nodes, first = selected[0], second = selected[1];
  const edges = selected.flatMap(n => view.outgoing.get(n.id).slice(0, 3));
  const parties = unique(edges.map(e => e.target));
  const industry = group.industry.replaceAll('_', ' ');
  return {
    ...base,
    steps: [
      { title: `${selected.length} organisations in ${industry}`, body: 'Look at their party connections together, then zoom in on each organisation. Sharing an industry does not mean they act together.', scene: scene(first.id, [...selected.map(n => n.id), ...parties], edges) },
      { title: `First, ${first.label}`, body: 'Follow its largest party connections. Notice which destinations stand out.', scene: scene(first.id, view.outgoing.get(first.id).slice(0, 3).map(e => e.target), view.outgoing.get(first.id).slice(0, 3)), links: [donorLink(first)] },
      { title: `Next, ${second.label}`, body: 'Now compare the destinations and amounts for another organisation in the same industry.', scene: scene(second.id, view.outgoing.get(second.id).slice(0, 3).map(e => e.target), view.outgoing.get(second.id).slice(0, 3)), links: [donorLink(second)] },
      { title: 'Compare the visible routes', body: `${parties.length} parties appear across the selected links. This view shows up to three organisations and their three largest links each, not the whole industry.`, metric: metric('Parties on the selected links', parties.length, 'number'), scene: scene(first.id, [...selected.map(n => n.id), ...parties], edges) },
    ],
  };
}

function yearValue(edge, from, to) {
  let total = 0;
  for (const [key, cell] of Object.entries(edge.byYear || {})) {
    if (!/^\d{4}$/.test(key)) continue;
    const year = Number(key);
    if (year >= from && year <= to && Array.isArray(cell) && finite(cell[0]) && cell[0] >= 0) total += cell[0];
  }
  return total;
}

function timeJourney(view, requested) {
  const years = unique(view.giving.flatMap(e => Object.entries(e.byYear || {})
    .filter(([key, cell]) => /^(19|20)\d{2}$/.test(key) && Array.isArray(cell) && finite(cell[0]) && cell[0] > 0)
    .map(([key]) => Number(key)))).sort((a, b) => a - b);
  if (years.length < 2) return null;
  const end = years.at(-1), width = Math.min(3, Math.floor((end - years[0] + 1) / 2));
  if (width < 1) return null;
  const earlier = { from: end - 2 * width + 1, to: end - width }, later = { from: end - width + 1, to: end };
  const candidates = view.companies.map(node => {
    const edges = view.outgoing.get(node.id);
    return { node, edges, before: edges.reduce((s, e) => s + yearValue(e, earlier.from, earlier.to), 0), after: edges.reduce((s, e) => s + yearValue(e, later.from, later.to), 0) };
  }).filter(c => c.before > 0 && c.after > 0);
  candidates.sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before) || compareId(a.node, b.node));
  if (!candidates.length) return null;
  const pick = selection(candidates, requested, c => c.node.id, c => c.node.label, 'Organisation');
  const base = { id: 'over-time', title: 'Turn back the clock', description: `Choose an organisation. Compare equal ${width}-year windows.`,
    choices: pick.choices, selectorLabel: pick.selectorLabel, selection: pick.selected?.node.id || '', steps: [] };
  const item = pick.selected;
  if (!item) return base;
  const { node } = item;
  const beforeEdges = item.edges.filter(e => yearValue(e, earlier.from, earlier.to) > 0);
  const afterEdges = item.edges.filter(e => yearValue(e, later.from, later.to) > 0);
  const all = item.edges.filter(e => beforeEdges.includes(e) || afterEdges.includes(e));
  const label = window => window.from === window.to ? String(window.from) : `${window.from}–${window.to}`;
  return {
    ...base,
    steps: [
      { title: `Earlier: ${label(earlier)}`, body: `${node.label}, in the earlier window. Years mark the start of a financial year, or the year of an election return.`, metric: metric('Receipts in this window', item.before), scene: scene(node.id, beforeEdges.map(e => e.target), beforeEdges, earlier) },
      { title: `Later: ${label(later)}`, body: 'Watch the same organisation in a later window of equal length. Only receipts dated within this window count.', metric: metric('Receipts in this window', item.after), scene: scene(node.id, afterEdges.map(e => e.target), afterEdges, later) },
      { title: 'What changed in the disclosed record?', body: `The later window records ${item.after >= item.before ? "more" : "less"}. This is a change in disclosed receipts; reporting coverage can also change between years.`, metric: metric('Difference between the windows', Math.abs(item.after - item.before)), scene: scene(node.id, all.map(e => e.target), all, { from: earlier.from, to: later.to }), links: [donorLink(node)] },
    ],
  };
}

export function buildMoneyJourneys(data, selections = {}) {
  const view = dataView(data);
  if (!view.companies.length) return [];
  return [publicMoneyJourney(view, selections['public-money']), multiplePartiesJourney(view, selections['multiple-parties']), industryJourney(view, selections.industry), timeJourney(view, selections['over-time'])].filter(Boolean);
}
