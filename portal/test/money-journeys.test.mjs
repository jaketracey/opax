import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/money-journeys.js', import.meta.url), 'utf8')
  .replace(/^import .*buildMoneyJourneys.*;\s*/m, '')
  .replace('export function mountMoneyJourneys', 'function mountMoneyJourneys');

function emitter(extra = {}) {
  const listeners = new Map();
  return { ...extra, listeners,
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    emit(type, event = {}) { for (const fn of [...(listeners.get(type) || [])]) fn(event); },
    count() { return [...listeners.values()].reduce((sum, set) => sum + set.size, 0); },
  };
}
function element(focusLog) {
  let html = ''; let children = [];
  const classes = new Set();
  const el = emitter({ hidden: false, classList: { toggle(name, on) { on ? classes.add(name) : classes.delete(name); }, remove(name) { classes.delete(name); }, contains(name) { return classes.has(name); } } });
  Object.defineProperty(el, 'innerHTML', {
    get: () => html,
    set(value) {
      html = value;
      children = [...value.matchAll(/<(button|select)\b([^>]*)>/g)].map((match) => {
        const dataset = {}; const attributes = {};
        for (const attr of match[2].matchAll(/([\w-]+)="([^"]*)"/g)) {
          attributes[attr[1]] = attr[2];
          if (attr[1].startsWith('data-')) dataset[attr[1].slice(5)] = attr[2];
        }
        const button = { tagName: match[1].toUpperCase(), id: attributes.id, value: '', dataset, attributes, disabled: /\sdisabled(?:\s|$)/.test(match[2]),
          setAttribute(name, val) { attributes[name] = val; },
          focus() { focusLog.push(button); },
          closest(selector) { return selector === 'button' || selector === '[data-journey]' && 'journey' in dataset ? button : null; },
        };
        return button;
      });
    },
  });
  el.contains = (button) => children.includes(button);
  el.querySelectorAll = (selector) => children.filter((button) => {
    if (selector === 'button') return true;
    const match = /^\[data-([\w-]+)(?:="([^"]*)")?\]$/.exec(selector);
    return match && match[1] in button.dataset && (match[2] === undefined || button.dataset[match[1]] === match[2]);
  });
  el.querySelector = (selector) => el.querySelectorAll(selector)[0] || null;
  return el;
}
const defaultJourneys = () => [{ id: 'funding', title: 'Funding', description: 'Follow recorded receipts', steps: [0, 1, 2].map((n) => ({ title: `View ${n + 1}`, body: `Record ${n + 1}`, scene: { focusId: `node:${n}` }, links: [] })) }];
function setup({ reduced = false, journeys = defaultJourneys(), build, options = {}, available = true } = {}) {
  const focus = []; const controls = element(focus); const story = element(focus); const stage = element(focus);
  const media = emitter({ matches: reduced }); const document = emitter({ hidden: false });
  let timerId = 0; const timers = new Map(); const timerHistory = new Map(); const observers = [];
  const events = []; const scenes = []; const routes = []; let clears = 0; let pauses = 0;
  const map = { presentScene(scene) { scenes.push(scene); return available; }, clearScene() { clears++; }, pauseScene() { pauses++; } };
  const context = { CustomEvent: class { constructor(type, {detail}) { this.type=type; this.detail=detail; } }, dispatchEvent: e => events.push(e.detail), AbortController, buildMoneyJourneys: build || (() => journeys), matchMedia: () => media, document,
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); timerHistory.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    IntersectionObserver: class { constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } },
  };
  runInNewContext(source, context);
  const handle = context.mountMoneyJourneys(controls, story, stage, {}, map, { onRoute: (...args) => routes.push(args), ...options });
  const click = (action) => { const target = story.querySelector(`[data-action="${action}"]`); assert.ok(target, `${action} exists`); story.emit('click', { target }); };
  const choose = () => controls.emit('click', { target: controls.querySelector('[data-journey]') });
  const tick = () => { const [id, timer] = timers.entries().next().value || []; assert.ok(timer, 'one pending timer'); timers.delete(id); timer.fn(); };
  const key = (key, extra = {}) => { let prevented = false; story.emit('keydown', { key, target: story.querySelector('[data-action="next"]'), preventDefault() { prevented = true; }, ...extra }); return prevented; };
  return { events, handle, controls, story, stage, media, document, timers, timerHistory, observers, scenes, routes, focus, click, choose, tick, key, clears: () => clears, pauses: () => pauses };
}

