/** The bill's published text, kept separate from the machine-written summary. */
const KEY = /^[a-z0-9][a-z0-9-]{1,160}$/;
const safeSource = value => {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
};
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text != null) node.textContent = String(text);
  if (className) node.className = className;
  return node;
};
const sourceLink = (url, label) => {
  const href = safeSource(url);
  if (!href) return null;
  const a = element('a', label); a.href = href; a.target = '_blank'; a.rel = 'noopener'; return a;
};
export function billTextVersionLabel(version) {
  const stage = version.stage_label || version.source_version || version.stage || 'Published version';
  return `${stage}${version.date ? ` · ${version.date}` : ''}${version.status === 'complete' ? '' : version.status === 'incomplete' ? ' · incomplete text' : ' · text unavailable'}`;
}
export function billTextPath(billKey, textUrl) {
  if (!KEY.test(billKey) || typeof textUrl !== 'string') return null;
  const prefix = `/bill-texts/${billKey}/`;
  if (!textUrl.startsWith(prefix)) return null;
  return /^[a-z0-9][a-z0-9-]*\.json$/.test(textUrl.slice(prefix.length)) ? textUrl : null;
}
/** If sections do not account for every character, show the uncut source text. */
export function billTextSections(document) {
  const text = typeof document.text === 'string' ? document.text : '';
  const sections = Array.isArray(document.sections) ? document.sections : [];
  if (sections.length && sections.every(section => typeof section.text === 'string') && sections.map(section => section.text).join('\n\n') === text) return sections;
  return text ? [{ id: 'document', title: 'Bill text', text }] : [];
}
export function billTextDefault(manifest, requested) {
  const versions = Array.isArray(manifest.versions) ? manifest.versions : [];
  if (requested) return versions.find(version => version.id === requested) || null;
  return versions.find(version => version.id === manifest.default_version_id)
    || versions.find(version => version.status === 'complete') || versions[0] || null;
}

