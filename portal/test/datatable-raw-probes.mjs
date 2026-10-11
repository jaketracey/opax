// Identities are supplied from the source registry in memory, never fixtures.
export const rawProbeKinds = ['unknown-value','unknown-key','unknown-filter-key','repeated-search','repeated-page','repeated-filter','repeated-search-first','repeated-page-first','repeated-filter-first'];
export function rawProbeParams(value, kind, namespace = 't') {
  const base=namespace ? namespace+'.' : '', params=new URLSearchParams({campaign:'fixture'});
  if (kind==='numeric') params.append(base+'f.amount',JSON.stringify({min:Number(value),max:Number(value)}));
  else if (kind==='unknown-value') params.append(base+'future',value);
  else if (kind==='unknown-key') params.append(value,'fixture');
  else if (kind==='unknown-filter-key') params.append(base+'f.'+value,'[]');
  else {
    const field=kind.includes('search') ? 'q' : kind.includes('page') ? 'page' : 'f.name';
    const encoded=field==='f.name' ? JSON.stringify([value]) : value;
    const safe=field==='q' ? '' : field==='page' ? '1' : '[]';
    for (const item of kind.endsWith('-first') ? [encoded,safe] : [safe,encoded]) params.append(base+field,item);
  }
  return params;
}
