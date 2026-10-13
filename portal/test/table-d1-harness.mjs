import {DatabaseSync} from 'node:sqlite';
import {localMiniflare} from './local-miniflare.mjs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {buildTableSQL} from '../../scripts/load_tables.mjs';
// Reuse the confident-match lane's committed adapter for exhaustive rejection
// probes. It executes the production SQL; API/schema/CSV integration stays on D1.
function memoryD1(){
  let sqlite;
  try{
  sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
  const prepare=sql=>{
    let args=[];const statement={bind(...values){args=values;return this;},
      async all(){const results=sqlite.prepare(sql).all(...args).map(row=>({...row}));return {success:true,results,meta:{duration:0,changes:0}};},
      async first(column){const row=sqlite.prepare(sql).get(...args);return row?(column===undefined?{...row}:row[column]):null;},
      async run(){const result=sqlite.prepare(sql).run(...args);return {success:true,results:[],meta:{duration:0,changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};}};
    return statement;
  };
  return {db:{prepare,batch:async statements=>Promise.all(statements.map(s=>s.all())),exec:async sql=>{sqlite.exec(sql);return {count:0,duration:0};}},dispose:async()=>sqlite.close()};
  }catch(error){sqlite?.close();throw error;}
}
export async function tableDatabase(options={},dependencies={}) {
  const {makeDirectory=mkdtemp,removeDirectory=rm,makeMemory=memoryD1,
    makeMiniflare=localMiniflare,buildSQL=buildTableSQL}=dependencies;
  let root,runtime,ready=false,closed=false,preparationError;
  async function close(){
    if(closed)return;closed=true;
    try{await runtime?.dispose();}
    finally{if(root)await removeDirectory(root,{recursive:true,force:true});}
  }
  try {
    root=await makeDirectory(join(tmpdir(),'opax-table-d1-'));
    // Never share a D1 namespace or storage path between files/fixtures.
    runtime=options.memorySQL?makeMemory():makeMiniflare({rootPath:root,resourcePersistencePath:join(root,'state'),resourceTmpPath:join(root,'runtime'),isolatedResourcePersistencePath:join(root,'isolated'),workers:[{name:"tables",modules:true,script:'export default {fetch(){return new Response("local fixture")}}',compatibilityDate:'2026-09-01',d1Databases:{TABLE_DB:'test-tables-'+randomUUID()}}]});
    const db=options.memorySQL?runtime.db:await runtime.getD1Database('TABLE_DB','tables'),manifest=await buildSQL({...options,output:root});
    for(const file of manifest.files) {
      // D1 exec is line-oriented; every statement here occupies one physical line.
      const sql=await readFile(join(root,file),'utf8');
      // Newlines inside quoted values are legal SQL but exec splits them. Prepared
      // statements preserve exact description values rather than altering them.
      const statements=[];let start=0,quoted=false;
      for(let i=0;i<sql.length;i++) {if(sql[i]==="'") {if(quoted&&sql[i+1]==="'")i++;else quoted=!quoted;}else if(sql[i]===';'&&!quoted){statements.push(sql.slice(start,i+1));start=i+1;}}
      for(let i=0;i<statements.length;i+=100)await db.batch(statements.slice(i,i+100).map(s=>db.prepare(s)));
    }
    ready=true;return {db,manifest,close};
  }catch(error){
    preparationError=error;throw new Error('Local table fixture preparation failed',{cause:error});
  }finally{
    if(!ready)try{await close();}catch(cleanupError){
      if(preparationError)throw new AggregateError([preparationError,cleanupError],'Local table fixture preparation and cleanup failed');
      throw cleanupError;
    }
  }
}
