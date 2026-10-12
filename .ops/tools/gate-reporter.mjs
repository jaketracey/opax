// Node 24 file summaries include setup/hooks; sums of individual tests do not.
import {writeFileSync} from 'node:fs';
import {relative} from 'node:path';
export default async function* reporter(events) {
  const files = []; let summary;
  for await (const {type, data} of events) {
    if (type === 'test:fail') yield `FAIL ${relative(process.cwd(), data.file || '')}:${data.line || 0} ${data.name}\n${data.details?.error?.cause?.stack || data.details?.error?.stack || ''}\n`;
    if (type === 'test:summary') {
      if (data.file) {files.push({...data, file:relative(process.cwd(),data.file)}); yield `FILE ${relative(process.cwd(),data.file)} ${(data.duration_ms/1000).toFixed(3)}s ${data.success?'PASS':'FAIL'}\n`;}
      else {summary = data; yield `TESTS ${data.counts.tests} PASS ${data.counts.passed} FAIL ${data.counts.failed} SKIP ${data.counts.skipped} ${(data.duration_ms/1000).toFixed(3)}s\n`;}
    }
  }
  if (process.env.OX_GATE_REPORT) writeFileSync(process.env.OX_GATE_REPORT, JSON.stringify({files,summary},null,2)+'\n');
}
