// Local disk-backed Worker; outbound model, auth and network calls are refused.
import {createServer} from 'node:http';
import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {offline, loadWorker} from './worker-harness.mjs';
import {tableDatabase} from './table-d1-harness.mjs';
import {tableRows} from '../../scripts/load_tables.mjs';
const pub = new URL('../public/', import.meta.url).pathname;
const loaded = await tableRows(pub, {moneyOnly: true});
const local = await tableDatabase({datasets: {grants: loaded.rows.grants}, policy: loaded.policy});
offline();
const {env, fetch: worker} = await loadWorker(new URL('../src/index.ts', import.meta.url).pathname, pub);
env.TABLE_DB = local.db;
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname, asset = join(pub, path);
    if (!path.startsWith('/api/') && existsSync(asset) && /\.[a-z0-9]+$/.test(path)) {
      const type = path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : path.endsWith('.json') ? 'application/json' : path.endsWith('.woff2') ? 'font/woff2' : 'text/html';
      res.writeHead(200, {'content-type': type}); res.end(readFileSync(asset)); return;
    }
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const response = await worker(req.url, {method: req.method, headers: req.headers, ...(body.length ? {body} : {})});
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  } catch {res.writeHead(500); res.end('Local preview unavailable');}
});
server.listen(8795, '127.0.0.1');
process.on('SIGINT', () => {server.close(async () => {await local.close(); process.exit(0);}); server.closeAllConnections();});
process.on('SIGTERM', () => {server.close(async () => {await local.close(); process.exit(0);}); server.closeAllConnections();});