test('journeys are opt-in and deep links bound their requested step without starting playback', () => {
  const h = setup();
  assert.equal(h.story.hidden, true); assert.equal(h.scenes.length, 0); assert.equal(h.timers.size, 0);
  h.choose();
  assert.equal(h.story.hidden, false); assert.equal(h.scenes.at(-1).focusId, 'node:0'); assert.equal(h.timers.size, 0);
  h.handle.setRoute('funding', 900);
  assert.equal(h.scenes.at(-1).focusId, 'node:2');
  h.handle.setRoute('funding', -5);
  assert.equal(h.scenes.at(-1).focusId, 'node:0');
  const linked = setup({ options: { initialJourney: 'funding', initialStep: 1 } });
  assert.equal(linked.scenes.at(-1).focusId, 'node:1'); assert.equal(linked.routes.length, 0);
});

test('play starts the next scene immediately, then advances on the interval without stealing focus', () => {
  const h = setup(); h.choose(); h.click('play');
  assert.equal(h.routes.length, 2, 'choose and play each update the route once');
  assert.equal(h.timers.size, 1); assert.equal([...h.timers.values()][0].ms, 7000);
  const focusCount = h.focus.length;
  assert.equal(h.scenes.at(-1).focusId, 'node:1', 'no initial seven-second wait');
  h.tick(); assert.equal(h.scenes.at(-1).focusId, 'node:2'); assert.equal(h.timers.size, 0);
  assert.equal(h.focus.length, focusCount);
  assert.match(h.story.innerHTML, /Replay journey/);
  assert.equal(h.routes.at(-1)[1], 2, 'the shareable route follows the displayed step');
});

test('pause and manual navigation cancel playback, retaining keyboard control focus', () => {
  const h = setup(); h.choose(); h.click('play'); h.click('play');
  assert.equal(h.timers.size, 0);
  h.click('play'); h.click('next');
  assert.equal(h.scenes.at(-1).focusId, 'node:2'); assert.equal(h.timers.size, 0);
  assert.equal(h.focus.at(-1).dataset.action, 'next');
  const target = h.story.querySelector('[data-step="0"]');
  h.story.emit('click', { target });
  assert.equal(h.focus.at(-1).dataset.step, '0', 'numbered step keeps focus after rerender');
  assert.equal(h.key('ArrowRight'), true);
  assert.equal(h.scenes.at(-1).focusId, 'node:1');
  assert.ok(h.story.contains(h.focus.at(-1)), 'arrow navigation keeps focus in the current story DOM');
});

test('hidden tab, offscreen map and reduced motion pause without auto-resuming', () => {
  const h = setup(); h.choose(); h.click('play');
  h.document.hidden = true; h.document.emit('visibilitychange'); assert.equal(h.timers.size, 0);
  h.document.hidden = false; h.document.emit('visibilitychange'); assert.equal(h.timers.size, 0);
  h.click('play'); h.observers[0].callback([{ isIntersecting: false }]); assert.equal(h.timers.size, 0);
  h.observers[0].callback([{ isIntersecting: true }]); assert.equal(h.timers.size, 0);
  h.click('play'); h.media.matches = true; h.media.emit('change'); assert.equal(h.timers.size, 0);
  assert.equal(h.story.querySelector('[data-action="play"]').disabled, true);
  h.click('next'); assert.equal(h.scenes.at(-1).focusId, 'node:2');
  h.media.matches = false; h.media.emit('change'); assert.equal(h.timers.size, 0);
});

