import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildTableSQL} from '../../scripts/load_tables.mjs';
export async function tableDatabase(options={}) {
  const root=await mkdtemp(join(tmpdir(),'opax-table-d1-'));
  const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:"tables",modules:true,script:'export default {fetch(){return new Response("local fixture")}}',compatibilityDate:'2026-09-01',d1Databases:{TABLE_DB:'test-tables'}}]}));
  try {
    const db=await mf.getD1Database('TABLE_DB','tables'),manifest=await buildTableSQL({...options,output:root});
    for(const file of manifest.files) {
      // D1 exec is line-oriented; every statement here occupies one physical line.
      const sql=await readFile(join(root,file),'utf8');
      // Newlines inside quoted values are legal SQL but exec splits them. Prepared
      // statements preserve exact description values rather than altering them.
      const statements=[];let start=0,quoted=false;
      for(let i=0;i<sql.length;i++) {if(sql[i]==="'") {if(quoted&&sql[i+1]==="'")i++;else quoted=!quoted;}else if(sql[i]===';'&&!quoted){statements.push(sql.slice(start,i+1));start=i+1;}}
      for(let i=0;i<statements.length;i+=100)await db.batch(statements.slice(i,i+100).map(s=>db.prepare(s)));
    }
    return {db,manifest,async close(){await mf.dispose();await rm(root,{recursive:true,force:true});}};
  } catch {await mf.dispose();await rm(root,{recursive:true,force:true});throw new Error('Local table fixture preparation failed');}
}
