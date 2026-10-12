// Child summaries omit module setup. The parent file completion includes it.
import {writeFileSync} from 'node:fs';
import {relative} from 'node:path';
export default async function* reporter(events) {
  const byFile=new Map(),wall=new Map(),printed=new Set();let summary;
  const line=file=>{const data=byFile.get(file);data.duration_ms=wall.get(file);printed.add(file);return `FILE ${data.file} ${(data.duration_ms/1000).toFixed(3)}s ${data.success?'PASS':'FAIL'}\n`;};
  for await (const {type, data} of events) {
    if (type === 'test:fail') yield `FAIL ${relative(process.cwd(), data.file || '')}:${data.line || 0} ${data.name}\n${data.details?.error?.cause?.stack || data.details?.error?.stack || ''}\n`;
    if (type === 'test:summary') {
      if (data.file) {byFile.set(data.file,{...data,test_duration_ms:data.duration_ms,file:relative(process.cwd(),data.file)});if(wall.has(data.file)&&!printed.has(data.file))yield line(data.file);}
      else {summary = data; yield `TESTS ${data.counts.tests} PASS ${data.counts.passed} FAIL ${data.counts.failed} SKIP ${data.counts.skipped} ${(data.duration_ms/1000).toFixed(3)}s\n`;}
    }
    if(type==='test:complete'&&data.name===data.file&&data.nesting===0){
      wall.set(data.file,data.details.duration_ms);if(byFile.has(data.file)&&!printed.has(data.file))yield line(data.file);
    }
  }
  const files=[...byFile.entries()].map(([file,data])=>({...data,duration_ms:wall.get(file)??data.duration_ms}));
  if (process.env.OX_GATE_REPORT) writeFileSync(process.env.OX_GATE_REPORT, JSON.stringify({files,summary},null,2)+'\n');
}