export function mountBillText(container, { bill, requestedVersion = null, open = false, onVersion = () => {} }) {
  const aborter = new AbortController();
  let destroyed = false, generation = 0, manifest, selected, loadedId, loadedComplete = false, textAborter, downloadUrl;
  const root = element('section', null, 'bill-text-reader'); root.id = 'bill-full-text'; root.setAttribute('aria-labelledby', 'bill-text-title');
  const title = element('h3', 'Bill text', 'subject-section-title'); title.id = 'bill-text-title'; title.tabIndex = -1;
  const controls = element('div', null, 'bill-text-controls');
  const notice = element('p', null, 'fineprint bill-text-notice'); notice.setAttribute('role', 'status');
  const content = element('div', null, 'bill-text-content'); content.id = 'bill-text-content';
  root.append(title, controls, notice, content); container.replaceChildren(root);
  const alive = () => !destroyed && root.isConnected;
  const skeleton = (slot, label) => {
    slot.replaceChildren(); slot.setAttribute('aria-busy', 'true');
    const status = element('span', label, 'visually-hidden'); status.setAttribute('role', 'status');
    const shimmer = element('div', null, 'answer-skeleton bill-text-skeleton'); shimmer.setAttribute('aria-hidden', 'true');
    for (const width of [90, 100, 84, 96, 66]) { const bar = element('i'); bar.style.width = width + '%'; shimmer.append(bar); }
    slot.append(status, shimmer);
  };
  function originalSources() {
    const links = element('div', null, 'bill-text-originals');
    for (const source of (bill.sources || []).filter(source => ['text', 'exposure_draft', 'billhome'].includes(source.kind))) {
      const a = sourceLink(source.url, source.kind === 'billhome' ? 'Official bill home' : source.kind === 'exposure_draft' ? 'Original exposure draft' : 'Original bill document');
      if (a) links.append(a);
    }
    return links;
  }
  function clearVersion() {
    generation++; textAborter?.abort(); loadedId = null;
    if (downloadUrl) { URL.revokeObjectURL(downloadUrl); downloadUrl = null; }
    content.replaceChildren(); content.removeAttribute('aria-busy');
  }
  function versionControls(autoOpen = false) {
    clearVersion(); controls.replaceChildren();
    const label = element('label', 'Version'); label.htmlFor = 'bill-text-version';
    const select = element('select'); select.id = 'bill-text-version';
    if (!selected) { const placeholder = element('option', 'Choose a published version'); placeholder.value = ''; placeholder.disabled = true; placeholder.selected = true; select.append(placeholder); }
    for (const version of manifest.versions) { const option = element('option', billTextVersionLabel(version)); option.value = version.id; option.selected = selected?.id === version.id; select.append(option); }
    select.addEventListener('change', () => {
      selected = manifest.versions.find(version => version.id === select.value);
      onVersion(selected.id); versionControls(true);
      controls.querySelector('select')?.focus({ preventScroll: true });
    });
    const field = element('div', null, 'bill-text-version-field'); field.append(label, select); controls.append(field);
    if (!selected) {
      notice.textContent = 'The requested text version is not published in this file. Choose one of the listed versions or open the official source.';
      controls.append(originalSources()); return;
    }
    const source = sourceLink(selected.source_url, `Original ${selected.format === 'pdf' ? 'PDF' : 'document'}`);
    if (source) controls.append(source);
    notice.textContent = [Number(selected.pages) > 0 ? `${selected.pages} source pages.` : '', selected.coverage_note, !selected.date ? 'The source does not supply a version date.' : '', manifest.coverage_note].filter(Boolean).join(' ');
    const path = billTextPath(bill.key, selected.text_url);
    if (!path || !['complete', 'incomplete'].includes(selected.status)) {
      notice.textContent = [selected.coverage_note || 'This version is not yet available to read on Opax.', 'Use the original document for the complete source.'].join(' '); return;
    }
    const read = element('button', selected.status === 'complete' ? 'Read full bill text' : 'Read available text', 'primary bill-text-read'); read.type = 'button'; read.setAttribute('aria-controls', content.id); read.setAttribute('aria-expanded', 'false');
    controls.append(read);
    read.addEventListener('click', () => {
      if (loadedId === selected.id) {
        content.hidden = !content.hidden;
        read.setAttribute('aria-expanded', String(!content.hidden)); read.textContent = content.hidden ? (loadedComplete ? 'Read full bill text' : 'Read available text') : 'Hide bill text';
      } else { onVersion(selected.id); loadText(selected, path, read, true); }
    });
    if (autoOpen) loadText(selected, path, read, false);
  }
  async function loadText(version, path, button, focus) {
    const mine = ++generation;
    textAborter?.abort(); textAborter = new AbortController();
    content.hidden = false; skeleton(content, 'Loading the published bill text'); button.disabled = true; button.textContent = 'Loading bill text…'; button.setAttribute('aria-expanded', 'true');
    try {
      const response = await fetch(path, { signal: textAborter.signal });
      if (!response.ok) throw new Error('unavailable');
      const document = await response.json();
      if (!alive() || generation !== mine) return;
      if (document.bill_key !== bill.key || document.version?.id !== version.id || typeof document.text !== 'string' || !document.text.trim()) throw new Error('unavailable');
      const sections = billTextSections(document);
      content.replaceChildren(); content.removeAttribute('aria-busy');
      const complete = document.complete === true && version.status === 'complete'; loadedComplete = complete;
      const provenance = element('p', complete ? 'Published bill text, transcribed from the original document. Check the original for authoritative formatting.' : 'This is an incomplete extraction. Missing or unreadable material may include provisions or schedules. Use the original document for the full bill.', complete ? 'fineprint bill-text-provenance' : 'bill-text-warning');
      if (!complete) provenance.setAttribute('role', 'status'); content.append(provenance);
      const tools = element('div', null, 'bill-text-tools');
      if (sections.length > 1) {
        const label = element('label', 'Jump to section or page'); label.htmlFor = 'bill-text-section';
        const jump = element('select'); jump.id = 'bill-text-section';
        sections.forEach((section, index) => { const option = element('option', section.title || `Section ${index + 1}`); option.value = String(index); jump.append(option); });
        jump.addEventListener('change', () => {
          const heading = content.querySelector(`#bill-text-part-${jump.value}`);
          heading?.focus({ preventScroll: true }); heading?.scrollIntoView({ block: 'start' });
        });
        const field = element('div', null, 'bill-text-section-field'); field.append(label, jump); tools.append(field);
      }
      downloadUrl = URL.createObjectURL(new Blob([document.text], { type: 'text/plain;charset=utf-8' }));
      const download = element('a', 'Download displayed text'); download.href = downloadUrl; download.download = `${bill.key}-${version.id}.txt`; tools.append(download); content.append(tools);
      const documentBody = element('div', null, 'bill-text-document');
      sections.forEach((section, index) => {
        const part = element('section', null, 'bill-text-part');
        const heading = element('h4', section.title || `Section ${index + 1}`); heading.id = `bill-text-part-${index}`; heading.tabIndex = -1;
        const text = element('div', section.text, 'bill-text-source'); part.append(heading, text); documentBody.append(part);
      });
      content.append(documentBody); loadedId = version.id;
      button.disabled = false; button.textContent = 'Hide bill text';
      if (focus) { const heading = content.querySelector('h4'); heading?.focus({ preventScroll: true }); heading?.scrollIntoView({ block: 'start' }); }
      if (location.hash === '#bill-full-text') root.scrollIntoView({ block: 'start' });
    } catch (error) {
      if (!alive() || generation !== mine || error.name === 'AbortError') return;
      content.replaceChildren(element('p', 'This text version could not load. Try again or open the original document.', 'bill-text-warning')); content.removeAttribute('aria-busy');
      button.disabled = false; button.textContent = 'Try loading this version again';
    }
  }
  async function loadManifest() {
    skeleton(controls, 'Checking published bill versions');
    try {
      if (!KEY.test(bill.key)) throw new Error('not-found');
      const response = await fetch(`/bill-texts/${bill.key}/index.json`, { signal: aborter.signal, cache: 'no-cache' });
      if (!response.ok) throw new Error(response.status === 404 ? 'not-found' : 'unavailable');
      manifest = await response.json();
      if (!alive()) return;
      if (manifest.bill_key !== bill.key || !Array.isArray(manifest.versions) || !manifest.versions.length) throw new Error('not-found');
      selected = billTextDefault(manifest, requestedVersion);
      controls.removeAttribute('aria-busy'); versionControls(open || Boolean(requestedVersion));
      if (location.hash === '#bill-full-text') root.scrollIntoView({ block: 'start' });
    } catch (error) {
      if (!alive() || error.name === 'AbortError') return;
      controls.replaceChildren(originalSources()); controls.removeAttribute('aria-busy');
      notice.textContent = error.message === 'not-found' ? 'Full text has not been published on Opax for this bill. The original source may have the document.' : 'Published text versions could not be checked. You can still open the original source.';
      if (error.message !== 'not-found') { const retry = element('button', 'Check again', 'secondary'); retry.type = 'button'; retry.addEventListener('click', loadManifest); controls.append(retry); }
      if (location.hash === '#bill-full-text') root.scrollIntoView({ block: 'start' });
    }
  }
  const ready = loadManifest();
  return { ready,
    selectVersion(id, { open: shouldOpen = false } = {}) {
      requestedVersion = id; open = shouldOpen;
      if (!manifest) return;
      if (selected?.id === id) {
        if (shouldOpen && (content.hidden || !loadedId)) controls.querySelector('.bill-text-read')?.click();
        return;
      }
      selected = billTextDefault(manifest, id); versionControls(shouldOpen || Boolean(id));
    },
    destroy() { destroyed = true; generation++; aborter.abort(); textAborter?.abort(); if (downloadUrl) URL.revokeObjectURL(downloadUrl); root.remove(); },
  };
}
