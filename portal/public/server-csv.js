// Consume the real endpoint's bounded continuation pages as one logical export.
export const CSV_LIMIT = 50000;
export const CSV_TRUNCATION = '# Export truncated at 50,000 rows.';
export function csvRecords(csv) {
  const records=[]; let quoted=false,start=0;
  for (let i=0;i<csv.length;i++) {
    if (csv[i]==='"') {if (quoted && csv[i+1]==='"') i++; else quoted=!quoted;}
    if (!quoted && csv[i]==='\n') {records.push(csv.slice(start,i).replace(/\r$/,''));start=i+1;}
  }
  if (quoted) throw new Error('Invalid CSV');
  if (start<csv.length) records.push(csv.slice(start));
  return records;
}
const csvValue = value => /[",\r\n]/.test(value) ? '"'+value.replaceAll('"','""')+'"' : value;
export async function readServerCSV(first, fetchPage, signal) {
  const origin=new URL(first), seen=new Set(), data=[];
  let url=origin.href,header,headers,truncated=false,finalMarker=false,pages=0;
  while (url) {
    const current=new URL(url,origin);
    if (current.origin!==origin.origin || current.pathname!==origin.pathname || seen.has(current.href) || ++pages>5) throw new Error('Invalid CSV continuation');
    seen.add(current.href);
    const response=await fetchPage(current.href,{signal});
    if (!response.ok) throw new Error(`Export failed (HTTP ${response.status}, page ${pages})`);
    headers ??= response.headers;
    const csv=await response.text();
    truncated ||= response.headers.get('x-table-export-truncated')==='true';
    const rawCount=response.headers.get('x-table-exported');
    // Endpoints without continuation retain the existing core contract.
    if (rawCount==null && pages===1 && !response.headers.get('link')) return {csv,truncated,headers};
    if (!/^\d+$/.test(rawCount || '') || Number(rawCount)>10000) throw new Error('Invalid CSV page');
    const count=Number(rawCount),records=csvRecords(csv);
    header ??= records[0];
    if (records[0]!==header || records.length<count+1 || data.length+count>CSV_LIMIT) throw new Error('Invalid CSV rows');
    data.push(...records.slice(1,count+1));
    const trailers=records.slice(count+1), note=response.headers.get('x-table-export-note');
    if (note) {
      const expected=csvValue(note);
      if (!trailers[0]?.startsWith(expected) || !/^,*$/.test(trailers[0].slice(expected.length))) throw new Error('Missing CSV page note');
      trailers.shift();
    }
    if (trailers[0]===CSV_TRUNCATION) {finalMarker=true;trailers.shift();}
    if (trailers.length) throw new Error('Unexpected CSV trailer');
    const next=/<([^>]+)>;\s*rel="next"/.exec(response.headers.get('link') || '');
    if (finalMarker && next) throw new Error('Premature CSV truncation');
    url=next ? new URL(next[1],current).href : '';
  }
  if (truncated && (data.length!==CSV_LIMIT || !finalMarker)) throw new Error('Missing CSV truncation record');
  return {csv:[header,...data,...(truncated ? [CSV_TRUNCATION] : [])].join('\r\n')+'\r\n',truncated,headers};
}
