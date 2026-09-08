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
export function evidenceHTML(entry) {
  const years=Object.entries(entry.years || {}).sort(([a],[b])=>a.localeCompare(b));
  const max=Math.max(1,...years.map(([,n])=>n));
  const recent=years.slice(-12);
  return `<h3 class="subject-section-title">Across the record</h3>
    <p>${Number(entry.records).toLocaleString('en-AU')} records mention this ${entry.kind==='program'?'program':entry.kind==='electorate'?'electorate':'organisation'} by a matching recorded name.</p>
    ${recent.length>1?`<div class="evidence-years" aria-label="Records by year">${recent.map(([year,n])=>`<div><span>${esc(year)}</span><meter min="0" max="${max}" value="${n}" aria-label="${esc(year)}: ${n} records">${n}</meter><strong>${Number(n).toLocaleString('en-AU')}</strong></div>`).join('')}</div>`:''}
    <div class="evidence-excerpts">${(entry.excerpts || []).slice(0,6).map(row=>`<details class="supplier-contract evidence-excerpt"><summary><span><strong>${esc(row.source_kind)}</strong><small>${esc(row.date || 'Date not recorded')}</small></span></summary><blockquote>${esc(row.text)}</blockquote>${safeURL(row.source_url)?`<a href="${esc(safeURL(row.source_url))}" target="_blank" rel="noopener noreferrer">Open the source</a>`:`<a href="/search?kind=speech&q=${encodeURIComponent('"'+row.matched_text+'"')}">Search the indexed speeches</a>`}<details class="evidence-provenance"><summary>Why this connection appears</summary><p>Matching name: <strong>${esc(row.matched_text)}</strong></p><p>Record ${esc(row.source_id)} · Exact recorded name · Text positions ${Number(row.start)}–${Number(row.end)}</p></details></details>`).join('')}</div>
    ${(entry.locations || []).length?`<details class="evidence-locations"><summary>Places in the records</summary><ul>${entry.locations.map(place=>`<li><strong>${esc(place.name)}</strong> · ${esc(place.relationship)} ${esc(place.fields?.postcode)}<small>${place.details?.candidate_electorates>1?'This postcode crosses electorate boundaries.':'Postcode overlap; the precise address has not been located.'}</small></li>`).join('')}</ul></details>`:''}
    <p><a href="/connections.html?entity=${encodeURIComponent(entry.id || '')}">Explore connections, programs and places</a></p>
    <p class="fineprint">A mention shows that a name appears in a record. It does not establish influence. These excerpts cover collected records, including some not yet in search.</p>`;
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
    if (error.name!=='AbortError') root.hidden=true;
    return false;
  }
}
