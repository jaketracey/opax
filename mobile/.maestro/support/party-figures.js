/* global http, FIXTURE_PORT, json, output */
// Read a pinned source figure by JSON pointer, independently of the app.
const response = http.get(
  'http://127.0.0.1:' + FIXTURE_PORT + '/graph/money.json',
);
if (response.status !== 200) throw new Error('Money fixture failed');
const money = json(response.body);
const pointer = '/nodes/0/total';
const amount = pointer
  .split('/')
  .slice(1)
  .reduce((value, key) => value[key], money);
if (money.nodes[0].id !== 'party:Labor')
  throw new Error('Labor pointer drifted');
// The total's spoken label: "4,537,500 dollars, disclosed".
output.partyReceiptsLabel =
  String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') +
  ' dollars, disclosed';
