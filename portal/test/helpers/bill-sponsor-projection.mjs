import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

let projected;
// Exercise the real exporter against the held roster in memory. This keeps
// refresh expectations testable before the database regenerates public bills.
export function billSponsorProjection() {
  return projected ||= JSON.parse(execFileSync(process.env.OPAX_PYTHON || 'python3', [
    fileURLToPath(new URL('../../../scripts/audit_bill_sponsor_parties.py', import.meta.url)), '--project',
  ], {cwd:fileURLToPath(new URL('../../../', import.meta.url)),
    encoding:'utf8', maxBuffer:32 * 1024 * 1024, stdio:['ignore','pipe','pipe']}));
}
