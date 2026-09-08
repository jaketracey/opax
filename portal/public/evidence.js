/* Source-backed connections. Only unambiguous identities are displayed. */
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export const nameKey = value => (String(value || '').toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || []).join(' ');
const safeURL = value => /^https?:\/\//i.test(String(value || '')) ? value : null;
async function hash(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2,'0')).join('');
}
async function read(url, signal) {
  const response = await fetch(url, {signal});
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Connection records unavailable');
  return response.json();
}
function displayDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return value || 'Date not recorded';
  const date=new Date(value+'T00:00:00');
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'});
}
function sourceContent(row) {
  const fields=row.details?.source_fields;
  if (!fields) return `<blockquote>${esc(row.text)}</blockquote>`;
  const values=[['Recipient',fields.recipient,'recipient'],['Recorded amount',fields.amount==null?null:Number(fields.amount).toLocaleString('en-AU',{style:'currency',currency:'AUD',maximumFractionDigits:0})],['Program',fields.program,'program'],['Agency',fields.agency],['Recorded place',[fields.suburb,fields.state?.toUpperCase(),fields.postcode].filter(Boolean).join(', '),'place']];
  return `<dl class="evidence-fields">${values.filter(([,value])=>value).map(([label,value,field])=>`<div><dt>${esc(label)}</dt><dd>${/^[a-f0-9]{24}$/.test(row.links?.[field] || '')?`<a href="/connections.html?entity=${row.links[field]}">${esc(value)}</a>`:esc(value)}</dd></div>`).join('')}</dl>`;
}
export function evidenceHTML(entry) {
  const years=Object.entries(entry.years || {}).filter(([year])=>/^\d{4}$/.test(year)).sort(([a],[b])=>a.localeCompare(b));
  const max=Math.max(1,...years.map(([,n])=>n));
  const recent=years.slice(-12);
  return `<h3 class="subject-section-title">Across the record</h3>
    <p>${Number(entry.records).toLocaleString('en-AU')} ${entry.records===1?'record':'records'} connected to this ${entry.kind==='program'?'program':entry.kind==='electorate'?'electorate':entry.kind==='place'?'place':'organisation'}.</p>
    ${recent.length>1?`<div class="evidence-years" aria-label="Records by year">${recent.map(([year,n])=>`<div><span>${esc(year)}</span><svg viewBox="0 0 100 5" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="5" rx="2" fill="#e8edef"/><rect width="${(n/max*100).toFixed(2)}" height="5" rx="2" fill="#52768c"/></svg><strong>${Number(n).toLocaleString('en-AU')}</strong></div>`).join('')}</div>`:''}
    ${entry.years?.Undated?`<p class="fineprint">${Number(entry.years.Undated).toLocaleString('en-AU')} records have no recorded start date.</p>`:''}
    <div class="evidence-excerpts">${(entry.excerpts || []).slice(0,6).map(row=>`<details class="supplier-contract evidence-excerpt"><summary><span><strong>${esc(row.details?.source_fields?.recipient ? 'Grant to '+row.details.source_fields.recipient : row.source_kind)}</strong><small>${esc(displayDate(row.date))}</small></span></summary>${sourceContent(row)}${safeURL(row.source_url)?`<a href="${esc(safeURL(row.source_url))}" target="_blank" rel="noopener noreferrer">Open the source</a>`:`<a href="/search?kind=speech&q=${encodeURIComponent('"'+row.matched_text+'"')}">Search the indexed speeches</a>`}<details class="evidence-provenance"><summary>Why this connection appears</summary>${row.source_table==='government_grants'?`<p>${row.predicate==='grant_program'?'Program named in the grant record.':'Location recorded with the grant.'} ${esc(row.details?.allocation_note || '')}</p><p>Record ${esc(row.source_id)}${row.details?.candidate_electorates>1?' · This postcode crosses electorate boundaries.':''}</p>`:`<p>Matching name: <strong>${esc(row.matched_text)}</strong></p><p>Record ${esc(row.source_id)} · Exact recorded name · Text positions ${Number(row.start)}–${Number(row.end)}</p>`}</details></details>`).join('')}</div>
    ${(entry.locations || []).length?`<details class="evidence-locations"><summary>Places in the records</summary><ul>${entry.locations.map(place=>`<li><strong>${esc(place.name)}</strong> · ${esc(place.relationship)} ${esc(place.fields?.postcode)}<small>${place.details?.candidate_electorates>1?'This postcode crosses electorate boundaries.':'Postcode overlap; the precise address has not been located.'}</small></li>`).join('')}</ul></details>`:''}
    ${(entry.representatives || []).length?`<details class="evidence-locations"><summary>Speakers recorded for this electorate</summary><ul>${entry.representatives.slice(0,15).map(person=>`<li><a href="/subject/person/${encodeURIComponent(person.name)}">${esc(person.name)}</a><small>${Number(person.records).toLocaleString('en-AU')} speeches carrying this electorate in their source fields · ${esc(person.first_date)} to ${esc(person.last_date)}</small></li>`).join('')}</ul><p class="fineprint">Speech metadata, not a list of current officeholders or verified terms of office.</p></details>`:''}
    ${(entry.identity_links || []).length?`<details class="evidence-locations"><summary>How the identities connect</summary><ul>${entry.identity_links.map(link=>`<li>${esc(link.name)} · ABN ${esc(link.abn)}<small>Exact full name matched to a source identity with a validated ABN.</small><details><summary>Source records</summary><pre>${esc(JSON.stringify({source:link.source_records,matched:link.matching_records},null,2))}</pre></details></li>`).join('')}</ul></details>`:''}
    <p><a href="/connections.html?entity=${encodeURIComponent(entry.id || '')}">Explore connections, programs and places</a></p>
    <p class="fineprint">Connections come from recorded names and locations. They do not establish influence. Coverage includes some records not yet in search.</p>`;
}
export async function mountEvidence(root, identity, options={}) {
  const lookup=identity.abn ? 'abn:'+String(identity.abn).replace(/\s/g,'') : nameKey(identity.name);
  if (!lookup) return false;
  try {
    const shard=(await hash(lookup)).slice(0,2);
    const names=await read(`/evidence/lookup/${shard}.json`,options.signal);
    const ids=names?.[lookup];
    if (!Array.isArray(ids) || ids.length!==1 || !/^[a-f0-9]{24}$/.test(ids[0])) return false;
    if (identity.abn && identity.name) {
      const name=nameKey(identity.name);
      const nameShard=(await hash(name)).slice(0,2);
      const nameLookup=await read(`/evidence/lookup/${nameShard}.json`,options.signal);
      // A source profile with a mismatched name/ABN must not inherit evidence.
      if (!nameLookup?.[name]?.includes(ids[0])) return false;
    }
    const data=await read(`/evidence/${ids[0].slice(0,2)}.json`,options.signal);
    const entry=data?.entries?.[ids[0]];
    if (!entry || options.alive && !options.alive()) return false;
    root.innerHTML=evidenceHTML(options.compact ? {...entry, years:{},locations:[],excerpts:entry.excerpts.slice(0,2)} : entry);
    root.hidden=false;
    return true;
  } catch(error) {
    root.hidden=true;
    if (error.name!=='AbortError') throw error;
    return false;
  }
}

