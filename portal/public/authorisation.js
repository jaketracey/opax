/* The electoral authorisation and the corrections contact: one block of fine
   print on the page ground under one hairline rule (style.css .authorisation).
   Every page that carries it draws it here: the hub shell (src/hubs.ts, the
   Victorian election hub and any federal hub given the Worker's lines) and the
   Victorian electorate pages, server and client (vic-election.js).
   A <div>, never a <footer>: nav.css draws every footer element as the navy
   site footer, which made this read as a second one (19 Oct). */
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** line: the exact authorisation text. Corrections: a bare email becomes a
 *  mailto link; href is a link the caller has already checked; correction
 *  alone keeps the words without a link. Nothing to say draws nothing. */
export function authorisationHTML({ line = '', email = '', href = '', correction = false, response = '' } = {}) {
  const report = email ? `<a href="mailto:${esc(email)}">Report a correction: ${esc(email)}</a>`
    : href ? `<a href="${esc(href)}">Report a correction</a>`
    : correction ? 'Report a correction' : '';
  const lines = (line ? `<p class="authorisation-line">${esc(line)}</p>` : '')
    + (report ? `<p class="authorisation-corrections">${report}${response ? `<span>${esc(response)}</span>` : ''}</p>` : '');
  return lines ? `<div class="authorisation">${lines}</div>` : '';
}
