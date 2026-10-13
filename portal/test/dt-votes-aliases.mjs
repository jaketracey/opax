import {personVoteKeys} from '../public/vote-tables.js';

// Public profile identities come only from the exports at run time.
export function aliasVotingProfiles(roster, votes) {
  return roster.people.filter(p=>p.pid && !p.speech_scope).map(person=>{
    const keys=personVoteKeys(person.name,person.pid,votes);
    const records=keys.map(key=>votes[key]).filter(record=>record && typeof record.name==='string');
    const rows=records.flatMap(record=>[...(record.for || []),...(record.against || [])]);
    const primary=votes[person.pid];
    const primaryRows=[...(primary?.for || []),...(primary?.against || [])];
    return {person,keys,rows,primaryRows};
  }).filter(profile=>profile.keys.length>1 && profile.rows.length>profile.primaryRows.length);
}
