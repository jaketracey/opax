const TOTAL_SECONDS = 600;
const assetPaths = typeof __OPAX_VOICE_ASSETS__ === 'undefined' ? {
  rawAudioProcessor: '/voice-assets/rawAudioProcessor.js',
  audioConcatProcessor: '/voice-assets/audioConcatProcessor.js',
  libsamplerate: '/voice-assets/libsamplerate.worklet.js',
} : __OPAX_VOICE_ASSETS__;

const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};
const button = (className, text) => {
  const node = element('button', className, text);
  node.type = 'button';
  return node;
};
const icon = (name) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', name === 'close' ? 'm6 6 12 12M18 6 6 18' : name === 'stop' ? 'M7 7h10v10H7z' : 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5ZM5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8');
  svg.append(path);
  return svg;
};
export const formatSeconds = value => {
  const seconds = Math.max(0, Math.ceil(Number(value) || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

// Only published Opax record destinations may become interactive links.
export function sourceUrl(value, origin = location.origin) {
  if (typeof value !== 'string' || value.length > 1800) return null;
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || url.username || url.password || !['http:', 'https:'].includes(url.protocol)) return null;
    if (!/^\/(?:doc\/[^/]+|bill\/[^/]+|subject\/(?:person|party|supplier|donor|recipient|topic|campaigner|agency)\/[^/]+|money(?:\/(?:contracts|grants|donations|receipts|expenses|interests))?|declared|search|connections|topics|parties|reports(?:\/[^/]+)?|journey\/[^/]+)\/?$/.test(url.pathname)) return null;
    if (/[%](?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(url.href)) return null;
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}

function safeTranscript(node, text, addSource) {
  const pattern = /\[([^\]\n]{1,220})\]\(([^\s)]+)\)/g;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    node.append(document.createTextNode(text.slice(offset, match.index)));
    const href = sourceUrl(match[2]);
    if (href) {
      const link = element('a', '', match[1]);
      link.href = href;
      node.append(link);
      addSource({ title: match[1], href });
    } else node.append(document.createTextNode(match[0]));
    offset = match.index + match[0].length;
  }
  node.append(document.createTextNode(text.slice(offset)));
}

