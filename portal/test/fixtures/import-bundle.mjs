// Import an esbuild bundle from a temporary file rather than a data: URL. A data: URL module puts the whole bundle,
// base64 encoded, into every stack frame, so one logged error can print megabytes (and CI log masking then stalls).
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'

let dir,count=0
/** Import bundle text (esbuild outputFiles[0].text) as an ES module; frames read file:///tmp/…/name-N.mjs:line. */
export async function importBundle(text,name='bundle'){
  if(!dir){dir=mkdtempSync(join(tmpdir(),'opax-test-'));process.once('exit',()=>rmSync(dir,{recursive:true,force:true}))}
  const file=join(dir,`${name.replace(/[^\w-]/g,'_')}-${++count}.mjs`)
  writeFileSync(file,text)
  return import(pathToFileURL(file).href)
}
