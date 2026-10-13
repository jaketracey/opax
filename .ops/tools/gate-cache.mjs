import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {git,identity,cacheKey} from './gate-lib.mjs';
import {cacheDirectory,readPass,pullPass,publishPass,importPass,authoritative,compactPass} from './gate-cache-lib.mjs';
const [command,...args]=process.argv.slice(2),root=git(process.cwd(),['rev-parse','--show-toplevel']);
const value=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined;
const id=identity(root),cache=cacheDirectory(root),file=join(cache,cacheKey(id)+'.json');
if(command==='identity'){
 const result=JSON.stringify({key:cacheKey(id),identity:id},null,2)+'\n';
 if(value('--out'))writeFileSync(resolve(value('--out')),result);else process.stdout.write(result);
}else if(command==='import'){
 if(!args[0])throw Error('import needs a trusted receipt path');
 importPass(file,JSON.parse(readFileSync(resolve(args[0]))),id);console.log(`IMPORTED PASS ${cacheKey(id)}`);
}else if(command==='pull'){
 const record=readPass(file);
 if(authoritative(record,id)||pullPass(cache,id))console.log(`AUTHORITATIVE PASS ${cacheKey(id)}`);else process.exitCode=3;
}else if(command==='verify'||command==='export'||command==='push'){
 const record=readPass(file);if(!authoritative(record,id))throw Error('No authoritative full pass for this tree/toolchain');
 if(command==='export'){if(!args[0])throw Error('export needs a receipt path');writeFileSync(resolve(args[0]),JSON.stringify(compactPass(record))+'\n');}
 if(command==='push'&&!publishPass(record))throw Error('No desktop registry configured');
 console.log(`AUTHORITATIVE PASS ${cacheKey(id)}`);
}else throw Error('Usage: gate-cache.mjs identity [--out FILE] | pull | verify | import FILE | export FILE | push');
