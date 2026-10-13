import test from 'node:test';
import assert from 'node:assert/strict';
import {toCSV} from '../public/datatable.js';
import {registerServerCSVContract,assertServerCSVCap,SERVER_CSV_LIMIT,SERVER_CSV_NOTE} from './datatable-endpoint-contract.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {memoryExport,closeMemoryExports} from './memory-export.mjs';
let input=[];
const config={columns:[{key:'name',label:'Organisation',type:'text'},{key:'amount',label:'Amount',type:'money'}]};
// A reference endpoint boundary; dt-api must register the same gate against its real handler.
registerServerCSVContract(test,{name:'reference table endpoint',seed:async rows=>{input=rows;},request:async search=>{
  assert.equal(new URLSearchParams(search).get('format'),'csv');
  return new Response(toCSV(input.slice(0,SERVER_CSV_LIMIT),config)+'\r\n'+SERVER_CSV_NOTE,{headers:{'content-type':'text/csv','x-table-export-truncated':'true'}});
}});
test('endpoint contract rejects an uncapped response and a missing note',()=>{
  const uncapped='Organisation,Amount\r\n'+Array.from({length:50001},()=> 'Fixture organisation Pty Ltd,1').join('\r\n')+'\r\n'+SERVER_CSV_NOTE;
  assert.throws(()=>assertServerCSVCap(uncapped),/50,000/);
  assert.throws(()=>assertServerCSVCap('Organisation,Amount\r\n'),/truncation note/);
});
