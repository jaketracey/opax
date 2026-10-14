// DataTable layout contract (Jake, 14 Oct): the table flows with the page (no
// capped inner scroll box), scrolls sideways only inside .dt-scroll with its
// first column held, and wraps text between words. jsdom has no layout, so the
// stylesheets are read rule by rule (media rules included); Chrome and WebKit
// measurements live in private/datatable-scroll/.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {applyQuery,dataTableHTML} from '../public/datatable.js';
import {workbenchConfig,workbenchRows} from '../public/datatable-workbench-data.js';

const source = name => readFileSync(new URL(`../public/${name}`,import.meta.url),'utf8').replace(/@import[^;]+;/g,'');
const rules = name => {
  const {document} = new JSDOM(`<style>${source(name)}</style>`).window, out = [];
  const walk = (list,media) => { for (const rule of list) {
    if (rule.type === 4) walk(rule.cssRules,rule.conditionText || rule.media.mediaText);
    else if (rule.type === 1) out.push({media,selector:rule.selectorText,style:rule.style});
  } };
  walk(document.styleSheets[0].cssRules,'');
  return out;
};
const tableCSS = rules('datatable.css');
const find = (selector,media = '') => {
  const found = tableCSS.filter(rule => rule.selector === selector && rule.media === media);
  assert.ok(found.length,`missing rule ${selector}${media ? ` in ${media}` : ''}`);
  return found.at(-1).style;
};
const phone = tableCSS.find(rule => /width < 600px/.test(rule.media))?.media;

test('no fixed-height scroll wrapper: .dt-scroll flows with the page and only scrolls sideways',()=>{
  const wrap = find('.dt-scroll');
  assert.equal(wrap.getPropertyValue('overflow-x'),'auto');
  assert.equal(wrap.getPropertyValue('max-height'),'');
  assert.equal(wrap.getPropertyValue('height'),'');
  assert.equal(wrap.getPropertyValue('overflow-y'),'');
  for (const rule of tableCSS.filter(r => /dt-scroll|\.dt-root\b(?!.*\.dt-)/.test(r.selector) || /^\.dt(\s|$|,)/.test(r.selector))) {
    assert.ok(!/(^|\s)(max-)?height/.test([...rule.style].join(' ')) || rule.selector.includes('dt-panel') || rule.selector.includes('dt-icon'),`${rule.selector} ${rule.media} caps the table height`);
    assert.notEqual(rule.style.getPropertyValue('overflow-y'),'scroll');
    assert.notEqual(rule.style.getPropertyValue('overflow-y'),'auto');
  }
  for (const name of ['grants-table.css','register-tables.css','vote-tables.css','money-connections.css']) {
    for (const rule of rules(name).filter(r => /\.dt(-scroll|-root)?\b/.test(r.selector)))
      assert.equal(rule.style.getPropertyValue('max-height'),'',`${name} ${rule.selector} caps the table height`);
  }
  // The receipts ledger (not a DataTable) gets the same treatment from style.css.
  const style = rules('style.css').filter(rule => rule.selector === '.lg-root .lg-tablewrap');
  assert.equal(style.at(-1)?.style.getPropertyValue('max-height'),'none');
  assert.equal(style.at(-1)?.style.getPropertyValue('overflow'),'visible');
});

