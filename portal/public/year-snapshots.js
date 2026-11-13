/** Date the static year brief and voice figures from their own year file. */
export function mountYearSnapshots(container, {readYear} = {}) {
  const abort = new AbortController();
  const years = new Map();
  const read = readYear || (async year => {
    const response = await fetch(`/years/${year}.json`, {signal:abort.signal, cache:'no-cache'});
    if (!response.ok) return null;
    return response.json();
  });
  let stopped = false;
  function sync() {
    for (const selector of ['.tm-yearbrief', '.tm-voices']) {
      const block = container.querySelector(selector);
      const fine = block?.querySelector('.tm-fineprint');
      // Use the year of the rendered figures, which can lag the scrubber
      // while the next year's brief is loading.
      const year = /\bfor (\d{4})\b/.exec(fine?.textContent || '')?.[1];
      if (!year) continue;
      if (!years.has(year)) years.set(year, Promise.resolve().then(() => read(year)).catch(() => null));
      years.get(year).then(data => {
        if (stopped || !fine.isConnected || !fine.textContent.includes(`for ${year}`)) return;
        const raw = data?.year === Number(year) && data.generated_at;
        if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(raw)) return;
        const date = new Date(raw);
        if (!Number.isFinite(date.getTime())) return;
        const label = `Snapshot: ${new Intl.DateTimeFormat('en-AU', {day:'numeric', month:'long', year:'numeric', timeZone:'UTC'}).format(date)}.`;
        let note = block.querySelector('[data-year-snapshot]');
        if (!note) {
          note = document.createElement('p');
          note.className = 'tm-fineprint';
          note.dataset.yearSnapshot = year;
          fine.after(note);
        }
        if (note.textContent !== label) note.textContent = label;
      });
    }
  }
  const observer = new MutationObserver(sync);
  observer.observe(container, {childList:true, subtree:true, characterData:true});
  sync();
  return {destroy() {stopped = true;observer.disconnect();abort.abort();}};
}
