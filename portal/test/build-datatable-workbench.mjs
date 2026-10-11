// Deterministic, offline SSR fixture generation; run from any directory.
import {writeFileSync} from 'node:fs';
import {applyQuery, dataTableHTML} from '../public/datatable.js';
import {workbenchConfig,workbenchRows} from '../public/datatable-workbench-data.js';
const table = dataTableHTML({...workbenchConfig,privacyCheck:()=>true},applyQuery(workbenchRows,workbenchConfig,{}));
writeFileSync(new URL('./fixtures/datatable.html',import.meta.url),`${table}\n`);
writeFileSync(new URL('../public/datatable-workbench.html',import.meta.url),`<!doctype html>
<html lang="en-AU"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Table workbench · OPAX</title>
<link rel="stylesheet" href="/tokens.css"><link rel="stylesheet" href="/fonts.css"><link rel="stylesheet" href="/datatable.css"><link rel="stylesheet" href="/datatable-workbench.css">
<script type="module" src="/datatable-workbench.js"></script>
</head><body><main class="dt-workbench">
<h1>Table workbench</h1><p>Explore receipts with search, filters and exact-value exports.</p>
<nav aria-label="Examples"><button type="button" data-example="default" aria-pressed="true">Default</button><button type="button" data-example="filtered" aria-pressed="false">Filtered</button><button type="button" data-example="empty" aria-pressed="false">Empty</button><button type="button" data-example="server" aria-pressed="false">Server mode</button></nav>
<p id="example-note">Client mode · fixture records</p>
<div id="table-example">${table}</div>
<footer>Fictional organisation records · <span id="event-log">Ready</span></footer>
</main></body></html>\n`);