test('keyboard shortcuts respect text inputs, editable regions and modifiers', () => {
  const h = setup(); h.choose();
  for (const extra of [{ target: { tagName: 'INPUT' } }, { target: { tagName: 'SELECT' } }, { target: { isContentEditable: true } }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { shiftKey: true }]) {
    assert.equal(h.key('ArrowRight', extra), false);
    assert.equal(h.scenes.at(-1).focusId, 'node:0');
  }
  assert.equal(h.key('Escape'), true); assert.equal(h.story.hidden, true); assert.equal(h.clears(), 1);
});

test('destroy cancels timers, removes listeners and rejects stale route callbacks', () => {
  const h = setup(); h.choose(); h.click('play');
  const lateTimer = [...h.timerHistory.values()].at(-1);
  h.handle.destroy(); const sceneCount = h.scenes.length;
  assert.equal(h.timers.size, 0); assert.equal(h.controls.count(), 0); assert.equal(h.story.count(), 0);
  assert.equal(h.document.count(), 0); assert.equal(h.media.count(), 0); assert.equal(h.observers[0].disconnected, true);
  assert.equal(h.clears(), 1); assert.equal(h.story.hidden, true);
  lateTimer(); h.handle.pause('map'); h.handle.setRoute(null); h.handle.setRoute('funding', 1); h.handle.destroy();
  assert.equal(h.scenes.length, sceneCount); assert.equal(h.clears(), 1, 'a stale controller cannot clear a replacement map scene');
});

test('unavailable map scene stays readable and never starts a failing playback loop', () => {
  const h = setup({ available: false }); h.choose(); h.click('play');
  assert.equal(h.timers.size, 0); assert.match(h.story.innerHTML, /view is unavailable/);
  h.click('next'); assert.match(h.story.innerHTML, /View 2/);
});

test('story text is escaped and unsafe outgoing links are dropped', () => {
  const journeys = defaultJourneys(); const step = journeys[0].steps[0];
  step.title = '<img src=x onerror=alert(1)>'; step.body = '<script>alert(1)</script>';
  step.links = [{ href: 'javascript:alert(1)', label: 'unsafe' }, { href: '//evil.test/', label: 'external' }, { href: '/subject/supplier/s-123?x="', label: '<safe>' }];
  const h = setup({ journeys }); h.choose();
  assert.doesNotMatch(h.story.innerHTML, /<img|<script|javascript:|\/\/evil\.test/);
  assert.match(h.story.innerHTML, /&lt;img/); assert.match(h.story.innerHTML, /&lt;safe&gt;/); assert.match(h.story.innerHTML, /x=&quot;/);
});


test('touching the map pauses at the current scene and Continue returns to that scene', () => {
  const h = setup(); h.choose(); h.click('play');
  const sceneCount = h.scenes.length;
  h.handle.pause('map');
  assert.equal(h.timers.size, 0); assert.equal(h.pauses(), 1);
  assert.equal(h.clears(), 0); assert.equal(h.scenes.length, sceneCount);
  assert.match(h.story.innerHTML, /paused for you to explore/);
  h.click('play');
  assert.equal(h.scenes.at(-1).focusId, 'node:1');
  assert.equal(h.timers.size, 1);
});


function selectableJourneys(data, selections = {}) {
  const selected = ['a','b'].includes(selections.funding) ? selections.funding : '';
  return [{ id:'funding',title:'Funding',description:'Choose a company',selectorLabel:'Organisation',selection:selected,
    choices:[{value:'a',label:'Alpha'},{value:'b',label:'Beta'}],
    steps:selected ? [0,1,2].map(i=>({title:`${selected} step ${i}`,body:'Recorded connections',scene:{focusId:`${selected}:${i}`}})) : [] }];
}
function pick(h, value) {
  const target = h.story.querySelector('[data-focus]'); assert.ok(target); target.value=value;
  h.story.emit('change',{target});
}

test('a lens opens a neutral dropdown and selecting a subject starts its matching journey', () => {
  const h = setup({build:selectableJourneys}); h.choose();
  assert.equal(h.scenes.length,0); assert.equal(h.timers.size,0);
  assert.match(h.story.innerHTML,/Choose an organisation/);
  pick(h,'b');
  assert.equal(h.scenes.at(-1).focusId,'b:0');
  assert.equal(h.routes.at(-1)[2],'b');
  assert.equal(h.focus.at(-1).id,'journey-focus');
  h.click('play'); h.tick();
  pick(h,'a');
  assert.equal(h.timers.size,0); assert.equal(h.scenes.at(-1).focusId,'a:0');
  assert.equal(h.routes.at(-1)[1],0); assert.equal(h.routes.at(-1)[2],'a');
});

