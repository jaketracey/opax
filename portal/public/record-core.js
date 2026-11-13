import {grantRows, supplierRows, contractRows, topicRows, rowsHTML} from './record-core-content.js';

/** Adopt the server table as the interactive list. No second list is mounted. */
export function hydrateRecordCore(kind, data, {jurisdiction = 'federal', slug, recipientIds} = {}) {
  const core = document.querySelector('#prerender[data-record-core]');
  const kinds = kind === 'agency' ? ['agency-suppliers','agency-contracts'] : [kind];
  const sections = kinds.map(name=>core?.querySelector(`[data-record-list="${name}"]`));
  if (sections.some(section=>!section || section.dataset.recordId !== String(slug || data.id))) return false;
  for (const section of sections) {
    if (section.dataset.hydrated) continue;
    const type = section.dataset.recordList;
    const input = section.querySelector('input'), sort = section.querySelector('select');
    const previous = section.querySelector('[data-record-previous]'), next = section.querySelector('[data-record-next]');
    const status = section.querySelector('[role="status"]');
    const source = type === 'agency-suppliers' ? data.suppliers
      : type === 'agency-contracts' ? data.contracts.filter(c=>!((!c.start_date || !/^\d{4}-\d{2}-\d{2}/.test(c.start_date) || Number(c.start_date.slice(0,4))<=1900) && !(Number(c.amount)>0)))
      : type === 'topic' ? data.results.filter(s=>s.slug) : data.grants || [];
    let page = 0;
    const matches = () => {
      const q = input.value.trim().toLocaleLowerCase('en-AU');
      const rows = source.filter(row=>Object.values(row).filter(v=>typeof v === 'string').join(' ').toLocaleLowerCase('en-AU').includes(q));
      if (type === 'agency-suppliers') {
        const name = (a,b)=>a.name.localeCompare(b.name,'en-AU',{sensitivity:'base',numeric:true}) || a.id.localeCompare(b.id);
        const value = sort.value;
        rows.sort((a,b)=>(value === 'value_asc' ? a.total-b.total : value === 'count_desc' ? b.count-a.count : value === 'count_asc' ? a.count-b.count : value === 'name_desc' ? -name(a,b) : value === 'name_asc' ? name(a,b) : b.total-a.total) || name(a,b));
      } else if (type === 'topic' && sort.value === 'oldest') rows.sort((a,b)=>(a.date || '9999').localeCompare(b.date || '9999'));
      return rows;
    };
    function controls(rows) {
      previous.disabled = page === 0;
      next.disabled = (page+1)*20 >= rows.length;
    }
    function paint() {
      const rows = matches(), visible = rows.slice(page*20,page*20+20);
      const cells = type === 'agency-suppliers' ? supplierRows(visible) : type === 'agency-contracts' ? contractRows(visible) : type === 'topic' ? topicRows(visible) : grantRows(visible,data,jurisdiction,type === 'program',recipientIds);
      section.querySelector('tbody').innerHTML = rowsHTML(cells);
      status.textContent = `Showing ${rows.length ? `${page*20+1}–${Math.min((page+1)*20,rows.length)}` : '0'} of ${rows.length} listed records`;
      controls(rows);
    }
    input.disabled = false;
    if (sort) { sort.disabled = false; sort.addEventListener('change',()=>{page=0;paint();}); }
    input.addEventListener('input',()=>{page=0;paint();});
    previous.addEventListener('click',()=>{page--;paint();});
    next.addEventListener('click',()=>{page++;paint();});
    controls(matches());
    section.dataset.hydrated = 'true';
  }
  core.dataset.recordHydrated = kind;
  return true;
}
