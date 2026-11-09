// Capture request boundary. Expected errors remain errors, never fixture data.
import { readFileSync } from 'node:fs';

const expected404 = new Set([
  '/bills/au-federal-r1',
  '/bills/au-federal-r1.json',
  '/interests/11023.json',
  '/api/person-topics?name=Basem+Abdo',
]);
const [file, port] = process.argv.slice(2);
const requests = readFileSync(file, 'utf8')
  .split('\n')
  .filter((line) => line.startsWith('{'))
  .map((line) => JSON.parse(line));
const offHost = (row) => row.host !== `127.0.0.1:${port}`;
const expected = (row) =>
  !offHost(row) &&
  !row.allowed &&
  row.status === 404 &&
  expected404.has(row.path);
const bad = requests.filter(
  (row) => offHost(row) || (!row.allowed && !expected(row)),
);
console.log(
  JSON.stringify({
    requests: requests.length,
    outsideAllowList: bad.length,
    expectedErrorStates: requests.filter(expected).map((row) => row.path),
    offHost: requests.filter(offHost).length,
  }),
);
process.exitCode = bad.length ? 1 : 0;