export function createVoiceAssistant({ mount = document.body, fetcher = window.fetch.bind(window), loadSdk = () => import('./sdk.js'), now = () => Date.now() } = {}) {
  if (document.getElementById('opax-voice')) return null;
  let status = null;
  let loading = false;
  let statusGeneration = 0;
  let attempt = null;
  let isOpen = false;
  let destroyed = false;
  let timer = null;
  let lastRoute = location.pathname + location.search;
  let messageSerial = 0;
  const messages = new Map();
  const sources = new Set();
  const cleanups = [];
  const root = element('aside', 'opax-voice');
  root.id = 'opax-voice';
  root.setAttribute('aria-label', 'Opax voice assistant');
  // Defence in depth if analytics configuration ever enables DOM capture.
  root.classList.add('ph-no-capture', 'ph-sensitive');
  const launcher = button('opax-voice-launcher', '');
  launcher.append(icon('mic'), element('span', '', 'Talk to Opax'));
  launcher.setAttribute('aria-haspopup', 'dialog');
  launcher.setAttribute('aria-expanded', 'false');
  launcher.setAttribute('aria-controls', 'opax-voice-panel');
  const panel = element('section', 'opax-voice-panel');
  panel.id = 'opax-voice-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', 'opax-voice-title');
  const header = element('div', 'opax-voice-header');
  const heading = element('div');
  heading.append(element('p', 'opax-voice-eyebrow', 'THE PUBLIC RECORD, IN CONVERSATION'));
  const title = element('h2', '', 'Talk to Opax');
  title.id = 'opax-voice-title';
  heading.append(title);
  const close = button('opax-voice-close', '');
  close.append(icon('close'));
  close.setAttribute('aria-label', 'Close voice assistant');
  header.append(heading, close);
  const body = element('div', 'opax-voice-body');
  const introduction = element('div', 'opax-voice-intro');
  introduction.append(element('p', 'opax-voice-lede', 'Explore the record with your voice.'));
  introduction.append(element('p', '', 'Ask about Australian politics, spending and the public record. You can interrupt or ask a follow-up.'));
  introduction.append(element('p', 'opax-voice-example', 'Try “What can Opax tell me about government grants?”'));
  const activity = element('div', 'opax-voice-activity');
  const waves = element('span', 'opax-voice-waves');
  waves.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 5; i++) waves.append(element('i'));
  const activityText = element('span', '', 'Ready when you are');
  const connectingSpinner = element('span', 'btn-spinner opax-voice-spinner');
  connectingSpinner.setAttribute('aria-hidden', 'true');
  connectingSpinner.hidden = true;
  activityText.setAttribute('role', 'status');
  activity.append(waves, connectingSpinner, activityText);
  const allowance = element('p', 'opax-voice-allowance');
  const clock = element('strong', '', '10:00');
  clock.setAttribute('aria-live', 'off');
  const allowanceText = element('span', '', ' free · 10 minutes total per account');
  allowance.append(clock, allowanceText);
  const notice = element('p', 'opax-voice-notice');
  notice.setAttribute('role', 'status');
  notice.hidden = true;
  const transcript = element('div', 'opax-voice-transcript');
  transcript.setAttribute('role', 'log');
  transcript.setAttribute('aria-label', 'Conversation transcript');
  transcript.setAttribute('aria-live', 'polite');
  transcript.setAttribute('aria-relevant', 'additions text');
  transcript.tabIndex = 0;
  transcript.hidden = true;
  const sourceSection = element('section', 'opax-voice-sources');
  sourceSection.hidden = true;
  sourceSection.append(element('h3', '', 'From the record'));
  const sourceList = element('ol');
  sourceSection.append(sourceList);
  body.append(introduction, activity, allowance, notice, transcript, sourceSection);
  const controls = element('div', 'opax-voice-controls');
  const start = button('opax-voice-start primary', 'Start talking');
  const signin = element('a', 'opax-voice-signin', 'Sign in to talk for free');
  signin.href = '/community?view=signin';
  signin.hidden = true;
  const mute = button('opax-voice-mute', 'Mute mic');
  mute.setAttribute('aria-pressed', 'false');
  mute.hidden = true;
  const end = button('opax-voice-end', 'End call');
  end.hidden = true;
  controls.append(start, signin, mute, end);
  const footer = element('div', 'opax-voice-footer');
  footer.append(element('p', '', 'AI voice powered by ElevenLabs. Answers may be mistaken; check the linked records.'));
  const privacyLine = element('p', '', 'Your microphone starts when you choose Start talking. ');
  const privacy = element('a', '', 'Voice privacy');
  privacy.href = '/community?view=privacy#voice';
  privacyLine.append(privacy);
  footer.append(privacyLine);
  panel.append(header, body, controls, footer);
  root.append(panel, launcher);
  mount.append(root);
  document.body.classList.add('opax-voice-ready');

  const listen = (target, event, handler, options) => {
    target.addEventListener(event, handler, options);
    cleanups.push(() => target.removeEventListener(event, handler, options));
  };
  const showNotice = text => {
    notice.textContent = text || '';
    notice.hidden = !text;
  };
  const validAttempt = value => attempt === value && !value.controller.signal.aborted && !destroyed;
  const secondsLeft = () => attempt?.deadline ? Math.max(0, Math.ceil((attempt.deadline - now()) / 1000)) : Math.min(TOTAL_SECONDS, Math.max(0, Number(status?.remaining_seconds ?? TOTAL_SECONDS)));
  const render = () => {
    const busy = Boolean(attempt);
    const connected = attempt?.connected;
    start.hidden = busy || status?.signed_in === false;
    start.disabled = loading || status?.enabled !== true || status?.signed_in !== true || secondsLeft() <= 0 || Boolean(status?.active_session);
    start.replaceChildren();
    if (loading) start.append(element('span', 'btn-spinner'));
    start.append(document.createTextNode(loading ? 'Checking availability…' : 'Start talking'));
    signin.hidden = busy || status?.signed_in !== false || status?.enabled !== true;
    mute.hidden = !connected;
    mute.textContent = attempt?.muted ? 'Unmute mic' : 'Mute mic';
    mute.setAttribute('aria-pressed', String(Boolean(attempt?.muted)));
    end.hidden = !busy;
    end.textContent = connected ? 'End call' : 'Cancel';
    clock.textContent = formatSeconds(secondsLeft());
    allowanceText.textContent = status?.signed_in ? ' remaining · 10 minutes free in total' : ' free · 10 minutes total per account';
    root.classList.toggle('is-active', Boolean(connected));
    root.classList.toggle('is-speaking', Boolean(connected && attempt?.mode === 'speaking'));
    root.classList.toggle('is-connecting', busy && !connected);
    connectingSpinner.hidden = !busy || Boolean(connected);
    waves.hidden = busy && !connected;
    if (busy) activityText.textContent = connected ? (attempt.muted ? 'Your microphone is muted' : attempt.mode === 'speaking' ? 'Opax is speaking' : 'Listening to you') : 'Connecting…';
    else activityText.textContent = secondsLeft() <= 0 && status?.signed_in ? 'Your free voice time is complete' : status?.enabled === false ? 'Voice is unavailable right now' : 'Ready when you are';
  };
  async function refreshStatus() {
    const generation = ++statusGeneration;
    loading = true;
    render();
    try {
      const response = await fetcher('/api/voice/status', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('status');
      const next = await response.json();
      if (generation !== statusGeneration || destroyed) return;
      status = next;
      if (!attempt) showNotice(!next.enabled ? 'Voice is taking a break. You can still use Ask to explore the record.' : next.active_session ? 'A voice conversation is already open on your account. End it there, then reopen this panel.' : next.signed_in && Number(next.remaining_seconds) <= 0 ? 'You have used your 10 free minutes. You can keep exploring with Ask and the public records.' : '');
    } catch {
      if (generation === statusGeneration && !destroyed) {
        status = null;
        showNotice('We could not check voice availability. Close and reopen this panel to try again.');
      }
    } finally {
      if (generation === statusGeneration) { loading = false; render(); }
    }
  }
  async function finishReservation(value) {
    if (!value.sessionId || value.finished) return;
    value.finished = true;
    try {
      const response = await fetcher('/api/voice/finish', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: value.sessionId }), keepalive: true });
      if (response.ok && !attempt && !destroyed) {
        const next = await response.json();
        if (Number.isFinite(next.remaining_seconds) && status) status.remaining_seconds = next.remaining_seconds;
        if (status) status.active_session = next.active_session || null;
        render();
        if (next.active_session && isOpen) setTimeout(() => { if (!attempt && !destroyed) void refreshStatus(); }, 1200);
      }
    } catch { /* The server also reconciles socket closure and expires reservations. */ }
  }
  async function stop(reason = 'Conversation ended. Your microphone is off.') {
    const value = attempt;
    if (!value) return;
    const remaining = secondsLeft();
    attempt = null;
    value.controller.abort();
    clearInterval(timer);
    timer = null;
    if (status) { status.remaining_seconds = remaining; status.active_session = null; }
    // Stop tracked capture immediately, before any SDK shutdown awaits.
    try { value.conversation?.setMicMuted(true); } catch { /* already disconnected */ }
    try { value.conversation?.setVolume({ volume: 0 }); } catch { /* already disconnected */ }
    if (value.audioContext && value.audioContext.state !== 'closed') void value.audioContext.close().catch(() => {});
    showNotice(reason);
    render();
    try { await value.conversation?.endSession(); } catch { /* socket may already be closed */ }
    await finishReservation(value);
  }
  const addSource = source => {
    if (!source || typeof source !== 'object') return;
    const href = sourceUrl(source.href || source.destination || source.url);
    if (!href || sources.has(href) || sources.size >= 12) return;
    sources.add(href);
    const li = element('li');
    const link = element('a', '', String(source.title || source.label || 'Open the source record').slice(0, 220));
    link.href = href;
    li.append(link);
    sourceList.append(li);
    sourceSection.hidden = false;
  };
  function collectSources(value, depth = 0) {
    if (depth > 5 || !value) return;
    if (typeof value === 'string') {
      if (value.length > 160000) return;
      try { collectSources(JSON.parse(value), depth + 1); } catch { /* Plain tool prose is not a source payload. */ }
    } else if (Array.isArray(value)) value.slice(0, 30).forEach(item => collectSources(item, depth + 1));
    else if (typeof value === 'object') {
      addSource(value);
      for (const field of ['sources', 'records', 'result', 'response', 'body', 'content', 'text', 'full_tool_result']) collectSources(value[field], depth + 1);
    }
  }
  function addMessage(payload, correction = false) {
    if (typeof payload?.message !== 'string' || !payload.message.trim()) return;
    const role = payload.role === 'user' || payload.source === 'user' ? 'user' : 'agent';
    const key = `${role}:${payload.event_id ?? ++messageSerial}`;
    let row = messages.get(key);
    if (!row) {
      row = element('div', `opax-voice-turn opax-voice-turn-${role}`);
      row.append(element('strong', '', role === 'user' ? 'You' : 'Opax'), element('p'));
      messages.set(key, row);
      transcript.append(row);
      if (messages.size > 80) {
        const first = messages.keys().next().value;
        messages.get(first).remove();
        messages.delete(first);
      }
    }
    const text = row.querySelector('p');
    text.replaceChildren();
    safeTranscript(text, payload.message.slice(0, 12000), addSource);
    transcript.hidden = false;
    introduction.hidden = true;
    if (!correction) transcript.scrollTop = transcript.scrollHeight;
  }
  async function begin() {
    if (attempt || start.disabled || destroyed) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      showNotice('Voice needs a browser with microphone support and a secure connection. You can use Ask here instead.');
      return;
    }
    const value = { controller: new AbortController(), conversation: null, connected: false, muted: false, mode: 'listening', sessionId: null, deadline: null, finished: false };
    attempt = value;
    // Prime playback on the explicit start gesture, before the lazy import yields.
    // This is necessary for iOS; opening the panel never creates an audio context.
    try {
      value.audioContext = new AudioContext({ sampleRate: 16000 });
      const silent = value.audioContext.createBufferSource();
      silent.buffer = value.audioContext.createBuffer(1, 1, 16000);
      silent.connect(value.audioContext.destination);
      silent.start();
      void value.audioContext.resume().catch(() => {});
    } catch { /* The SDK can create its own context on browsers without priming. */ }
    ++statusGeneration;
    loading = false;
    messages.clear(); sources.clear();
    transcript.replaceChildren(); sourceList.replaceChildren();
    transcript.hidden = true; sourceSection.hidden = true; introduction.hidden = false;
    showNotice('');
    render();
    end.focus({ preventScroll: true });
    const timeout = setTimeout(() => { if (validAttempt(value)) void stop('We could not connect in time. Your microphone is off. Please try again.'); }, 35000);
    try {
      const sdk = await loadSdk();
      if (!validAttempt(value)) return;
      // Keep the POST response observable after cancellation so a late reservation is released.
      const response = await fetcher('/api/voice/start', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await response.json();
      if (response.ok) value.sessionId = data.session_id;
      if (!validAttempt(value)) { await finishReservation(value); return; }
      if (!response.ok) {
        if (response.status === 401) { status.signed_in = false; throw new Error('signin'); }
        if (response.status === 403) { status.remaining_seconds = 0; throw new Error('allowance'); }
        if (response.status === 429) throw new Error('capacity');
        if (response.status === 409) throw new Error('active');
        throw new Error('start');
      }
      const signed = new URL(data.signed_url);
      const expected = new URL(location.origin);
      if (!value.sessionId || data.transport !== 'websocket' || signed.host !== expected.host || signed.pathname !== '/api/voice/connect' || signed.protocol !== (expected.protocol === 'https:' ? 'wss:' : 'ws:')) throw new Error('start');
      const remaining = Math.max(0, Math.min(TOTAL_SECONDS, Number(data.remaining_seconds) || 0));
      // expires_at is the short reservation window, not the eventual call end.
      // The server independently enforces the account's remaining call seconds.
      value.deadline = now() + remaining * 1000;
      timer = setInterval(() => {
        if (!validAttempt(value)) return;
        render();
        if (secondsLeft() <= 0) void stop('Your 10 free minutes are complete. Your microphone is off. Keep exploring with Ask.');
      }, 250);
      const conversation = await sdk.Conversation.startSession({
        signedUrl: data.signed_url, connectionType: 'websocket',
        opaxSignal: value.controller.signal, opaxAudioContext: value.audioContext, useWakeLock: false,
        workletPaths: { rawAudioProcessor: assetPaths.rawAudioProcessor, audioConcatProcessor: assetPaths.audioConcatProcessor },
        libsampleratePath: assetPaths.libsamplerate,
        onConversationCreated: created => { value.conversation = created; if (!validAttempt(value)) void created.endSession().catch(() => {}); },
        onConnect: () => { if (validAttempt(value)) { value.connected = true; clearTimeout(timeout); render(); mute.focus({ preventScroll: true }); } },
        onModeChange: ({ mode }) => { if (validAttempt(value)) { value.mode = mode; render(); } },
        onMessage: payload => { if (validAttempt(value)) addMessage(payload); },
        onAgentResponseCorrection: payload => { if (validAttempt(value)) addMessage({ role: 'agent', message: payload.corrected_agent_response, event_id: payload.event_id }, true); },
        onAgentToolResponse: payload => { if (validAttempt(value)) collectSources(payload); },
        onDisconnect: details => { if (validAttempt(value)) void stop(details?.reason === 'error' ? 'The connection ended. Your microphone is off. You can try again.' : 'Conversation ended. Your microphone is off.'); },
        onError: () => { if (validAttempt(value)) void stop('Voice ran into a problem. Your microphone is off. Please try again.'); },
      });
      value.conversation = conversation;
      if (!validAttempt(value)) { await conversation.endSession().catch(() => {}); await finishReservation(value); return; }
      value.connected = true;
      render();
    } catch (error) {
      if (validAttempt(value)) {
        const message = error?.name === 'NotAllowedError' ? 'Microphone access was not allowed. Enable it in your browser settings, then try again.' : error?.name === 'NotFoundError' ? 'We could not find a microphone. Connect one and try again.' : error?.message === 'signin' ? 'Sign in to use your free voice time.' : error?.message === 'allowance' ? 'Your 10 free minutes are complete. Keep exploring with Ask.' : error?.message === 'active' ? 'A voice conversation is already open on your account. End it there, then try again.' : error?.message === 'capacity' ? 'Voice is busy right now. Please try again in a little while.' : 'We could not start the conversation. Your microphone is off. Please try again.';
        await stop(message);
      }
    } finally { clearTimeout(timeout); }
  }
  function closePanel({ restoreFocus = true } = {}) {
    isOpen = false;
    panel.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    void stop();
    if (restoreFocus && !destroyed) launcher.focus({ preventScroll: true });
  }
  function openPanel() {
    if (destroyed) return;
    isOpen = true;
    panel.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    close.focus({ preventScroll: true });
    void refreshStatus();
  }
  listen(launcher, 'click', () => isOpen ? closePanel() : openPanel());
  listen(close, 'click', () => closePanel());
  listen(start, 'click', () => { void begin(); });
  listen(end, 'click', () => { void stop(); });
  listen(mute, 'click', () => {
    if (!attempt?.conversation) return;
    attempt.muted = !attempt.muted;
    attempt.conversation.setMicMuted(attempt.muted);
    render();
  });
  listen(document, 'keydown', event => { if (event.key === 'Escape' && isOpen) { event.preventDefault(); closePanel(); } });
  const teardown = () => { closePanel({ restoreFocus: false }); };
  listen(window, 'pagehide', teardown);
  listen(window, 'beforeunload', teardown);
  listen(window, 'offline', () => { if (attempt) void stop('You are offline. Your microphone is off. Reconnect to try again.'); });
  listen(document, 'visibilitychange', () => { if (document.visibilityState === 'hidden' && attempt) void stop('Conversation ended when you left this tab. Your microphone is off. Start again when you are ready.'); });
  listen(window, 'opax:route', () => { const next = location.pathname + location.search; if (next !== lastRoute) teardown(); lastRoute = next; });
  listen(window, 'popstate', teardown);
  render();
  return { open: openPanel, close: closePanel, destroy: async () => { destroyed = true; ++statusGeneration; await stop(); cleanups.forEach(cleanup => cleanup()); root.remove(); document.body.classList.remove('opax-voice-ready'); } };
}
