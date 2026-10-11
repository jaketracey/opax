// Shared browser validation transport. The registry endpoint owns the policy.
export function createTablePrivacyValidator({privacyCheck, fetch, approvals = new Map(), timeout = 30000} = {}) {
  const queue = [], pending = new Map();
  let active = 0;
  function drain() {
    while (active < 8 && queue.length) {
      const {run, resolve} = queue.shift();
      active++;
      run().then(resolve).finally(() => { active--; drain(); });
    }
  }
  async function validate(value) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      let timer;
      try {
        const request = async () => {
          if (privacyCheck) return await privacyCheck(value) === true;
          const response = await fetch('/api/table/privacy', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({text:value}), signal:controller.signal});
          if (!response.ok) throw new Error('Privacy validation unavailable');
          const result = await response.json();
          if (typeof result.safe !== 'boolean') throw new Error('Invalid privacy validation');
          return result.safe;
        };
        const safe = await Promise.race([request(), new Promise((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error('Privacy validation timed out')); }, timeout);
        })]);
        approvals.set(value, safe);
        return safe;
      } catch { /* Retry a failed request once; reject only this value. */ }
      finally { clearTimeout(timer); }
    }
    approvals.set(value, false);
    return false;
  }
  function permit(value) {
    if (approvals.has(value)) return Promise.resolve(approvals.get(value));
    if (!pending.has(value)) {
      pending.set(value, new Promise(resolve => { queue.push({run:() => validate(value), resolve}); drain(); }).finally(() => pending.delete(value)));
    }
    return pending.get(value);
  }
  async function permitSet(values) {
    const valuesToCheck = [...new Set(values)].filter(value => !approvals.has(value));
    if (!valuesToCheck.length) return;
    // Keep batch bodies small as well as bounding the fallback request queue.
    // A large registry scan must not occupy one request for the whole table.
    const batches=[];
    let batch=[],length=0;
    for(const value of valuesToCheck) {
      if(batch.length && (batch.length>=32 || length+value.length>8000)) {batches.push(batch);batch=[];length=0;}
      batch.push(value);length+=value.length+1;
    }
    if(batch.length)batches.push(batch);
    await Promise.all(batches.map(async values => {
      if (await permit(values.join('\n'))) for (const value of values) approvals.set(value, true);
      else await Promise.all(values.map(permit));
    }));
  }
  return {permit, permitSet, approved:value => approvals.get(value) === true};
}
