// Usage: tsx scripts/first-line-check.ts <screenshot.png>...
// Recognises each screenshot's drawn text with Vision (scripts/ocr-lines.swift)
// and applies journey 15's first-line rule. Exits 1 if any capture fails.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { firstLineVerdict, type Ocr } from './first-line-policy';

const SOURCE = 'scripts/ocr-lines.swift';
const BINARY = 'build/qa-tools/ocr-lines';
// Bounded, so a stuck compiler or recogniser fails the run instead of
// holding it: a first compile takes about 3s and a recognition under 1s.
const COMPILE_TIMEOUT_MS = 180_000;
const OCR_TIMEOUT_MS = 60_000;

/** Compiles the recogniser once per source revision. */
function recogniser(): string {
  const digest = createHash('sha256')
    .update(readFileSync(SOURCE))
    .digest('hex');
  const stamp = `${BINARY}.sha256`;
  if (
    !existsSync(BINARY) ||
    !existsSync(stamp) ||
    readFileSync(stamp, 'utf8') !== digest
  ) {
    mkdirSync('build/qa-tools', { recursive: true });
    execFileSync('xcrun', ['swiftc', '-O', SOURCE, '-o', BINARY], {
      stdio: ['ignore', 'ignore', 'inherit'],
      timeout: COMPILE_TIMEOUT_MS,
    });
    writeFileSync(stamp, digest);
  }
  return BINARY;
}

const screenshots = process.argv.slice(2);
if (!screenshots.length)
  throw new Error('Usage: first-line-check.ts <screenshot.png>...');
const binary = recogniser();
let failed = 0;
for (const screenshot of screenshots) {
  const ocr = JSON.parse(
    execFileSync(binary, [screenshot], {
      encoding: 'utf8',
      timeout: OCR_TIMEOUT_MS,
    }),
  ) as Ocr;
  const verdict = firstLineVerdict(ocr);
  if (!verdict.pass) failed++;
  console.log(
    JSON.stringify({
      screenshot,
      pass: verdict.pass,
      reason: verdict.reason,
      titleBottomPx: verdict.title
        ? Math.round(verdict.title.top + verdict.title.height)
        : null,
      prefixTopPx: verdict.prefix ? Math.round(verdict.prefix.top) : null,
    }),
  );
}
if (failed) {
  console.error(`FAIL first line: ${failed} of ${screenshots.length} captures`);
  process.exit(1);
}
console.log(`PASS first line: ${screenshots.length} captures`);
