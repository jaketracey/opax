// dt-api imports this registration with its seeded endpoint request adapter.
import assert from 'node:assert/strict';
export const SERVER_CSV_LIMIT=50000;
export const SERVER_CSV_NOTE='# Export truncated at 50,000 rows.';
export function assertServerCSVCap(csv,{note=SERVER_CSV_NOTE,limit=SERVER_CSV_LIMIT}={}) {
  // Count logical RFC 4180 records, including multiline quoted fields.
  const records=[]; let quoted=false,start=0;
  for (let i=0;i<csv.length;i++) {
    if (csv[i] === '"') { if (quoted && csv[i+1] === '"') i++; else quoted=!quoted; }
    if (!quoted && csv[i] === '\n') {records.push(csv.slice(start,i).replace(/\r$/,''));start=i+1;}
  }
  if (start < csv.length) records.push(csv.slice(start));
  assert.equal(records.at(-1),note,'endpoint must append a clear truncation note');
  assert.equal(records.length-2,limit,`endpoint must cap data rows at ${limit.toLocaleString('en-AU')}`);
}
export function registerServerCSVContract(test,{name,request,seed,note,limit=SERVER_CSV_LIMIT}) {
  test(`${name}: CSV endpoint caps 50,001 matching rows and explains truncation`,async ()=>{
    const rows=Array.from({length:SERVER_CSV_LIMIT+1},(_,i)=>({id:`organisation-${i}`,name:`Fixture organisation ${i} Pty Ltd`,amount:i+0.25}));
    await seed(rows);
    const response=await request('?format=csv');
    assert.equal(response.status,200);
    assert.equal(response.headers.get('x-table-export-truncated'),'true');
    assertServerCSVCap(await response.text(),{note:typeof note==='function' ? note(response) : note,limit});
  });
}
