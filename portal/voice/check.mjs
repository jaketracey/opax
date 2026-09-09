import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
// All network and microphone input is synthetic. No account/provider is called.
const { chromium, webkit } = await import(process.env.OPAX_PLAYWRIGHT_MODULE || 'playwright');
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const sdkMock = `export const Conversation={async startSession(options){
  window.voiceOptions=options;window.voiceSdkStarts++;
  if(window.voiceDenied)throw new DOMException('Denied','NotAllowedError');
  await new Promise(resolve=>setTimeout(resolve,window.voiceConnectDelay||0));
  const conversation={setMicMuted(value){window.voiceMuted=value},setVolume(){},async endSession(){window.voiceSdkEnds++;options.onDisconnect?.({reason:'user'})}};
  options.onConversationCreated?.(conversation);options.onConnect?.({conversationId:'synthetic'});return conversation;
}};`;
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') {
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(self)');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; worker-src 'self'; connect-src 'self'; object-src 'none'");
      res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/voice.css"></head><body><main style="padding:24px"><h1>The public record, in daylight.</h1><a href="/money">Explore the record</a></main><script type="module" src="/voice.js"></script></body></html>');
      return;
    }
    const allowed = pathname.startsWith('/chunks/') || pathname.startsWith('/voice-assets/') || ['/style.css', '/voice.css', '/voice.js'].includes(pathname);
    if (!allowed || pathname.includes('..')) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', extname(pathname) === '.css' ? 'text/css' : 'application/javascript');
    res.end(await readFile(join(publicDir, pathname)));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