export function evidenceStatsHTML(meta) {
  if (!meta?.complete) return '';
  const number=value=>Number(value||0).toLocaleString('en-AU');
  const checked=Object.values(meta.source_records||{}).reduce((sum,value)=>sum+Number(value),0);
  return `<h2>Connections in the collected records</h2><div class="stat-grid"><span><span class="stat-figure">${number(checked)}</span><span class="stat-label">source records checked</span></span><span><span class="stat-figure">${number(meta.published_record_matches)}</span><span class="stat-label">connections to source records</span></span><span><span class="stat-figure">${number(meta.entities_with_connections)}</span><span class="stat-label">organisations, programs and places</span></span><span><span class="stat-figure">${number(meta.identity_decisions?.accepted)}</span><span class="stat-label">reviewed identity matches</span></span></div><p>One record can connect to several entries. This dataset includes collected material that is not yet searchable in the live index.</p><p><a href="/connections.html">Explore the connections</a></p><details><summary>Coverage and matching</summary><ul><li>${number(meta.source_records?.speeches)} speech records</li><li>${number(meta.source_records?.ext_press_releases)} official releases</li><li>${number(meta.source_records?.government_grants)} grant records</li></ul><p>Names are matched conservatively. Shared postcodes retain all overlapping electorates. Unresolved identities are held for review.</p><p><a href="/evidence/stats.json">Download coverage figures</a> · <a href="/evidence/identity-links.json">Download identity matches</a></p></details>`;
}
