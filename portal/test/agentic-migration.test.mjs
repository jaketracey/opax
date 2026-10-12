import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
test('the monitoring migration applies twice locally and permits only the privacy allowlist',()=>{
 const sql=readFileSync(new URL('../migrations/0016_agentic_shadow.sql',import.meta.url),'utf8');
 const script=`import sqlite3,sys\ndb=sqlite3.connect(':memory:')\nsql=sys.stdin.read()\ndb.executescript(sql)\ndb.executescript(sql)\nassert [r[1] for r in db.execute('PRAGMA table_info(agentic_shadow)')]==['question_hash','shape','latency_ms','cost_usd']\ndb.execute('INSERT INTO agentic_shadow VALUES (?,?,?,?)',('a'*64,'ranking',1234,0.001))\nassert db.execute('SELECT COUNT(*) FROM agentic_shadow').fetchone()[0]==1\nfor values in [('question text','ranking',1,0),('a'*64,'junk',1,0),('a'*64,'trend',-1,0)]:\n try: db.execute('INSERT INTO agentic_shadow VALUES (?,?,?,?)',values)\n except sqlite3.IntegrityError: pass\n else: raise AssertionError('invalid monitoring row accepted')\n`;
 const r=spawnSync('python3',['-c',script],{input:sql,encoding:'utf8'});assert.equal(r.status,0,r.stderr);
});
