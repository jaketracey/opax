import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';

const protectedTables=new Set(['members','voice_sessions','community_threads','direct_conversations']);
// An exception requires a security review of the preservation procedure. Pin the
// exact file bytes here with {sha256, reviewer, review, rationale}; never accept
// an opt-out comment in a migration. There are no approved exceptions today.
const reviewedExceptions={};
const digest=sql=>createHash('sha256').update(sql).digest('hex');

function unsafeChanges(sql){
 // Tokenize before discarding comments so quoted identifiers/strings containing
 // comment markers or semicolons cannot hide DDL or create false positives.
 const tokens=sql.match(/--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/|"(?:[^"]|"")*"|'(?:[^']|'')*'|`(?:[^`]|``)*`|\[[^\]]*\]|[A-Za-z_]\w*|[^\s]/g)||[];
 const statements=[[]];
 for(const token of tokens){
  if(token.startsWith('--')||token.startsWith('/*'))continue;
  if(token===';'){statements.push([]);continue}
  const value=/^["'`\[]/.test(token)?token.slice(1,-1).replace(/""/g,'"').replace(/''/g,"'").replace(/``/g,'`'):token;
  statements.at(-1).push(value.toLowerCase());
 }
 const changes=[];
 for(const words of statements){
  let i=0,operation=words[i++];
  if(operation==='create'&&['temp','temporary','virtual'].includes(words[i]))i++;
  if(!['create','drop','alter'].includes(operation)||words[i++]!=='table')continue;
  if(words[i]==='if')i+=operation==='create'?3:2;
  const name=()=>{let result=words[i++];if(words[i]==='.'){i++;result=words[i++]}return result};
  const table=name();
  if(operation==='alter'){
   if(words[i++]!=='rename'||words[i++]!=='to')continue; // Column changes do not rebuild the table.
   const target=name();
   if(protectedTables.has(table)||protectedTables.has(target))changes.push(`rename ${table} to ${target}`);
  }else if(protectedTables.has(table))changes.push(`${operation} ${table}`);
 }
 return changes;
}
function checkMigration(file,sql,exceptions=reviewedExceptions){
 const changes=unsafeChanges(sql),exception=exceptions[file];
 if(!changes.length){assert.equal(exception,undefined,`${file}: stale exception`);return}
 assert.ok(exception,`${file}: ${changes.join(', ')} requires an explicit reviewed exception; defer_foreign_keys does not suppress delete actions`);
 for(const field of ['reviewer','review','rationale'])assert.ok(typeof exception[field]==='string'&&exception[field].trim().length,`${file}: missing ${field}`);
 assert.equal(exception.sha256,digest(sql),`${file}: exception must pin the exact reviewed migration bytes`);
}

test('post-0012 migrations cannot rebuild deletion-linked tables without a reviewed exception',()=>{
 const files=readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')&&name>'0012_voice_deletion_safe.sql');
 for(const file of files)checkMigration(file,readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 for(const file of Object.keys(reviewedExceptions))assert.ok(files.includes(file),`${file}: exception has no later migration`);
});

test('migration guard catches drops, recreations and renames in either direction, including quoted/schema names',()=>{
 for(const table of protectedTables){
  for(const sql of [`DROP TABLE ${table};`,`DROP TABLE IF EXISTS main."${table}";`,`CREATE TABLE ${table}(id TEXT);`,`CREATE VIRTUAL TABLE ${table} USING fts5(body);`,`CREATE TEMP TABLE IF NOT EXISTS [${table}](id TEXT);`,`CREATE TABLE '${table}'(id TEXT);`,`ALTER TABLE ${table} RENAME TO scratch;`,`ALTER TABLE main.scratch RENAME TO \`${table}\`;`,`/* rebuild */ ALTER\n TABLE "${table}" RENAME /* into */ TO main.scratch;`]){
   assert.equal(unsafeChanges(sql).length,1,sql);
   assert.throws(()=>checkMigration('0013_unsafe.sql',sql),/reviewed exception/,sql);
  }
 }
 assert.deepEqual(unsafeChanges("-- DROP TABLE members;\nINSERT INTO audit VALUES ('DROP TABLE members; -- text'); /* CREATE TABLE voice_sessions */ ALTER TABLE members ADD COLUMN example TEXT; ALTER TABLE members RENAME COLUMN example TO renamed; DROP TABLE scratch; CREATE TABLE scratch(id TEXT);"),[]);
});

test('migration exceptions require review evidence and fail when the reviewed file changes',()=>{
 const file='0013_reviewed.sql',sql='ALTER TABLE members RENAME TO reviewed_copy;';
 const exception={sha256:digest(sql),reviewer:'Security reviewer',review:'local review reference',rationale:'Seeded D1 preservation procedure approved'};
 assert.doesNotThrow(()=>checkMigration(file,sql,{[file]:exception}));
 assert.throws(()=>checkMigration(file,sql+'\n',{[file]:exception}),/exact reviewed migration bytes/);
 for(const field of ['reviewer','review','rationale'])assert.throws(()=>checkMigration(file,sql,{[file]:{...exception,[field]:''}}),new RegExp('missing '+field));
 assert.throws(()=>checkMigration(file,'ALTER TABLE members ADD COLUMN example TEXT;',{[file]:exception}),/stale exception/);
});
