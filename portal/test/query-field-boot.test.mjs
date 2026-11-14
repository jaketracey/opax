import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');

function fixture() {
  const frames=[],fits=[],handlers={},fields=new Map(),observers=[];
  let fontReads=0;
  const fonts={get ready(){fontReads++;return Promise.resolve();}};
  const field=id=>{
    if(!fields.has(id))fields.set(id,{id,tagName:'TEXTAREA',isConnected:true,value:'',closest:()=>({addEventListener(){}}),addEventListener(event,fn){handlers[id+':'+event]=fn;}});
    return fields.get(id);
  };
  return {frames,fits,handlers,observers,field,get fontReads(){return fontReads;},
    globals:{$:field,fitQueryField:f=>fits.push(f.id),requestAnimationFrame:fn=>frames.push(fn),document:{fonts},
      ResizeObserver:class{constructor(fn){observers.push(fn);}observe(){}disconnect(){}},addEventListener(){},removeEventListener(){}},
    flush(){for(const fn of frames.splice(0))fn();},
  };
}

test('shared query fields defer font and layout reads until the scheduled frame',async()=>{
  const f=fixture();
  const start=app.indexOf('for (const id of ["ask-input", "search-input"])');
  const end=app.indexOf('// The ask box after an answer.',start);
  assert.ok(start>=0&&end>start);
  runInNewContext(app.slice(start,end),f.globals);
  assert.equal(f.fontReads,0,'reading FontFaceSet.ready can force style and layout');
  assert.deepEqual(f.fits,[],'boot must not synchronously measure hidden query fields');
  f.flush();await Promise.resolve();
  assert.equal(f.fontReads,2);
  assert.ok(f.fits.includes('ask-input')&&f.fits.includes('search-input'));
  const before=f.fits.length;
  f.handlers['ask-input:input']();
  assert.equal(f.fits.length,before+1,'typing still resizes immediately');
});

test('growth query fields schedule the first measurement and ignore height-only resize feedback',async()=>{
  const f=fixture(),field=f.field('growth');
  const form={isConnected:true,querySelector:()=>field,addEventListener(){}};
  const start=app.indexOf('function wireGrowthAsk('),end=app.indexOf('/** The ask field under',start);
  runInNewContext(app.slice(start,end)+';wireGrowthAsk(root);',{...f.globals,root:{querySelector:()=>form}});
  assert.equal(f.fontReads,0);assert.deepEqual(f.fits,[]);
  f.flush();await Promise.resolve();assert.ok(f.fits.length>0);
  f.observers[0]([{contentRect:{width:200,height:44}}]);f.flush();
  const before=f.fits.length;
  f.observers[0]([{contentRect:{width:200,height:88}}]);f.flush();
  assert.equal(f.fits.length,before,'fitting the height must not schedule another fit');
  f.observers[0]([{contentRect:{width:300,height:88}}]);f.flush();
  assert.equal(f.fits.length,before+1,'a width change still refits the question');
});

test('a departed growth form does not perform the pending layout reads',()=>{
  const f=fixture(),form={isConnected:true,querySelector:()=>f.field('growth'),addEventListener(){}};
  const start=app.indexOf('function wireGrowthAsk('),end=app.indexOf('/** The ask field under',start);
  runInNewContext(app.slice(start,end)+';wireGrowthAsk(root);',{...f.globals,root:{querySelector:()=>form}});
  form.isConnected=false;f.flush();
  assert.equal(f.fontReads,0);assert.deepEqual(f.fits,[]);
});
