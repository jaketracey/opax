// Shared tokenizer for the generated public-record index and runtime queries.
export function normalize(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
const STOP = new Set('a an and are as at be by for from has in into is it of on or the to was were with'.split(' '));
export function tokens(value) {
  return [...new Set(normalize(value).split(' ').filter(t => t.length > 1 && !STOP.has(t)).map(t => t.length > 4 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0,-1) : t))];
}
export function bucket(term) {
  let hash = 2166136261;
  for (const c of term.slice(0, 2)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0) % 64;
}