test('the first column is sticky, and phones keep a real table that scrolls inside its wrapper',()=>{
  const first = find('.dt :is(th, td):first-child:not([colspan])');
  assert.equal(first.getPropertyValue('position'),'sticky');
  assert.equal(first.getPropertyValue('left'),'0px');
  // Above the other sticky header cells, which would otherwise paint over it once scrolled.
  assert.equal(find('.dt thead th:first-child:not([colspan])').getPropertyValue('z-index'),'2');
  assert.equal(first.getPropertyValue('z-index'),'1');
  assert.equal(find('.dt td').getPropertyValue('background'),'var(--paper-raised)','the sticky cell must be opaque');
  assert.equal(find('.dt th').getPropertyValue('background'),'var(--paper-sunken)');
  assert.ok(phone,'phone media block present');
  const narrow = tableCSS.filter(rule => rule.media === phone);
  for (const rule of narrow) {
    assert.ok(!['block','grid'].includes(rule.style.getPropertyValue('display')) || !/^\.dt(\s+(tr|tbody|caption)|,|$)/.test(rule.selector),`${rule.selector} turns phone rows into cards`);
    assert.notEqual(rule.style.getPropertyValue('position'),'static');
    assert.notEqual(rule.style.getPropertyValue('overflow'),'visible',`${rule.selector} lets phone tables overflow the page`);
  }
  assert.ok(!narrow.some(rule => rule.selector.includes('dt-scroll')),'phones keep the shared sideways scroller');
  assert.ok(!narrow.some(rule => /thead/.test(rule.selector)),'phones keep the header row');
  assert.match(find('.dt td[data-primary]',phone).getPropertyValue('min-width'),/min\(/);
});

test('cells wrap between words; numbers and dates stay whole and right-aligned figures use tabular digits',()=>{
  const cell = find('.dt td');
  assert.equal(cell.getPropertyValue('overflow-wrap'),'break-word');
  assert.equal(cell.getPropertyValue('word-break'),'normal');
  for (const name of ['datatable.css','grants-table.css']) for (const rule of rules(name)) {
    assert.notEqual(rule.style.getPropertyValue('word-break'),'break-all',`${name} ${rule.selector} breaks words mid-word`);
    if (rule.style.getPropertyValue('overflow-wrap') === 'anywhere') assert.equal(rule.selector,'.dt td.dt-long',`${name} ${rule.selector} breaks words mid-word`);
  }
  const grants = rules('grants-table.css').find(rule => rule.selector === '[data-grants-table] .dt :is(th, td)').style;
  assert.equal(grants.getPropertyValue('overflow-wrap'),'break-word');
  assert.match(find('.dt td[data-primary]').getPropertyValue('min-width'),/var\(--size-control\)/);
  const header = find('.dt th .dt-button');
  assert.notEqual(header.getPropertyValue('white-space'),'nowrap','header labels wrap between words rather than widen a desktop table');
  assert.equal(header.getPropertyValue('display'),'inline-flex','the sort icon stays beside the label');
  assert.equal(find('.dt .dt-number').getPropertyValue('font-variant-numeric'),'tabular-nums');
  assert.ok(tableCSS.some(r => r.selector === '.dt .dt-number' && !r.media && r.style.getPropertyValue('white-space') === 'nowrap'));
  assert.equal(find('.dt .dt-date').getPropertyValue('white-space'),'nowrap');
  assert.equal(find('.dt [data-align="end"]').getPropertyValue('text-align'),'end');
  assert.ok(!tableCSS.some(rule => rule.media === phone && /data-align="end"/.test(rule.selector)),'phones keep figures right-aligned');
  const html = dataTableHTML(workbenchConfig,applyQuery(workbenchRows,workbenchConfig,{}));
  assert.match(html,/data-label="Amount" data-align="end" data-prominent class="dt-number"/);
  assert.match(html,/data-label="Updated" data-align="start" class="dt-date"/);
  assert.match(html,/data-label="Organisation" data-align="start" data-primary title=/);
});

test('only a single unbroken run of 25+ characters may break anywhere; names keep word wrapping',()=>{
  assert.equal(find('.dt td.dt-long').getPropertyValue('overflow-wrap'),'anywhere');
  const table={id:'long-token-fixture',caption:'Fixture',pageType:'money',columns:[{key:'name',label:'Donor',type:'text',primary:true},{key:'ref',label:'Reference',type:'text'}]};
  const html=dataTableHTML(table,applyQuery([{id:'a',name:'Example Banking Corporation Limited',ref:'Return 2024 · https://example.test/returns/annual/2024-25/;'}],table,{}));
  assert.match(html,/data-label="Donor" data-align="start" data-primary title=/);
  assert.match(html,/data-label="Reference" data-align="start" class="dt-long"/);
});

test('row menus near the bottom open upward so they never grow the sideways scroller',()=>{
  const up = find('.dt tbody tr:nth-last-child(-n + 2):not(:first-child) .dt-actions .dt-panel > div');
  assert.equal(up.getPropertyValue('top'),'auto');
  assert.equal(up.getPropertyValue('bottom'),'100%');
});