let assertions = 0;
try {
  for (const [browserName, browserType] of [['chromium', chromium], ['webkit', webkit]]) {
    const executablePath = process.env['OPAX_' + browserName.toUpperCase() + '_PATH'];
    const browser = await browserType.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    async function fixture(width, overrides = {}, realSdk = false) {
      const page = await browser.newPage({ viewport: { width, height: width < 480 ? 667 : 820 }, reducedMotion: 'reduce' });
      const errors = [], requests = [], sdkRequests = [];
      let status = { enabled: true, signed_in: true, remaining_seconds: 600, total_seconds: 600, active_session: null, ...overrides };
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', req => { if (req.url().includes('/chunks/voice-sdk-')) sdkRequests.push(req.url()); });
      await page.addInitScript(() => {
        window.voiceSdkStarts = 0; window.voiceSdkEnds = 0; window.voiceMuted = false;
        if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { value: {} });
        if (!navigator.mediaDevices.getUserMedia) navigator.mediaDevices.getUserMedia = async () => { throw Error('Unexpected microphone capture'); };
      });
      if (!realSdk) await page.route('**/chunks/voice-sdk-*.js', route => route.fulfill({ contentType: 'application/javascript', body: sdkMock }));
      if (realSdk) await page.addInitScript(() => {
        window.realMicTracks = []; window.realSocketCount = 0; window.realMicRequests = 0; window.cspViolations = [];
        document.addEventListener('securitypolicyviolation', event => window.cspViolations.push(event.violatedDirective + ':' + event.blockedURI));
        const OriginalAudioContext = window.AudioContext;
        navigator.mediaDevices.getUserMedia = async () => {
          window.realMicRequests++;
          await new Promise(resolve => setTimeout(resolve, window.realMicDelay || 0));
          const context = new OriginalAudioContext({ sampleRate: 16000 });
          const stream = context.createMediaStreamDestination().stream;
          window.realMicTracks.push(...stream.getTracks());
          return stream;
        };
        // Force the resampling fallback, including on Chromium, so the pinned
        // self-hosted Wasm worklet is exercised under the production CSP shape.
        navigator.mediaDevices.getSupportedConstraints = () => ({});
        navigator.permissions.query = async () => ({ state: 'granted', addEventListener() {}, removeEventListener() {} });
        const originalAddModule = AudioWorklet.prototype.addModule;
        AudioWorklet.prototype.addModule = function(url, ...args) {
          if (window.realOutputFailure && String(url).includes('audioConcatProcessor')) return Promise.reject(new Error('Synthetic output setup failure'));
          return originalAddModule.call(this, url, ...args);
        };
        window.WebSocket = class extends EventTarget {
          static OPEN = 1; static CLOSED = 3; static CONNECTING = 0;
          constructor(url) { super(); this.url = url; this.readyState = 0; window.realSocketCount++; setTimeout(() => { if (this.readyState !== 0) return; this.readyState = 1; this.dispatchEvent(new Event('open')); }, 0); }
          send(text) {
            if (JSON.parse(text).type !== 'conversation_initiation_client_data') return;
            setTimeout(() => { if (this.readyState !== 1) return; this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'conversation_initiation_metadata', conversation_initiation_metadata_event: { conversation_id: 'synthetic-real-sdk', agent_output_audio_format: 'pcm_16000', user_input_audio_format: 'pcm_16000' } }) })); }, window.realSocketDelay || 0);
          }
          close(code = 1000, reason = '') { if (this.readyState === 3) return; this.readyState = 3; queueMicrotask(() => this.dispatchEvent(new CloseEvent('close', { code, reason }))); }
        };
      });
      await page.route('**/api/voice/**', async route => {
        const req = route.request(), path = new URL(req.url()).pathname;
        requests.push(path);
        if (path.endsWith('/status')) return route.fulfill({ json: status });
        if (path.endsWith('/start')) {
          assert.equal(req.postData(), '{}');
          await new Promise(resolve => setTimeout(resolve, awaitDelay));
          return route.fulfill({ status: 201, json: { session_id: 'synthetic-session', transport: 'websocket', signed_url: base.replace('http:', 'ws:') + '/api/voice/connect?session_id=synthetic-session', remaining_seconds: status.remaining_seconds, expires_at: Date.now() / 1000 + 90 } });
        }
        if (path.endsWith('/finish')) {
          assert.deepEqual(req.postDataJSON(), { session_id: 'synthetic-session' });
          return route.fulfill({ json: status });
        }
        throw Error('Unexpected voice request: ' + path);
      });
      let awaitDelay = 0;
      await page.goto(base);
      await page.getByRole('button', { name: 'Talk to Opax', exact: true }).waitFor();
      return { page, errors, requests, sdkRequests, setStatus: value => { status = { ...status, ...value }; }, setPostDelay: value => { awaitDelay = value; } };
    }
    const open = async page => {
      await page.getByRole('button', { name: 'Talk to Opax', exact: true }).click();
      await page.getByRole('button', { name: 'Checking availability…' }).waitFor({ state: 'hidden' });
    };
    const fits = async page => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const box = await page.locator('#opax-voice-panel').boundingBox();
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= page.viewportSize().width + 1 && box.y + box.height <= page.viewportSize().height);
    };
    for (const width of [320, 390, 768, 1440]) {
      const f = await fixture(width), p = f.page;
      assert.deepEqual(f.requests, []);
      await open(p);
      assert.equal(f.sdkRequests.length, 0);
      assert.equal(await p.evaluate(() => window.voiceSdkStarts), 0);
      await fits(p);
      assert.equal(await p.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Close voice assistant');
      await p.screenshot({ path: join(tmpdir(), `opax-voice-ready-${browserName}-${width}.png`) });
      await p.getByRole('button', { name: 'Start talking', exact: true }).click();
      await p.getByRole('button', { name: 'Mute mic', exact: true }).waitFor();
      assert.equal(await p.evaluate(() => window.voiceSdkStarts), 1);
      assert.match(await p.locator('.opax-voice-allowance strong').textContent(), /^(?:10:00|9:5\d)$/); // not the 90-second reservation expiry
      await p.getByRole('button', { name: 'Mute mic', exact: true }).click();
      assert.equal(await p.evaluate(() => window.voiceMuted), true);
      assert.equal(await p.getByRole('button', { name: 'Unmute mic', exact: true }).getAttribute('aria-pressed'), 'true');
      await p.evaluate(() => {
        window.voiceOptions.onMessage({ role: 'user', event_id: 1, message: 'Where are the grants?' });
        window.voiceOptions.onMessage({ role: 'agent', event_id: 2, message: 'See [the grant record](/money/grants?open=example). <img src=x onerror=alert(1)> [unsafe](javascript:alert(1))' });
        window.voiceOptions.onAgentToolResponse({ full_tool_result: JSON.stringify({ sources: [{ title: 'A source speech', url: location.origin + '/doc/example' }, { title: 'Bad external', url: 'https://evil.example/doc/example' }, { title: 'Private endpoint', url: '/api/community/keys' }, { title: 'Search the record', url: '/search?q=grants' }] }) });
      });
      assert.equal(await p.locator('.opax-voice-transcript img').count(), 0);
      assert.equal(await p.locator('.opax-voice-sources a').count(), 3);
      assert.equal(await p.locator('.opax-voice-sources').getByText('Bad external').count(), 0);
      await fits(p);
      await p.screenshot({ path: join(tmpdir(), `opax-voice-active-${browserName}-${width}.png`) });
      await p.keyboard.press('Escape');
      await p.locator('#opax-voice-panel').waitFor({ state: 'hidden' });
      await p.waitForFunction(() => window.voiceSdkEnds > 0);
      assert.equal(await p.evaluate(() => document.activeElement.classList.contains('opax-voice-launcher')), true);
      assert.ok(f.requests.includes('/api/voice/finish'));
      assert.deepEqual(f.errors, []);
      assertions += 15;
      await p.close();
    }
    {
      const f = await fixture(390, { unlimited: true, total_seconds: null }), p = f.page;
      await open(p);
      assert.equal(await p.locator('.opax-voice-allowance strong').textContent(), 'Unlimited');
      assert.match(await p.locator('.opax-voice-allowance').textContent(), /up to 10 minutes per call/);
      await p.getByRole('button', { name: 'Start talking', exact: true }).click();
      await p.getByRole('button', { name: 'Mute mic', exact: true }).waitFor();
      assert.match(await p.locator('.opax-voice-allowance').textContent(), /left in this call · unlimited calls/);
      await p.getByRole('button', { name: 'End call', exact: true }).click();
      await p.waitForFunction(() => document.querySelector('.opax-voice-allowance strong').textContent === 'Unlimited');
      assert.equal(await p.getByRole('button', { name: 'Start talking', exact: true }).isEnabled(), true);
      await fits(p);assert.deepEqual(f.errors, []);assertions += 6;
      await p.close();
    }
    for (const [name, overrides] of [['signed-out', { signed_in: false }], ['disabled', { enabled: false }], ['exhausted', { remaining_seconds: 0 }], ['active-elsewhere', { active_session: { id: 'another-call', expires_at: Date.now() / 1000 + 300 } }]]) {
      const f = await fixture(390, overrides); await open(f.page);
      if (name === 'signed-out') assert.equal(await f.page.getByRole('link', { name: 'Sign in to talk for free' }).getAttribute('href'), '/community?view=signin');
      else assert.equal(await f.page.getByRole('button', { name: 'Start talking', exact: true }).isDisabled(), true);
      assert.equal(f.sdkRequests.length, 0);
      assert.deepEqual(f.errors, []);
      assertions += 3;
      await f.page.close();
    }
    for (const edge of ['cancel-connecting', 'cancel-reserving', 'denied', 'navigate', 'offline', 'background', 'allowance']) {
      const f = await fixture(390), p = f.page; await open(p);
      if (edge === 'cancel-connecting') await p.evaluate(() => { window.voiceConnectDelay = 450; });
      if (edge === 'cancel-reserving') f.setPostDelay(450);
      if (edge === 'denied') await p.evaluate(() => { window.voiceDenied = true; });
      if (edge === 'allowance') { f.setStatus({ remaining_seconds: 1 }); await p.keyboard.press('Escape'); await open(p); }
      await p.getByRole('button', { name: 'Start talking', exact: true }).click();
      if (edge === 'cancel-connecting' || edge === 'cancel-reserving') {
        await p.getByRole('button', { name: 'Cancel', exact: true }).click();
        await p.waitForTimeout(650);
        assert.equal(await p.getByRole('button', { name: 'Start talking', exact: true }).isVisible(), true);
        if (edge === 'cancel-connecting') assert.ok(await p.evaluate(() => window.voiceSdkEnds >= 1));
      } else if (edge === 'denied') {
        await p.getByText('Microphone access was not allowed.', { exact: false }).waitFor();
      } else {
        await p.getByRole('button', { name: 'Mute mic', exact: true }).waitFor();
        if (edge === 'navigate') await p.evaluate(() => { history.pushState({}, '', '/money'); dispatchEvent(new Event('opax:route')); });
        if (edge === 'offline') await p.evaluate(() => dispatchEvent(new Event('offline')));
        if (edge === 'background') await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
        await p.waitForFunction(() => window.voiceSdkEnds > 0);
      }
      await p.waitForTimeout(80);
      assert.deepEqual(f.errors, []);
      if (edge !== 'cancel-reserving') assert.ok(f.requests.includes('/api/voice/finish'), edge + ' finish');
      assertions += 3;
      await p.close();
    }
    for (const edge of ['success', 'permission-pending', 'socket-pending', 'partial-audio-failure']) {
      const f = await fixture(390, {}, true), p = f.page;
      await open(p);
      if (edge === 'permission-pending') await p.evaluate(() => { window.realMicDelay = 450; });
      if (edge === 'socket-pending') await p.evaluate(() => { window.realSocketDelay = 450; });
      if (edge === 'partial-audio-failure') await p.evaluate(() => { window.realOutputFailure = true; });
      await p.getByRole('button', { name: 'Start talking', exact: true }).click();
      if (edge === 'success') {
        await p.getByRole('button', { name: 'Mute mic', exact: true }).waitFor();
        assert.ok(await p.evaluate(() => window.realMicTracks.some(track => track.readyState === 'live')));
        await p.getByRole('button', { name: 'End call', exact: true }).click();
      } else if (edge === 'permission-pending') {
        await p.waitForFunction(() => window.realMicRequests > 0);
        await p.getByRole('button', { name: 'Cancel', exact: true }).click();
      } else if (edge === 'socket-pending') {
        await p.waitForFunction(() => window.realSocketCount > 0);
        await p.getByRole('button', { name: 'Cancel', exact: true }).click();
        assert.ok(await p.evaluate(() => window.realMicTracks.every(track => track.readyState === 'ended')));
      } else await p.getByText('We could not start the conversation.', { exact: false }).waitFor();
      await p.waitForTimeout(650);
      assert.ok(await p.evaluate(() => window.realMicTracks.length > 0 && window.realMicTracks.every(track => track.readyState === 'ended')), edge + ' microphone release');
      assert.deepEqual(await p.evaluate(() => window.cspViolations), [], edge + ' CSP');
      assert.deepEqual(f.errors, [], edge + ' uncaught errors');
      assert.ok(f.requests.includes('/api/voice/finish'));
      assertions += 5;
      await p.close();
    }
    await browser.close();
    console.log(`${browserName}: responsive states, source safety, lazy loading, call controls and cancellation passed`);
  }
  console.log(`${assertions} voice browser assertions passed; no live provider calls.`);
} finally { server.close(); }
