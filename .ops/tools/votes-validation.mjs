import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const object = value => value && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const text = value => typeof value === 'string' && value.trim().length > 0;
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value).toISOString().slice(0,10) === value;
const require = (condition, message) => {if (!condition) throw Error('votes.json: '+message);};

/** Totals cover all divisions; the lists are recent bill examples, not totals. */
export function validateVotes(votes) {
  require(object(votes) && votes._meta?.schema === 1, 'expected schema 1');
  require(object(votes._names), 'missing name lookup');
  const records = Object.entries(votes).filter(([key]) => !key.startsWith('_'));
  let divisions = 0;
  const named = new Set();
  for (const [name,keys] of Object.entries(votes._names)) {
    require(text(name) && name === name.toLowerCase() && Array.isArray(keys) && keys.length > 0 && new Set(keys).size === keys.length, 'invalid name lookup '+name);
    for (const key of keys) {
      require(typeof key === 'string' && !key.startsWith('_') && Object.hasOwn(votes,key) && votes[key]?.name?.toLowerCase() === name, 'unresolved identity '+name);
      named.add(key);
    }
  }
  for (const [key,row] of records) {
    require(object(row) && text(row.name) && text(row.jurisdiction) && named.has(key), 'invalid record identity '+key);
    require((row.party === null || text(row.party)) && (row.house === null || text(row.house)), 'invalid affiliation '+key);
    require(integer(row.ayes) && integer(row.noes) && integer(row.divisions_total) && row.divisions_total === row.ayes + row.noes, 'tally mismatch '+key);
    if (row.years !== undefined) require(Array.isArray(row.years) && row.years.length === 2 && row.years.every(integer) && row.years[0] <= row.years[1], 'invalid years '+key);
    for (const side of ['for','against']) {
      require(Array.isArray(row[side]), 'invalid '+side+' list '+key);
      const bills = new Set();
      for (const bill of row[side]) {
        require(object(bill) && text(bill.name) && text(bill.stage) && text(bill.jur) && typeof bill.date === 'string' && date(bill.date), 'invalid bill vote '+key);
        require(bill.rebels === undefined || integer(bill.rebels), 'invalid rebellion count '+key);
        const identity = bill.jur+'\0'+bill.name;
        require(!bills.has(identity), 'duplicate bill vote '+key);bills.add(identity);
      }
    }
    divisions += row.divisions_total;
  }
  return {schema:1,people:records.length,names:Object.keys(votes._names).length,divisions};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log('VOTES OK '+JSON.stringify(validateVotes(JSON.parse(readFileSync(process.argv[2] || new URL('../portal/public/votes.json',import.meta.url),'utf8')))));
}
