/* The newsletter sign-up card (docs/NEWSLETTER.md). Present only while the
   Worker's NEWSLETTER_ENABLED flag is on: it reads the <template> the Worker
   adds and does nothing without it.

   When the card may appear:
   - never on a visitor's first page view; from the second, after ten seconds
     on the page, or when an Ask answer has finished;
   - never while an answer is being written, and on /ask only after one ends;
   - only where it moves nothing the reader can see: it goes in above the page
     footer while the footer is still below the screen. It covers no content;
   - one prompt a page view. The app prompt comes first: if it has claimed the
     view (data-opax-prompt on <html>), the card waits for a later one;
   - once per visitor. After the card has been on screen, or was dismissed or
     used, this device remembers and it is not offered again. A browser that
     cannot remember is never shown it. */
(() => {
  'use strict';
  const template = document.getElementById('opax-newsletter-template');
  if (!template) return;
  const DONE = 'opax-newsletter', VIEWS = 'opax-newsletter-views', DELAY_MS = 10000;
  const root = document.documentElement;
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, value); return read(key) === value; } catch { return false; } };
  // No storage means no way to keep "once per visitor", so no card.
  if (read(DONE) || !write(VIEWS, read(VIEWS) || '0') || /OPAX-iOS\//.test(navigator.userAgent)) return;

  const pagePath = () => location.pathname.replace(/\/+$/, '') || '/';
  const onAsk = () => /^\/(?:ask|chat)(?:\/|$)/.test(pagePath());
  const excluded = () => /^\/(?:support|privacy|terms|security|community|signin|sign-in|login|auth|map|press)(?:\/|$)/i.test(pagePath());
  function pageType() {
    const parts = pagePath().split('/').filter(Boolean);
    if (!parts.length || parts[0] === 'home') return 'home';
    if (parts[0] === 'subject') return ['person', 'electorate', 'party', 'topic'].includes(parts[1]) ? parts[1] : 'other';
    if (parts[0] === 'bill' || parts[0] === 'bills') return 'bill';
    return ['ask', 'search', 'money', 'doc'].includes(parts[0]) ? parts[0] : 'other';
  }
  // Counts only: which step, on what kind of page. Never the address.
  const track = action => { try { dispatchEvent(new CustomEvent('opax:analytics', { detail: { event: 'opax_newsletter', properties: { action, page_type: pageType() } } })); } catch { /* optional */ } };

  let card = null, seen = false, asking = false, timer = 0, viewed = '';

  function remove() {
    if (!card) return;
    card.remove(); card = null;
    if (root.dataset.opaxPrompt === 'newsletter') delete root.dataset.opaxPrompt;
  }

  function place() {
    if (card || asking || read(DONE) || excluded() || Number(read(VIEWS)) < 2) return;
    if (root.dataset.opaxPrompt) return; // another prompt has this page view
    const footer = document.querySelector('body > footer');
    // Only while the footer is below the screen, so nothing in view moves.
    if (!footer || !footer.getClientRects().length || footer.getBoundingClientRect().top <= innerHeight) return;
    card = template.content.firstElementChild.cloneNode(true);
    footer.before(card);
    root.dataset.opaxPrompt = 'newsletter';
    wire(card, footer);
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer.disconnect();
        shown();
      }, { threshold: 0.5 });
      observer.observe(card);
    } else shown();
  }
  function shown() {
    if (seen) return;
    seen = true;
    write(DONE, 'seen');
    track('shown');
  }

  let check = null;
  /** Turnstile loads on first focus in the form, never before: no third-party request for a reader who ignores the card. */
  function loadCheck(slot) {
    if (check) return check;
    check = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onerror = () => { check = null; reject(new Error('check')); };
      script.onload = () => {
        const state = { token: '', waiting: [], id: null };
        const settle = () => { for (const done of state.waiting.splice(0)) done(state.token); };
        state.id = window.turnstile.render(slot, {
          sitekey: template.dataset.siteKey, appearance: 'interaction-only', action: 'newsletter',
          callback: token => { state.token = token; settle(); },
          'expired-callback': () => { state.token = ''; },
          'error-callback': () => { state.token = ''; settle(); },
        });
        resolve({
          token: () => state.token ? Promise.resolve(state.token) : new Promise(done => { state.waiting.push(done); setTimeout(() => done(state.token), 15000); }),
          reset: () => { state.token = ''; try { window.turnstile.reset(state.id); } catch { /* next submit reloads */ } },
        });
      };
      document.head.append(script);
    });
    return check;
  }

  function wire(el, footer) {
    const form = el.querySelector('form'), status = el.querySelector('[role="status"]');
    const slot = el.querySelector('[data-newsletter-check]'), submit = el.querySelector('[type="submit"]');
    const say = (text, error = false) => { status.textContent = text; status.classList.toggle('opax-newsletter-error', error); };
    el.querySelector('[data-newsletter-dismiss]').addEventListener('click', () => {
      write(DONE, 'dismissed');
      track('dismissed');
      remove();
      // Focus goes to where the card was, not back to the top of the page.
      if (!footer.hasAttribute('tabindex')) footer.setAttribute('tabindex', '-1');
      footer.focus({ preventScroll: true });
    });
    form.addEventListener('focusin', () => { loadCheck(slot).catch(() => {}); });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const email = form.elements.email.value.trim(), electorate = form.elements.electorate.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { say('Enter a valid email address.', true); form.elements.email.focus(); return; }
      submit.disabled = true;
      say('Checking, one moment.');
      let widget = null;
      try {
        widget = await loadCheck(slot);
        const turnstile = await widget.token();
        if (!turnstile) throw new Error('The check did not pass. Reload the page and try again.');
        const response = await fetch('/api/newsletter/subscribe', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, electorate, page_type: pageType(), turnstile }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'That did not work. Please try again shortly.');
        write(DONE, 'subscribed');
        track('submitted');
        form.remove();
        say(typeof data.message === 'string' ? data.message : 'Check your email and confirm to finish.');
        status.setAttribute('tabindex', '-1');
        status.focus({ preventScroll: true });
      } catch (error) {
        if (widget) widget.reset();
        submit.disabled = false;
        say(error && error.message && error.message !== 'check' ? error.message : 'The check could not load. Please try again shortly.', true);
      }
    });
  }

  /** A page view: the first load and each route the app renders after it. */
  function view() {
    const here = location.pathname + location.search;
    if (here === viewed) return;
    viewed = here;
    clearTimeout(timer);
    // The card does not follow the reader to the next page, unless they are typing in it.
    if (card && !card.contains(document.activeElement)) remove();
    if (read(DONE) && !card) return;
    write(VIEWS, String(Math.min(99, Number(read(VIEWS) || 0) + 1)));
    if (!onAsk()) timer = setTimeout(() => { if (document.visibilityState === 'visible') place(); }, DELAY_MS);
  }
  addEventListener('opax:analytics', ({ detail }) => {
    if (detail?.event === 'opax_ask_started') { asking = true; clearTimeout(timer); if (card && !seen) remove(); }
    else if (detail?.event === 'opax_ask_failed') asking = false;
    // The end of an answer: wait a beat so the answer's last lines have been laid out.
    else if (detail?.event === 'opax_ask_completed') { asking = false; clearTimeout(timer); timer = setTimeout(place, 1500); }
  });
  addEventListener('opax:route', view);
  addEventListener('popstate', view);
  view();
})();
