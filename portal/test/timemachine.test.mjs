import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

const compiled = await build({stdin:{contents:"export {mountTimeMachine} from './timemachine.js'; export {mountYearSnapshots} from './year-snapshots.js';",resolveDir:new URL('../public/',import.meta.url).pathname}, bundle:true, format:'iife', globalName:'timeMachine', write:false});
const tick = () => new Promise(resolve => setTimeout(resolve, 20));

async function mount(reports = [], extras = false) {
  const dom = new JSDOM('<main></main>', {url:'https://opax.test/explore', runScripts:'outside-only'});
  const w = dom.window, calls = [];
  w.matchMedia = () => ({matches:true});
  w.fetch = async href => {
    const path = new URL(href, w.location.href).pathname;
    calls.push(path);
    if (path === '/reports/index.json') return Response.json({reports});
    const report = reports.find(r => path === `/reports/${r.slug}.json`);
    if (report) return Response.json(report);
    if (extras && path === '/years/index.json') return Response.json({years:Object.fromEntries(Array.from({length:29},(_,i)=>[1998+i,{}]))});
    if (extras && /^\/years\/\d{4}\.json$/.test(path)) return Response.json({
      year:Number(path.match(/\d{4}/)[0]), generated_at:'2026-09-04T12:58:13+00:00',
      brief:{answer:'An invented overview of the fixture debates.',sources:[]},
      voices:{unique_speeches:12,speakers:['Alex Fixture','Casey Example','Riley Sample'].map(name=>({name,speeches:4}))},
    });
    if (path === '/api/search') return Response.json({results:[]});
    return Response.json({});
  };
  w.eval(compiled.outputFiles[0].text + '\nwindow.timeMachine = timeMachine;');
  const handle = w.timeMachine.mountTimeMachine(w.document.querySelector('main'));
  const snapshots = w.timeMachine.mountYearSnapshots(w.document.querySelector('main'));
  for (let n=0; n<100 && !calls.includes('/api/stats'); n++) await tick();
  await tick();
  return {w, calls, close() {snapshots.destroy();handle.destroy();w.close();}};
}

test('Time Machine hides the numbers heading for every year when reports are withdrawn', async () => {
  const page = await mount();
  try {
    const section = page.w.document.querySelector('.tm-sec-numbers');
    assert.ok(section.hidden);
    const track = page.w.document.querySelector('[role="slider"]');
    track.dispatchEvent(new page.w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));
    for (let year=1998; year<=2026; year++) {
      assert.equal(section.querySelectorAll('.tm-stat').length,0, String(year));
      assert.ok(section.hidden, String(year));
      track.dispatchEvent(new page.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    }
  } finally {page.close();}
});

test('every year dates the brief and voice figures from its snapshot, including after scrubbing', async () => {
  const page = await mount([], true);
  try {
    const track = page.w.document.querySelector('[role="slider"]');
    track.dispatchEvent(new page.w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));
    for (let year=1998; year<=2026; year++) {
      for (let n=0;n<100;n++) {
        if (page.w.document.querySelector('.tm-yearbrief .tm-fineprint')?.textContent.includes(`for ${year}`)
          && page.w.document.querySelectorAll('[data-year-snapshot]').length===2) break;
        await tick();
      }
      const notes = [...page.w.document.querySelectorAll('[data-year-snapshot]')];
      assert.equal(notes.length,2, String(year));
      assert.ok(notes.every(n=>n.textContent==='Snapshot: 4 September 2026.'), String(year));
      assert.ok(notes.every(n=>n.dataset.yearSnapshot===String(year)), String(year));
      track.dispatchEvent(new page.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    }
    const yearReads = page.calls.filter(path=>/^\/years\/\d{4}\.json$/.test(path));
    assert.equal(yearReads.length,58,'one cached read per year for the explorer and its snapshot annotation');
  } finally {page.close();}
});

test('Time Machine shows populated numbers and hides them again in a year without figures', async () => {
  const page = await mount([{slug:'fixture-topic',title:'Fixture topic',stats:{timeline:[[2001,42]]}}]);
  try {
    const section = page.w.document.querySelector('.tm-sec-numbers');
    assert.equal(section.hidden,false);
    assert.match(section.textContent,/42.*Fixture topic/);
    assert.ok(section.querySelectorAll('.tm-stat').length > 0);
    page.w.document.querySelector('.tm-step-fwd').click();
    assert.ok(section.hidden);
    assert.equal(section.querySelectorAll('.tm-stat').length,0);
    page.w.document.querySelector('.tm-step-back').click();
    assert.equal(section.hidden,false);
  } finally {page.close();}
});
