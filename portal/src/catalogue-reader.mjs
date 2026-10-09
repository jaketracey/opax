// Cache only manifest/index projections for five minutes per asset binding.
// Detail chunks are read on demand; failed reads are immediately evicted.
const readers = new WeakMap();
export function catalogueReader(assets) {
  if(readers.has(assets)) return readers.get(assets);
  const cache = new Map();
  const read = path => {
    const hit = cache.get(path);
    if(hit && hit.expires > Date.now()) return hit.value;
    const value = assets.fetch(new Request('https://opax.com.au'+path)).then(response => {
      if(!response.ok) throw new Error('Catalogue unavailable');
      return response.json();
    });
    if(/^\/(?:instruments|audit)\/(?:manifest|index)\.json$/.test(path)) {
      cache.set(path,{expires:Date.now()+300_000,value});
      void value.catch(()=>{if(cache.get(path)?.value === value)cache.delete(path)});
    }
    return value;
  };
  readers.set(assets,read);
  return read;
}
