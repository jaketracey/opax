import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

// npm install --prefix staging/web-vitals-review/tooling lighthouse@13.6.0
const output=resolve(process.env.OPAX_LANTERN_OUTPUT||'staging/web-vitals-review/lantern');
const tooling=resolve(process.env.OPAX_LANTERN_TOOLS||'staging/web-vitals-review/tooling/node_modules');
const origins={main:process.env.OPAX_LANTERN_MAIN||'http://127.0.0.1:8945',branch:process.env.OPAX_LANTERN_BRANCH||'http://127.0.0.1:8944'};
for(const base of Object.values(origins)){
  const url=new URL(base);
  if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.origin!==base)throw Error('Lantern audits require loopback HTTP origins');
}
const require=createRequire(join(homedir(),'opax-work/qa/phone-390/package.json'));
const {chromium}=require('playwright');
const {default:lighthouse}=await import(pathToFileURL(join(tooling,'lighthouse/core/index.js')));
const {MainThreadTasks}=await import(pathToFileURL(join(tooling,'lighthouse/core/computed/main-thread-tasks.js')));
const {getAttributableURLForTask}=await import(pathToFileURL(join(tooling,'lighthouse/core/lib/tracehouse/task-summary.js')));
const {default:puppeteer}=await import(pathToFileURL(join(tooling,'puppeteer-core/lib/puppeteer/puppeteer-core.js')));
const pages=[['Bill','/bill/au-federal-r7534'],['Donor','/subject/donor/Mineralogy%20PTY%20LTD'],['Labor','/subject/party/australian-labor-party'],['Person','/subject/person/anthony-albanese'],['Division','/doc/division-federal-representatives-8941']];
const only=process.env.OPAX_LANTERN_PAGES?.split(',');
const versions=process.env.OPAX_LANTERN_VERSIONS?.split(',')||['main','branch'];
if(only?.some(name=>!pages.some(([page])=>page===name))||versions.some(v=>!origins[v]))throw Error('Unknown page/version');
const label=process.argv[2]||'comparison';
if(!/^[a-z][a-z0-9-]*$/.test(label))throw Error('Invalid output label');
mkdirSync(output,{recursive:true});
const resultFile=join(output,label+'.json');
const rows=process.env.OPAX_LANTERN_RESUME==='1'&&existsSync(resultFile)?JSON.parse(readFileSync(resultFile,'utf8')):[];
async function capacity(){
  for(;;){const load=readFileSync('/proc/loadavg','utf8').trim();if(+load.split(' ')[1]<=40)return load;console.log(JSON.stringify({waitingForLoad5:load}));await new Promise(r=>setTimeout(r,30000));}
}
const provenance={};
for(const[version,base]of Object.entries(origins)){
  const response=await fetch(base+'/ask',{signal:AbortSignal.timeout(30000)}),html=await response.text();
  const app=html.match(/src="(\/app\.js\?v=[a-f0-9]+)"/)?.[1];
  if(!response.ok||!app)throw Error('Preview not ready: '+version);
  const asset=await fetch(base+app,{signal:AbortSignal.timeout(30000)});
  if(!asset.ok)throw Error('App not ready: '+version);
  const assets=[...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)].map(match=>match[1]).sort();
  provenance[version]={base,app,sha256:createHash('sha256').update(await asset.text()).digest('hex'),assets};
}
const provenanceFile=join(output,label+'-provenance.json');
if(rows.length&&(!existsSync(provenanceFile)||JSON.stringify(JSON.parse(readFileSync(provenanceFile,'utf8')))!==JSON.stringify(provenance)))throw Error('Cannot resume an audit after preview assets change');
writeFileSync(provenanceFile,JSON.stringify(provenance,null,2));
let browser;
const stop=async()=>{await browser?.close();process.exit(143);};
process.once('SIGTERM',stop);
try{
  for(const[name,path]of pages){
    if(only&&!only.includes(name))continue;
    for(let run=1;run<=5;run++)for(const version of(run%2?versions:[...versions].reverse())){
      if(rows.some(r=>r.name===name&&r.run===run&&r.version===version))continue;
      const load=await capacity(),base=origins[version];
      browser=await puppeteer.launch({executablePath:chromium.executablePath(),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
      writeFileSync(join(output,label+'-pids.json'),JSON.stringify({audit:process.pid,browser:browser.process().pid}));
      const context=await browser.createBrowserContext(),page=await context.newPage();
      const blocked=[],errors=[],failures=[];
      await page.setRequestInterception(true);
      page.on('request',request=>{
        const url=new URL(request.url());
        if(url.protocol==='data:'||url.protocol==='about:')return request.continue();
        if(url.origin!==base||request.method()!=='GET'||/^\/(ingest|og\/|api\/(ask|voice|chat|research|followups|search-summary|journey-story|money-overview|community))/.test(url.pathname)){
          blocked.push(url.origin===base?url.pathname:url.hostname);return request.abort();
        }
        return request.continue();
      });
      page.on('pageerror',error=>errors.push(error.message));
      page.on('response',response=>{if(response.status()>=400)failures.push({url:response.url().replace(base,''),status:response.status()});});
      console.log(JSON.stringify({starting:name,version,run,load}));
      await page.bringToFront();
      const deadline=setTimeout(()=>page.close().catch(()=>{}),180000);
      try{
        const result=await lighthouse(base+path,{
          logLevel:'error',output:'json',throttlingMethod:'simulate',formFactor:'mobile',
          screenEmulation:{mobile:true,width:390,height:844,deviceScaleFactor:1,disabled:false},
          onlyAudits:['total-blocking-time','first-contentful-paint','largest-contentful-paint','long-tasks','bootup-time','mainthread-work-breakdown','network-requests','metrics'],
          disableFullPageScreenshot:true,maxWaitForLoad:90000,
        },undefined,page);
        const {lhr,artifacts}=result;
        if(lhr.runtimeError){
          writeFileSync(join(output,`${label}-${name}-${version}-${run}.invalid.json`),JSON.stringify({runtimeError:lhr.runtimeError,errors,failures,url:page.url(),requests:lhr.audits['network-requests']?.details?.items},null,2));
          throw Error(lhr.runtimeError.message);
        }
        const state=await page.evaluate(()=>({routed:document.documentElement.classList.contains('spa-routed'),loaders:[...document.querySelectorAll('#main .answer-skeleton,#main .subject-skel,#main .dt-loading-row')].filter(n=>n.getClientRects().length).length}));
        if(!state.routed||state.loaders||errors.length||failures.length)throw Error('Incomplete page: '+JSON.stringify({state,errors,failures}));
        let tasks;
        try{tasks=run===1?await MainThreadTasks.request(artifacts.Trace,{computedCache:new Map()}):[];}
        catch(error){
          writeFileSync(join(output,`${label}-${name}-${version}-${run}.invalid.json`),JSON.stringify({reason:error.code||error.message,errors,failures},null,2));
          writeFileSync(join(output,`${label}-${name}-${version}-${run}.invalid.trace.json`),JSON.stringify(artifacts.Trace));
          throw error;
        }
        const jsUrls=new Set(lhr.audits['network-requests'].details.items.filter(r=>r.resourceType==='Script').map(r=>r.url));
        const longTasks=tasks.filter(t=>!t.parent&&!t.unbounded&&t.duration>50).map(t=>({start:t.startTime,duration:t.duration,url:getAttributableURLForTask(t,jsUrls).replace(base,'')}));
        const row={name,path,version,run,load,endLoad:readFileSync('/proc/loadavg','utf8').trim(),lighthouse:lhr.lighthouseVersion,settings:lhr.configSettings,
          tbt:lhr.audits['total-blocking-time'].numericValue,fcp:lhr.audits['first-contentful-paint'].numericValue,lcp:lhr.audits['largest-contentful-paint'].numericValue,
          benchmarkIndex:lhr.environment.benchmarkIndex,longTaskCount:run===1?longTasks.length:null,longTasks,simulatedLongTasks:lhr.audits['long-tasks'].details.debugData?.tasks||[],
          boot:lhr.audits['bootup-time'].details.items,breakdown:lhr.audits['mainthread-work-breakdown'].details.items,blocked,errors,failures,state,warnings:lhr.runWarnings};
        writeFileSync(join(output,`${label}-${name}-${version}-${run}.lhr.json`),JSON.stringify(lhr));
        if(run===1){writeFileSync(join(output,`${label}-${name}-${version}.trace.json`),JSON.stringify(artifacts.Trace));writeFileSync(join(output,`${label}-${name}-${version}.devtools.json`),JSON.stringify(artifacts.DevtoolsLog));}
        rows.push(row);writeFileSync(resultFile,JSON.stringify(rows,null,2));
        console.log(JSON.stringify({name,version,run,tbt:row.tbt,lcp:row.lcp,longTasks:row.longTaskCount,benchmarkIndex:row.benchmarkIndex}));
      }finally{clearTimeout(deadline);await context.close();await browser.close();browser=undefined;}
    }
  }
}finally{process.removeListener('SIGTERM',stop);await browser?.close();}
