#!/usr/bin/env node
// Retain existing recordings. Automated browsers are restricted to own-site tests.
if (process.argv.includes('--help')) {
  console.log('Demo capture is paused under docs/SOURCES-ACCESS.md. Existing recordings are retained.')
} else {
  throw new Error('Demo capture paused: automated browsers are allowed only in own-site tests.')
}
