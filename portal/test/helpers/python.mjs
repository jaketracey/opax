// One way for portal tests to run the repository's Python fixtures.
//
// Interpreter, first match wins:
//   1. OPAX_PYTHON, if set
//   2. <repo>/.venv/bin/python, if it exists
//   3. uv run --frozen python, when uv is on PATH (builds .venv from uv.lock)
//   4. python3
//
// Suites that need a Python module call pythonSkip(['openpyxl']) and pass the
// result as node:test's `skip` option. Outside CI a missing module skips with
// a reason; with CI set it throws, so a broken CI environment still fails.
import {execFileSync,spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const repoRoot=fileURLToPath(new URL('../../../',import.meta.url));

let resolved;
export function pythonCommand(){
 if(resolved)return resolved;
 if(process.env.OPAX_PYTHON)return resolved={cmd:process.env.OPAX_PYTHON,args:[],source:'OPAX_PYTHON'};
 const venv=join(repoRoot,'.venv','bin','python');
 if(existsSync(venv))return resolved={cmd:venv,args:[],source:'.venv'};
 if(spawnSync('uv',['--version'],{stdio:'ignore'}).status===0)
  return resolved={cmd:'uv',args:['run','--frozen','--project',repoRoot,'python'],source:'uv run --frozen'};
 return resolved={cmd:'python3',args:[],source:'python3'};
}

// execFileSync with the resolved interpreter; cwd defaults to the repo root.
export function runPython(args,options={}){
 const {cmd,args:prefix}=pythonCommand();
 return execFileSync(cmd,[...prefix,...args],{cwd:repoRoot,encoding:'utf8',...options});
}

const missingCache=new Map();
export function missingPythonModules(modules){
 const key=modules.join(',');
 if(missingCache.has(key))return missingCache.get(key);
 const {cmd,args}=pythonCommand();
 const probe='import importlib.util,sys;print(",".join(m for m in sys.argv[1:] if importlib.util.find_spec(m) is None))';
 const r=spawnSync(cmd,[...args,'-c',probe,...modules],{cwd:repoRoot,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 // An interpreter that cannot start (or a uv sync that fails) counts as all missing.
 const missing=r.status===0?r.stdout.trim().split(',').filter(Boolean):[...modules];
 missingCache.set(key,missing);
 return missing;
}

// false when every module imports; otherwise a skip reason (or a throw under CI).
export function pythonSkip(modules=['openpyxl']){
 const missing=missingPythonModules(modules);
 if(!missing.length)return false;
 const reason=`${missing.join(', ')} unavailable: run uv sync --frozen`;
 if(process.env.CI)throw new Error(`${reason} (CI is set, so this fails instead of skipping; Python via ${pythonCommand().source})`);
 return reason;
}
