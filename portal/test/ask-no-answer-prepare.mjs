// Minimal mirror of the real app assets avoids watching the entire export.
import {readdir,mkdir,link,stat,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const source = fileURLToPath(new URL('../public/',import.meta.url));
const output = fileURLToPath(new URL('../private/ask-no-answer/public/',import.meta.url));
async function mirror(path) {
 const from=resolve(source,path),to=resolve(output,path);
 const src=await stat(from),dest=await stat(to).catch(()=>null);
 if (dest?.ino===src.ino && dest?.dev===src.dev) return;
 await mkdir(resolve(to,'..'),{recursive:true});
 if (dest) await unlink(to);
 await link(from,to);
}
for (const entry of await readdir(source,{withFileTypes:true})) if(entry.isFile()) await mirror(entry.name);
for (const dir of ['fonts','tokens','icons']) {
 async function walk(path) {
  for (const entry of await readdir(resolve(source,path),{withFileTypes:true}).catch(()=>[])) {
   const child=path+'/'+entry.name;
   if (entry.isDirectory()) await walk(child); else if(entry.isFile()) await mirror(child);
  }
 }
 await walk(dir);
}
for (const file of ['money.json','money.qld.json','money.vic.json','money.tas.json']) await mirror('graph/'+file);
