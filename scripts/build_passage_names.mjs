// Compact, deterministic roster projection shared by the Python and TS cleaners.
import {readFileSync, writeFileSync} from 'node:fs';

const roster = JSON.parse(readFileSync(new URL('../portal/public/parliamentarians.json',import.meta.url),'utf8'));
const fullNames = new Set(), surnames = new Set(), nameTokens = new Set();
const stripTitles = name => name.replace(/^(?:(?:Senator|Mr\.?|Mrs\.?|Ms\.?|Dr\.?|Hon\.?|Reverend|the)\s+)+/i,'').trim();
for (const person of roster.people) {
  for (const value of [person.full, person.name]) {
    for (const token of stripTitles(String(value || '')).split(/\s+/)) if (token) nameTokens.add(token.toLowerCase());
  }
  const name = stripTitles(String(person.full || person.name || '').replace(/\s+/g,' '));
  const parts = name.split(' '), first = parts[0];
  const surname = parts.at(-1);
  if (surname && (surname.match(/\p{L}/gu) || []).length >= 2) surnames.add(surname);
  // Initials/surname-only prints are not full names. Honorific surname forms
  // remain useful even for those records.
  if (parts.length >= 2 && (first.match(/\p{L}/gu) || []).length >= 2 && /\p{Ll}/u.test(first)) fullNames.add(name);
}
const longestFirst = values => [...values].sort((a,b) => b.length-a.length || (a<b?-1:a>b?1:0));
const projection = {
  full_names:longestFirst(fullNames), surnames:longestFirst(surnames), name_tokens:longestFirst(nameTokens),
  honorifics:['Senator','Mrs','Mr','Ms','Dr'],
  function_words:longestFirst('was has had and until who said of for that will would from with when which'.split(' ')),
};
writeFileSync(new URL('../portal/src/passage-names.json',import.meta.url),JSON.stringify(projection,null,2)+'\n');
console.log(`Passage name projection: ${fullNames.size} full names, ${surnames.size} surnames`);
