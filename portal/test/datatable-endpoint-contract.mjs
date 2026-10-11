// dt-api imports this registration with its seeded endpoint request adapter.
import assert from 'node:assert/strict';
export const SERVER_CSV_LIMIT=50000;
export const SERVER_CSV_NOTE='# Export truncated at 50,000 rows.';
export function assertServerCSVCap(csv) {
  // Count logical RFC 4180 records, including multiline quoted fields.
  const records=[]; let quoted=false,start=0;
  for (let i=0;i<csv.length;i++) {
    if (csv[i] === '"') { if (quoted && csv[i+1] === '"') i++; else quoted=!quoted; }
    if (!quoted && csv[i] === '\n') {records.push(csv.slice(start,i).replace(/\r$/,''));start=i+1;}
  }
  if (start < csv.length) records.push(csv.slice(start));
  assert.equal(records.at(-1),SERVER_CSV_NOTE,'endpoint must append a clear truncation note');
  assert.equal(records.length-2,SERVER_CSV_LIMIT,'endpoint must cap data rows at 50,000');
}
export function registerServerCSVContract(test,{name,request,seed}) {
  test(`${name}: CSV endpoint caps 50,001 matching rows and explains truncation`,async ()=>{
    const rows=Array.from({length:SERVER_CSV_LIMIT+1},(_,i)=>({id:`organisation-${i}`,name:`Fixture organisation ${i} Pty Ltd`,amount:i+0.25}));
    await seed(rows);
    const response=await request('?format=csv');
    assert.equal(response.status,200);
    assert.equal(response.headers.get('x-table-export-truncated'),'true');
    assertServerCSVCap(await response.text());
  });
}
