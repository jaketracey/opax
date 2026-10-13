import {TABLE_DATASETS} from '../portal/src/table-datasets.mjs';
export const tableName = name => 'table_' + name.replaceAll('-', '_');
export const quote = value => '"' + value.replaceAll('"','""') + '"';
export const arrayColumns = new Set(['portfolios','sectors','entities','bill','sitting']);
export function tableSchema() {
  const sql = ['CREATE TABLE IF NOT EXISTS table_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;'];
  for (const [name,config] of Object.entries(TABLE_DATASETS)) {
    const table = tableName(name);
    sql.push(`CREATE TABLE IF NOT EXISTS ${table} (rowid INTEGER PRIMARY KEY, ${config.columns.filter(c=>!c.computed).map(c => `${quote(c.key)} ${['money','count','year'].includes(c.type) ? c.type === 'money' ? 'REAL' : 'INTEGER' : 'TEXT'}`).join(', ')}, search TEXT NOT NULL, UNIQUE(id));`);
    for (const c of config.columns.filter(c=>!c.computed)) sql.push(`CREATE INDEX IF NOT EXISTS ${table}_${c.key} ON ${table} (${quote(c.key)}${c.type === 'text' || c.type === 'category' ? ' COLLATE NOCASE' : ''}, rowid);`);
    sql.push(`CREATE VIRTUAL TABLE IF NOT EXISTS ${table}_fts USING fts5(search, content='${table}', content_rowid='rowid', tokenize='unicode61', prefix='1 2 3');`);
    sql.push(`CREATE TABLE IF NOT EXISTS ${table}_facets (key TEXT NOT NULL, value TEXT NOT NULL, rowid INTEGER NOT NULL, PRIMARY KEY(key,value,rowid)) WITHOUT ROWID;`);
    sql.push(`CREATE INDEX IF NOT EXISTS ${table}_facets_row ON ${table}_facets (rowid,key,value);`);
  }
  return sql.join('\n') + '\n';
}
