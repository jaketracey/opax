import {readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const portal=fileURLToPath(new URL('../portal/',import.meta.url));
const dir=process.env.OPAX_TABLE_SQL_DIR || fileURLToPath(new URL('../portal/private/dt-api/sql/',import.meta.url));
if (process.argv.slice(2).join(' ')!=='--local') throw new Error('This helper requires --local; production is reserved for the merge orchestrator.');
const manifest=JSON.parse(await readFile(dir+'manifest.json','utf8'));
for (const [i,file] of manifest.files.entries()) {
  await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[portal+'node_modules/wrangler/bin/wrangler.js','d1','execute','opax-tables','--local','--file',dir+file],{cwd:portal,stdio:['ignore','pipe','pipe']});
    let diagnostic='';
    child.stdout.on('data',b=>{diagnostic+=b;});child.stderr.on('data',b=>{diagnostic+=b;});
    child.on('error',()=>reject(new Error('Local SQL application failed')));child.on('close',(code,signal)=>{
      if(code===0)resolve();else{
        console.error(JSON.stringify({fileIndex:i,exitCode:code,signal,runtime:/runtime|Miniflare/i.test(diagnostic),memory:/memory|ENOMEM|heap/i.test(diagnostic),locked:/locked|busy/i.test(diagnostic),statementLimit:/too (?:large|long)|length|100.*(?:kb|000)/i.test(diagnostic),syntax:/syntax/i.test(diagnostic),unique:/unique/i.test(diagnostic),errorCodes:[...diagnostic.matchAll(/\b(?:SQLITE_[A-Z_]+|D1_[A-Z_]+|ERR_[A-Z_]+)\b/g)].map(m=>m[0])}));
        reject(new Error('Local SQL application failed'));
      }
    });
  });
  await writeFile(dir+'local-progress.json',JSON.stringify({applied:i+1,total:manifest.files.length}));
  if (i%10===0 || i===manifest.files.length-1) console.log(`Local table load: ${i+1}/${manifest.files.length} files applied`);
}