test('shared selections restore the right subject and step; invalid selections stay neutral', () => {
  const h = setup({build:selectableJourneys,options:{initialJourney:'funding',initialFocus:'b',initialStep:2}});
  assert.equal(h.scenes.at(-1).focusId,'b:2'); assert.equal(h.timers.size,0);
  h.handle.setRoute('funding',1,'a'); assert.equal(h.scenes.at(-1).focusId,'a:1');
  const before=h.scenes.length;
  h.handle.setRoute('funding',2,'not-in-graph');
  assert.equal(h.scenes.length,before); assert.match(h.story.innerHTML,/Choose an organisation/);
  assert.equal(h.story.querySelector('[data-action="play"]'),null);
});


test('opening the native selector pauses playback without replacing the focused control', () => {
  const h=setup({build:selectableJourneys});h.choose();pick(h,'a');h.click('play');
  const target=h.story.querySelector('[data-focus]');
  h.story.emit('focusin',{target});
  assert.equal(h.timers.size,0);
  assert.equal(h.story.querySelector('[data-focus]'),target);
  assert.ok(h.pauses()>0);
});

test('generated narration follows the selected subject and cannot change its scene', async () => {
  const requests=[];
  const h=setup({build:selectableJourneys,options:{loadStory:(id,focus,signal)=>new Promise(resolve=>requests.push({focus,signal,resolve}))}});
  h.choose();pick(h,'a');assert.equal(requests.length,1);
  pick(h,'b');assert.equal(requests[0].signal.aborted,true);
  const text=label=>({steps:[0,1,2].map(i=>({title:`${label} story ${i}`,body:`Specific story for ${label}`}))});
  requests[0].resolve(text('wrong'));requests[1].resolve(text('Beta'));
  await new Promise(resolve=>setImmediate(resolve));
  h.click('next');assert.match(h.story.innerHTML,/Beta story 1/);assert.doesNotMatch(h.story.innerHTML,/wrong story/);
  assert.equal(h.scenes.at(-1).focusId,'b:1');
  h.handle.destroy();
});

test('story failures retain the data guide and destruction aborts pending narration', async () => {
  const requests=[];
  const h=setup({build:selectableJourneys,options:{loadStory:(id,focus,signal)=>new Promise((resolve,reject)=>requests.push({signal,reject}))}});
  h.choose();pick(h,'a');requests[0].reject(new Error('unavailable'));
  await new Promise(resolve=>setImmediate(resolve));h.click('next');
  assert.match(h.story.innerHTML,/a step 1/);assert.match(h.story.innerHTML,/written story is unavailable/);
  pick(h,'b');h.handle.destroy();assert.equal(requests[1].signal.aborted,true);
});

test('returning to a subject before its cancelled request settles keeps the new request cancellable', async () => {
 const requests=[];
 const h=setup({build:selectableJourneys,options:{loadStory:(id,focus,signal)=>new Promise(resolve=>requests.push({signal,resolve}))}});
 h.choose();pick(h,'a');pick(h,'b');pick(h,'a');
 requests[0].resolve({steps:[]});await new Promise(resolve=>setImmediate(resolve));
 h.handle.destroy();assert.equal(requests[2].signal.aborted,true);
});

 test('journey events reflect visible steps and never disclose the focus identity', () => {
  const h = setup(); h.choose(); h.click('play'); h.tick();
  assert.deepEqual(h.events.map(e => e.properties.action), ['step','played','step','completed']);
  assert.equal(h.events.at(-1).properties.step, 3);
  assert.ok(!JSON.stringify(h.events).includes('node:'));
  const unavailable = setup({available:false}); unavailable.choose();
  assert.equal(unavailable.events.at(-1).properties.action, 'unavailable');
});
