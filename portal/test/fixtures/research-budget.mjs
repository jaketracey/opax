import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

/** Execute the production reservation SQL against SQLite, with D1's API. */
export function budgetDatabase() {
  const sqlite=new DatabaseSync(':memory:');
  for(const migration of ['0016_agentic_shadow.sql','0017_research_daily_budget.sql'])
    sqlite.exec(readFileSync(new URL('../../migrations/'+migration,import.meta.url),'utf8'));
  const db={
    prepare(sql) {
      const statement=sqlite.prepare(sql);
      return {bind(...values) {return {
        first:async()=>statement.get(...values)??null,
        run:async()=>({success:true,meta:statement.run(...values)}),
      }}};
    },
  };
  return {db,sqlite,close:()=>sqlite.close()};
}
