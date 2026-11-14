/** Who voted against the rest of their party in one division: the one rule Ask's division tool,
 * the division pages (Worker and browser) and the /api/resource division response all use.
 * A member counts only when their party is a named party with at least five recorded aye/no
 * votes and a strict majority on the other side. Independents, presiding-officer labels, unknown
 * parties, ties, paired and absent votes never count. Plain JS so the browser can load it too. */

export const AGAINST_PARTY_TITLE = 'Voted against their party';
export const AGAINST_PARTY_HELP = 'Voting against your own party is often called crossing the floor.';
export const AGAINST_PARTY_MIN_VOTES = 5;

/** Independents and presiding-officer labels do not describe a coherent party. The export no longer
 * publishes office codes as parties (scripts/division_rules.py); this still refuses them. */
export function isDivisionParty(party) {
  return !!String(party ?? '').trim() && !/^(independents?|unknown(?: party)?|unaffiliated|none|n\/a|[adt]?spk|sdspk|[adt]?pres|[adt]?cwm|speaker|president|deputy president|acting president|(?:second |acting )?deputy speaker|acting speaker|(?:deputy )?chair(?:man)? of committees|(?:deputy )?chairman of ways and means)$/i.test(String(party).trim());
}

/** Each party label's recorded ayes and noes, and its strict majority (null for a tie or a non-party label). */
export function partyMajorities(members) {
  const parties = [...new Set(members.flatMap(m => m.party ? [m.party] : []))].sort();
  return parties.map(party => {
    const votes = members.filter(m => m.party === party);
    const ayes = votes.filter(m => m.vote === 'aye').length, noes = votes.filter(m => m.vote === 'no').length;
    return { party, ayes, noes, majority: isDivisionParty(party) && ayes !== noes ? (ayes > noes ? 'aye' : 'no') : null };
  });
}

/** The members whose aye or no is against their party's strict majority, by name. Each keeps its own
 * fields and gains party_vote. */
export function againstPartyMembers(members, majorities = partyMajorities(members)) {
  return members.flatMap(m => {
    const party = majorities.find(p => p.party === m.party);
    return party && party.ayes + party.noes >= AGAINST_PARTY_MIN_VOTES && party.majority && (m.vote === 'aye' || m.vote === 'no') && m.vote !== party.majority
      ? [{ ...m, party_vote: party.majority }] : [];
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/** A division export's member list is complete when it is marked recorded and its sides match the tally. */
export function memberListComplete(d) {
  const members = Array.isArray(d?.members) ? d.members : [];
  return d?._meta?.member_coverage === 'recorded'
    && members.filter(m => m.vote === 'aye').length === d.ayes && members.filter(m => m.vote === 'no').length === d.noes;
}

const noun = d => d?.house === 'senate' && (d.jurisdiction ?? 'federal') === 'federal' ? 'senators' : 'members';

/** The section's content for one division export, or null when nobody voted against their party.
 * Every sentence is built here so each renderer shows the same words. */
export function votedAgainstParty(d) {
  const members = (Array.isArray(d?.members) ? d.members : []).filter(m => m && m.name)
    .map(m => ({ name: m.name, party: m.party || null, vote: m.vote, person_slug: m.person_slug || null, source_party: m.party && m.party_source?.source_party || null }));
  const majorities = partyMajorities(members);
  const found = againstPartyMembers(members, majorities);
  if (!found.length) return null;
  const complete = memberListComplete(d);
  return {
    title: AGAINST_PARTY_TITLE,
    help: AGAINST_PARTY_HELP,
    member_list_complete: complete,
    note: complete ? null : 'The member list for this division is partial, so other members may be missing here.',
    members: found.map(m => {
      const p = majorities.find(x => x.party === m.party);
      const others = p.ayes + p.noes - 1, withMajority = m.party_vote === 'aye' ? p.ayes : p.noes;
      const who = `${m.party} ${noun(d)}`;
      const text = `Voted ${m.vote}; ${withMajority === others ? `the other ${others} ${who}` : `${withMajority} of the other ${others} ${who}`} voted ${m.party_vote}`;
      return {
        name: m.name, person_slug: m.person_slug, party: m.party, vote: m.vote, party_vote: m.party_vote,
        party_ayes: p.ayes, party_noes: p.noes, text,
        ...(m.source_party ? { party_note: `The division record lists ${m.source_party}; ${m.party} is the party dated records give for this date.` } : {}),
      };
    }),
  };
}

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The section body (help, list, notes) shared by the Worker page and the browser page. `href` maps a
 * member's name to their person page. The caller supplies the heading and wrapper. */
export function votedAgainstPartyHTML(view, href) {
  if (!view?.members?.length) return '';
  const items = view.members.map(m => `<li><a href="${escape(href(m.name))}">${escape(m.name)}</a> (${escape(m.party)}). ${escape(m.text)}.${m.party_note ? ` ${escape(m.party_note)}` : ''}</li>`).join('');
  return `<p class="division-against-help">${escape(view.help)}</p><ul class="division-against-list">${items}</ul>${view.note ? `<p class="division-against-note">${escape(view.note)}</p>` : ''}`;
}
