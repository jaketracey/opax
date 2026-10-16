import {machineLabelHTML} from './labels.js?v=36612149e0';

// Suggestions use only this answer and its public-record context. No model call.
export function personFollowups(answer, sources = [], context) {
  if (!context?.name || !answer?.trim()) return [];
  const lower = answer.toLowerCase();
  const cited = sources.filter(s => s.cited);
  if (!cited.length) return [];
  const items = [];
  const add = (label, question, kind) => {
    items.push({label, question, kind});
  };
  for (const theme of context.topics || []) {
    if (!lower.includes(theme.name.toLowerCase())) continue;
    add(`Speeches on ${theme.name.toLowerCase()}`, `What has ${context.name} said in parliament about ${theme.name.toLowerCase()}?`, 'speech');
    if (items.length === 2) break;
  }
  const bill = cited.find(s => s.kind === 'bill' && lower.includes(s.title.toLowerCase()));
  if (bill) add(`Votes on ${bill.title}`, `How did ${context.name} vote on the ${bill.title}?`, 'vote');
  add('Most recent speech', `What did ${context.name} say in their most recent parliamentary speech?`, 'recent');
  if (context.peer && lower.includes(context.peer.theme.toLowerCase())) {
    add(`Compare with ${context.peer.name}`, `Compare what ${context.name} and ${context.peer.name} have said in parliament about ${context.peer.theme.toLowerCase()}.`, 'compare');
  }
  if (items.length < 2) {
    const speech = cited.find(s => s.kind === 'speech' && s.title && lower.includes(s.title.toLowerCase()));
    if (speech) add(`More on ${speech.title}`, `What did ${context.name} say in the speech on ${speech.title}?`, 'speech');
  }
  // Reserve a comparison when available while retaining a specific theme.
  return items.length > 4 ? [items[0], ...items.slice(-3)] : items;
}

/** textContent and validated same-site destinations keep model text out of HTML. */
export function renderPersonContext(slot, context, {portrait = '', partyDot} = {}) {
  slot.replaceChildren();
  slot.hidden = true;
  if (!context?.name) return;
  const node = (tag, text, cls) => {
    const el = document.createElement(tag);
    if (text != null) el.textContent = text;
    if (cls) el.className = cls;
    return el;
  };
  const head = node('div', null, 'ask-person-head');
  if (/^\/photos\/[\w-]+\.webp$/.test(portrait)) {
    const img = node('img'); img.src = portrait; img.alt = ''; img.width = 64; img.height = 64;
    head.appendChild(img);
  }
  head.appendChild(node('h2', context.name)); slot.appendChild(head);
  if (context.party) {
    const party = node('p', null, 'ask-person-party');
    if (partyDot) party.appendChild(partyDot);
    party.appendChild(node('span', context.party)); slot.appendChild(party);
  }
  if (context.electorate) slot.appendChild(node('p', context.electorate, 'ask-person-seat'));
  slot.appendChild(node('p', `${Number(context.speeches).toLocaleString()} speeches in the record`, 'ask-person-count'));
  const topicsHeading = node('h3', 'Top topics');
  const machine = node('span');
  machine.innerHTML = machineLabelHTML({pill:true});
  topicsHeading.appendChild(machine);
  slot.appendChild(topicsHeading);
  const list = node('ul');
  for (const topic of context.topics || []) {
    const li = node('li');
    const link = node('a', topic.name); link.href = '/subject/topic/' + encodeURIComponent(topic.slug);
    li.appendChild(link); li.appendChild(node('span', Number(topic.count).toLocaleString())); list.appendChild(li);
  }
  slot.appendChild(list);
  const links = node('nav'); links.setAttribute('aria-label', 'Person records');
  for (const [label, path] of [['Profile',context.profile],['Voting record',context.votes],['Interests',context.interests]]) {
    if (!/^\/(?:subject\/person\/[^?#]+(?:#subject-votes)?|declared\?person=[^#]+)$/.test(path || '')) continue;
    const a = node('a',label); a.href = path; links.appendChild(a);
  }
  slot.appendChild(links);
  slot.appendChild(node('p', `Topic labels can overlap. Record as of ${context.as_of}.`, 'fineprint'));
  slot.hidden = false;
}
