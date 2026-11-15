/* The newsletter's confirmation page (src/newsletter.ts). The link in the email
   carries its token after the #, which a browser never sends to a server, so
   the token is in no request URL and no log. Nothing is sent until the reader
   presses the button; then the token goes in the body of one same-origin post. */
(() => {
  'use strict';
  const button = document.getElementById('confirm'), title = document.getElementById('title'), text = document.getElementById('text');
  if (!button || !title || !text) return;
  const params = new URLSearchParams(location.hash.slice(1));
  const token = params.get('t') || '', from = params.get('from') || '';
  // Out of the address bar and the history entry.
  try { history.replaceState(null, '', location.pathname); } catch { /* the link still works */ }
  const say = (heading, message) => { title.textContent = heading; text.textContent = message; document.title = heading + ' · OPAX'; title.focus(); };
  if (!/^[\w-]{43}$/.test(token)) {
    button.remove();
    say('This link has expired', 'Confirmation links work for two days. Sign up again on OPAX to get a new one.');
    return;
  }
  button.disabled = false;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const response = await fetch('/api/newsletter/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, from }) });
      const data = await response.json();
      if (typeof data.title !== 'string') throw new Error('retry');
      button.remove();
      say(data.title, data.message);
    } catch {
      button.disabled = false;
      text.textContent = 'That did not work. Check your connection and press the button again.';
    }
  });
})();
