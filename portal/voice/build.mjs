import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const portal = fileURLToPath(new URL('../', import.meta.url));
const publicDir = join(portal, 'public');
const sdkDir = join(portal, 'node_modules/@elevenlabs/client');
const assetsDir = join(publicDir, 'voice-assets');
await mkdir(assetsDir, { recursive: true });
const assets = {};
for (const [name, input] of [
  ['rawAudioProcessor', join(sdkDir, 'worklets/rawAudioProcessor.js')],
  ['audioConcatProcessor', join(sdkDir, 'worklets/audioConcatProcessor.js')],
  ['libsamplerate', join(portal, 'node_modules/@alexanderolsen/libsamplerate-js/dist/libsamplerate.worklet.js')],
]) {
  const content = await readFile(input);
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 12);
  const filename = `${name}-${hash}.js`;
  await writeFile(join(assetsDir, filename), content);
  assets[name] = '/voice-assets/' + filename;
}
await copyFile(join(sdkDir, 'LICENSE'), join(assetsDir, 'elevenlabs-LICENSE.txt'));
await copyFile(join(portal, 'node_modules/@alexanderolsen/libsamplerate-js/LICENSE.md'), join(assetsDir, 'libsamplerate-LICENSE.txt'));

// Fail visibly on upstream changes. These narrowly scoped SDK compatibility
// fixes keep capture cancellable and worklets self-hosted; no browser API is
// monkeypatched and no provider message or authentication code is changed.
const replaceOnce = (source, before, after, filename) => {
  if (source.split(before).length !== 2) throw new Error(`Review ElevenLabs compatibility patch in ${filename}: ${before.slice(0, 75)}`);
  return source.replace(before, after);
};
const sdkCompatibility = {
  name: 'opax-elevenlabs-cancellable-capture',
  setup(bundler) {
    bundler.onLoad({ filter: /@elevenlabs\/client\/dist\/(?:platform\/web\/(?:VoiceSessionSetup|input|index)|utils\/WebSocketConnection)\.js$/i }, async ({ path }) => {
      let source = await readFile(path, 'utf8');
      const patch = (before, after) => { source = replaceOnce(source, before, after, path); };
      const guardImport = `import { captureAudio } from ${JSON.stringify(join(portal, 'voice/media-guard.js'))};\n`;
      if (/\/input\.js$/.test(path)) {
        source = guardImport + source;
        patch('static async create({ sampleRate,', 'static async create({ opaxSignal, sampleRate,');
        patch('inputStream = await navigator.mediaDevices.getUserMedia({\n                audio: constraints,\n            });', 'inputStream = await captureAudio({ audio: constraints }, opaxSignal);');
        patch('await context.resume();', 'await context.resume();\n            opaxSignal?.throwIfAborted();');
        patch('return new MediaDeviceInput(context, analyser, worklet, inputStream, source, permissions, onError);', 'return Object.assign(new MediaDeviceInput(context, analyser, worklet, inputStream, source, permissions, onError), { opaxSignal });');
        patch('const newInputStream = await navigator.mediaDevices.getUserMedia({\n                audio: constraints,\n            });', 'const newInputStream = await captureAudio({ audio: constraints }, this.opaxSignal);');
      } else if (/\/VoiceSessionSetup\.js$/i.test(path)) {
        source = guardImport + source;
        patch('const [input, output] = await Promise.all([', 'const setupResults = await Promise.allSettled([');
        patch('...connection.inputFormat,', '...connection.inputFormat,\n            opaxSignal: options.opaxSignal,');
        patch('outputDeviceId: options.outputDeviceId,', 'outputDeviceId: options.outputDeviceId,\n            libsampleratePath: options.libsampleratePath,');
        patch('    const detachInput = attachInputToConnection(input, connection);', `    const failed = setupResults.find(result => result.status === 'rejected');
    if (failed || options.opaxSignal?.aborted) {
      await Promise.allSettled(setupResults.filter(result => result.status === 'fulfilled').map(result => result.value.close()));
      throw failed?.reason || new DOMException('Voice was cancelled', 'AbortError');
    }
    const [input, output] = setupResults.map(result => result.value);
    const detachInput = attachInputToConnection(input, connection);`);
        patch('preliminaryInputStream = await navigator.mediaDevices.getUserMedia({\n            audio: true,\n        });', 'preliminaryInputStream = await captureAudio({ audio: true }, options.opaxSignal);');
        patch('unlockedAudioContext = takeUnlockedAudioContext();', 'unlockedAudioContext = options.opaxAudioContext || takeUnlockedAudioContext();');
      } else if (/\/WebSocketConnection\.js$/.test(path)) {
        patch('socket = new WebSocket(url, protocols);', `config.opaxSignal?.throwIfAborted();
            socket = new WebSocket(url, protocols);
            config.opaxSignal?.addEventListener('abort', () => socket?.close(1000, 'User ended conversation'), { once: true });`);
      } else if (/\/index\.js$/.test(path)) {
        // Our small shell primes audio only on Start talking. The SDK otherwise
        // installs a permanent document-wide listener that primes on every tap.
        patch('installIosAudioUnlockListener();', '/* Explicit Opax start gesture owns audio priming. */');
      }
      return { contents: source, loader: 'js' };
    });
  },
};
const result = await build({
  entryPoints: { voice: join(portal, 'voice/index.js') },
  outdir: publicDir, bundle: true, splitting: true, minify: true,
  format: 'esm', target: 'es2022', chunkNames: 'chunks/voice-[name]-[hash]',
  define: { __OPAX_VOICE_ASSETS__: JSON.stringify(assets) },
  plugins: [sdkCompatibility], metafile: true,
});
const outputs = Object.entries(result.metafile.outputs).map(([path, info]) => ({ path, bytes: info.bytes }));
console.log('Voice browser assets built:', outputs);
