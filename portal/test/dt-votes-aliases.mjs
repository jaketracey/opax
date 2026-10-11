import {personVoteKeys} from '../public/vote-tables.js';

// Public profile identities come only from the exports at run time.
export function aliasVotingProfiles(roster, votes, safe) {
  return roster.people.filter(p=>p.pid && !p.speech_scope && safe(p.name)).map(person=>{
    const keys=personVoteKeys(person.name,person.pid,votes);
    const records=keys.map(key=>votes[key]).filter(record=>record && safe(record.name));
    const rows=records.flatMap(record=>[...(record.for || []),...(record.against || [])]).filter(row=>safe(JSON.stringify(row)));
    const primary=votes[person.pid];
    const primaryRows=[...(primary?.for || []),...(primary?.against || [])].filter(row=>safe(JSON.stringify(row)));
    return {person,keys,rows,primaryRows};
  }).filter(profile=>profile.keys.length>1 && profile.rows.length>profile.primaryRows.length);
}
