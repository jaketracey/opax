import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { boundaryFiles } from '../scripts/boundary-files';
import { scanSource } from '../scripts/source-boundary';
import { scanSwift } from '../scripts/swift-boundary';
import { scanNative } from '../scripts/native-boundary';

test.each([
  'URLSession.shared',
  'URLSessionWebSocketTask',
  'NSURLSession',
  'NWConnection',
  'NWListener',
  'NWBrowser',
  'WKWebView',
  'NSURLConnection',
  'CFStream',
  'CFReadStreamCreateForHTTPRequest',
  'CFSocketCreate',
  'LPMetadataProvider',
  'Darwin.socket(1)',
  'Stream.getStreamsToHost',
])('rejects unreviewed Swift network entry point %s', (api) => {
  expect(scanSwift('modules/leak/ios/Leak.swift', api)).not.toEqual([]);
  expect(
    scanSwift('modules/opax-share/ios/OpaxShareModule.swift', api),
  ).not.toEqual([]);
});
test.each([
  'let image = try Data(contentsOf: remoteURL)',
  'let image = NSData(contentsOf: remoteURL)',
  'let image = try Data.init(contentsOf: remoteURL)',
  'let image = try Data(contentsOf: URL(string: origin + "/og/image.png")!)',
  'let text = try String(contentsOf: remoteURL, encoding: .utf8)',
  'let player = AVPlayer(url: remoteURL)',
  'let player = AVPlayerItem(url: remoteURL)',
  'let asset = AVAsset(url: remoteURL)',
  'let asset = AVURLAsset(url: remoteURL)',
  'let parser = XMLParser(contentsOf: remoteURL)',
  'UIApplication.shared.open(remoteURL)',
])('rejects a one-line Swift URL fetch: %s', (content) => {
  for (const file of [
    'modules/leak/ios/Leak.swift',
    'modules/opax-share/ios/OpaxShareModule.swift',
    'modules/opax-voice/ios/OpaxVoiceCore/Sources/OpaxVoiceCore/HTTPClient.swift',
  ])
    expect(scanSwift(file, content)).not.toEqual([]);
});
test('Swift collection contentsOf operations and data decoding remain allowed', () => {
  const content = `var bytes = Data(); bytes.append(contentsOf: chunk)
    var items = [Int](); items.append(contentsOf: [1, 2])
    let text = String(data: bytes, encoding: .utf8)`;
  expect(
    scanSwift('modules/opax-share/ios/OpaxShareModule.swift', content),
  ).toEqual([]);
});
test('standalone Swift documentation does not grant or introduce networking', () => {
  const path =
    'modules/opax-voice/ios/OpaxVoiceCore/Tests/OpaxVoiceCoreTests/OrderedTerminationRelay.swift';
  const comment =
    '/// URLSession happens to surface an abnormal close.\n// Data(contentsOf: remoteURL) is forbidden.\n';
  expect(scanSwift(path, comment + 'actor OrderedTerminationRelay {}')).toEqual(
    [],
  );
  expect(scanSwift(path, comment + 'URLSession.shared')).not.toEqual([]);
  expect(
    scanSwift(path, comment + 'try Data(contentsOf: remoteURL)'),
  ).not.toEqual([]);
});
test.each([
  'try Data(contentsOf: Bundle.module.url(forResource: "worker-status", withExtension: "json")!)',
  'let resource = Bundle.module.url(forResource: "worker-status", withExtension: "json")!; try Data(contentsOf: resource)',
  'try String(contentsOf: URL(fileURLWithPath: path), encoding: .utf8)',
])('explicit bundled/file URL reads remain allowed: %s', (content) => {
  expect(scanSwift('modules/fixture/ios/Fixture.swift', content)).toEqual([]);
});
test.each([
  'let resource = URL(string: origin)!; try Data(contentsOf: resource)',
  'var resource = Bundle.module.url(forResource: "fixture", withExtension: "json")!; resource = remoteURL; try Data(contentsOf: resource)',
  'let resource = Bundle.module.url(forResource: "fixture", withExtension: "json")!; do { let resource = remoteURL; try Data(contentsOf: resource) }',
  'let url = Bundle.main.url(forResource: "fixture", withExtension: "json")!; func image(url: URL) -> Data? { try? Data(contentsOf: url) }',
  'let url = Bundle.main.url(forResource: "fixture", withExtension: "json")!; let load: (URL) -> Data? = { url in try? Data(contentsOf: url) }',
  'let url = Bundle.main.url(forResource: "fixture", withExtension: "json")!; let load: (URL, Int) -> Data? = { url, count in try? Data(contentsOf: url) }',
])('remote, mutable or ambiguous URL bindings remain gated: %s', (content) => {
  expect(scanSwift('modules/fixture/ios/Fixture.swift', content)).not.toEqual(
    [],
  );
});
test.each([
  '[NSURLSession.sharedSession dataTaskWithURL:url]',
  '[NSData dataWithContentsOfURL:url]',
  '[[NSString alloc] initWithContentsOfURL:url encoding:NSUTF8StringEncoding error:nil]',
  'WKWebView *view;',
  'UIWebView *view;',
  'SFSafariViewController *view;',
  'LPMetadataProvider *metadata;',
  'nw_connection_create(endpoint, parameters)',
  'nw_endpoint_create_host(host, "443")',
  '[[UIApplication sharedApplication] openURL:url options:@{} completionHandler:nil]',
  '[[NSURLConnection alloc] initWithRequest:request delegate:self]',
  'CFStreamCreatePairWithSocketToHost(NULL, host, 443, &input, &output)',
  'CFReadStreamOpen(input)',
  'CFSocketCreate(NULL, PF_INET, SOCK_STREAM, 0, 0, NULL, NULL)',
  'socket(AF_INET, SOCK_STREAM, 0)',
  'connect(fd, &address, sizeof(address))',
  'sendto(fd, bytes, count, 0, &address, sizeof(address))',
  'getaddrinfo(host, "443", NULL, &result)',
])('rejects Objective-C/C networking: %s', (content) => {
  expect(scanNative(content)).not.toEqual([]);
});
test('plain native declarations and metadata remain allowed', () => {
  expect(
    scanNative('@interface OpaxShare : NSObject; LPLinkMetadata *metadata;'),
  ).toEqual([]);
});
test('voice exceptions are exact files and APIs; metadata sharing has none', () => {
  const voice = 'modules/opax-voice/ios/OpaxVoiceCore/';
  for (const file of ['HTTPClient.swift', 'Relay.swift']) {
    const path = `${voice}Sources/OpaxVoiceCore/${file}`;
    expect(
      scanSwift(path, 'URLSession.shared; URLSessionWebSocketTask'),
    ).toEqual([]);
    expect(scanSwift(path, 'WKWebView')).not.toEqual([]);
  }
  expect(
    scanSwift(
      `${voice}Sources/OpaxVoiceCore/NewTransport.swift`,
      'URLSession.shared',
    ),
  ).not.toEqual([]);
  expect(
    scanSwift(
      `${voice}Tests/OpaxVoiceCoreTests/LoopbackRelay.swift`,
      'NWConnection; NWListener',
    ),
  ).toEqual([]);
  expect(
    scanSwift(
      'modules/opax-share/ios/OpaxShareModule.swift',
      'import LinkPresentation; let metadata = LPLinkMetadata()',
    ),
  ).toEqual([]);
});
test('static scan includes module JS/TS and native ios Swift, excluding generated builds', () => {
  const root = mkdtempSync(join(tmpdir(), 'opax-boundary-'));
  try {
    const src = join(root, 'src');
    const modules = join(root, 'modules');
    const module = join(modules, 'leak');
    mkdirSync(src);
    mkdirSync(join(module, 'ios'), { recursive: true });
    mkdirSync(join(module, 'ios', '.build'), { recursive: true });
    for (const name of ['index.ts', 'leak.js', 'leak.mts', 'leak.cts'])
      writeFileSync(join(module, name), `fetch('/api/ask')`);
    writeFileSync(join(module, 'ios', 'Leak.swift'), 'URLSession.shared');
    const native = ['Leak.m', 'Leak.mm', 'Leak.c', 'Leak.h', 'Leak.cpp'].map(
      (name) => join(module, 'ios', name),
    );
    for (const path of native) writeFileSync(path, 'NSURLSession *transport;');
    writeFileSync(
      join(module, 'ios', '.build', 'Generated.swift'),
      'URLSession.shared',
    );
    const files = boundaryFiles(src, modules);
    expect(files.javascript).toHaveLength(4);
    for (const path of files.javascript)
      expect(scanSource(path, `fetch('/api/ask')`)).not.toEqual([]);
    expect(files.swift).toEqual([join(module, 'ios', 'Leak.swift')]);
    expect(scanSwift(files.swift[0]!, 'URLSession.shared')).not.toEqual([]);
    expect(files.native.sort()).toEqual(native.sort());
    for (const path of files.native) {
      expect(path.startsWith(join(module, 'ios'))).toBe(true);
      expect(scanNative(readFileSync(path, 'utf8'))).not.toEqual([]);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('actual ESLint config scans module source files', () => {
  const script = `const { ESLint } = require('eslint'); (async () => {
    const lint = new ESLint();
    const results = await Promise.all(['modules/leak/index.ts', 'modules/leak/leak.js'].map(filePath => lint.lintText("fetch('/api/ask')", {filePath})));
    console.log(JSON.stringify(results.map(result => result[0].messages.map(message => message.ruleId))));
  })().catch(error => { console.error(error); process.exit(1); });`;
  const result = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
  });
  expect(result.status).toBe(0);
  for (const rules of JSON.parse(result.stdout))
    expect(rules).toContain('opax/transport');
});
