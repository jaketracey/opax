import { cleanEvent, safePath } from './privacy.mjs';

// Delivered by GTM-PNDM87LW. Keep the audited mapping in source control rather
// than copying reader-data handling into an untested Custom JavaScript tag.
const ID = 'G-EGY7Y5VTEQ';
if (['opax.com.au', 'www.opax.com.au'].includes(location.hostname)
    && navigator.doNotTrack !== '1' && window.doNotTrack !== '1' && !window.opaxGaLoaded) {
  window.opaxGaLoaded = true;
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  const initialPath = safePath(location.href);
  gtag('set', {
    send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
    page_location: `https://opax.com.au${initialPath}`, page_referrer: '', page_title: 'Opax',
  });
  gtag('js', new Date());
  gtag('config', ID, { send_page_view: false });
  let previous = '';
  const send = ({ event, properties }) => {
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;
    const clean = cleanEvent(event, properties);
    if (!clean) return;
    const path = safePath(properties.page_path || location.href);
    const context = { page_location: `https://opax.com.au${path}`, page_title: 'Opax', page_referrer: previous };
    if (event === 'opax_view') {
      gtag('set', context);
      gtag('event', 'page_view', { ...clean, ...context, send_to: ID });
      previous = context.page_location;
    } else {
      gtag('event', event, { ...clean, ...context, page_section: properties.page_section, send_to: ID });
    }
  };
  const pending = window.opaxAnalyticsPending || [];
  window.opaxAnalyticsPending = null;
  for (const event of pending) send(event);
  addEventListener('opax:measured', ({ detail }) => { try { send(detail); } catch { /* optional */ } });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${ID}`;
  document.head.appendChild(script);
}
