import posthog from 'posthog-js/dist/module.no-external';
import { cleanEvent, beforeSend } from './privacy.mjs';

// Public, write-only ingestion token for PostHog project 507367 (Opax).
const TOKEN = 'phc_AsHnQM2UrGBubA5HU9sagkGbg8vqQLNXu3WjEhPRDejr';
const enabled = ['opax.com.au', 'www.opax.com.au'].includes(location.hostname);
if (enabled) {
  try {
    posthog.init(TOKEN, {
      api_host: '/ingest',
      ui_host: 'https://us.posthog.com',
      defaults: '2026-05-30',
      person_profiles: 'never',
      capture_pageview: false, // The router emits opax_view, including back/forward.
      capture_pageleave: true,
      autocapture: false,
      capture_exceptions: false,
      disable_session_recording: true,
      disable_surveys: true,
      disable_external_dependency_loading: true,
      advanced_disable_flags: true,
      ip: false,
      respect_dnt: true,
      before_send: beforeSend,
    });
    addEventListener('opax:measured', ({ detail }) => {
      try {
        const clean = cleanEvent(detail?.event, detail?.properties);
        const properties = clean && { ...clean, page_path: detail.properties.page_path, page_section: detail.properties.page_section };
        if (!properties) return;
        if (detail.event === 'opax_view') {
          posthog.capture('$pageview', {
            ...properties,
            $pathname: properties.page_path,
            $current_url: `https://opax.com.au${properties.page_path}`,
            app: 'opax', environment: 'production',
          });
        } else {
          posthog.capture(detail.event, { ...properties, app: 'opax', environment: 'production' });
        }
      } catch { /* Analytics must never interrupt the application. */ }
    });
  } catch { /* Offline, blocked storage or SDK failures must not break Opax. */ }
}
