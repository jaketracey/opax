// The federal donation layer of /graph/money.json: what the party_receipts tool reads and what the research
// follow-up gold was built from. It is the donor and party nodes, the donor-to-party flows, and the meta rows
// that describe how those were selected and derived.
//
// The public-money overlay is not part of it: the AusTender contract and GrantConnect grant flows (grantor
// nodes, edges into donors), each donor's `contracts`, `grants` and `publicMoney` totals, and the meta rows
// that count or date them. export_money_graph.py regenerates that overlay every week as new notices arrive,
// so it moves on nights when no donation changed, and the tool never reads it. `meta.generated` is the export
// date and is validated, not fingerprinted.
import crypto from 'node:crypto'

export const OVERLAY_META=new Set(['generated','edge_count','grants_source','grantor_nodes','donors_with_grants',
 'grant_dollars_to_map_donors','grants_note','contracts_source','contracts_coverage','donors_with_contracts',
 'contract_dollars_to_map_donors','contracts_note'])

// Nodes and edges are listed in a canonical order: the exporter orders them by totals that include the
// overlay, so two exports of the same donations can list them differently. Each record's own arrays
// (returnReferences, aliases) keep their order, which the tool reads.
const byKey=key=>(a,b)=>key(a)<key(b)?-1:key(a)>key(b)?1:0
export function donationLayer(value){
 const meta=Object.fromEntries(Object.entries(value.meta).filter(([key])=>!OVERLAY_META.has(key)))
 const nodes=value.nodes.filter(n=>n.kind==='donor'||n.kind==='party').map(({contracts,grants,publicMoney,...node})=>node).sort(byKey(n=>String(n.id)))
 const edges=value.edges.filter(e=>String(e.target).startsWith('party:')).sort(byKey(e=>`${e.source}\u0000${e.target}`))
 return {meta,nodes,edges}
}

const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value

/** SHA-256 of the donation layer with object keys sorted and array order kept; throws on a missing or invalid export date. */
export function sourceFingerprint(value){
 const generated=value.meta?.generated
 if(typeof generated!=='string')throw new TypeError('money graph needs meta.generated')
 if(!/^\d{4}-\d{2}-\d{2}$/.test(generated))throw new TypeError('meta.generated must be a UTC date')
 const time=Date.parse(`${generated}T00:00:00Z`)
 if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==generated)throw new TypeError('meta.generated must be a valid UTC date')
 return crypto.createHash('sha256').update(JSON.stringify(canonical(donationLayer(value)))).digest('hex')
}
