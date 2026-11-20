// Every link to Progress on the website carries the referral tag Progress supplied ("opex-au" is their spelling).
// The apps use their own sources (opex-au-ios-app, opex-au-android-app) on any Progress link they add.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'

const PUBLIC = new URL('../public/', import.meta.url)
const TAG = 'utm_medium=referral&utm_source=opex-au'

const progressLinks = text => [...text.matchAll(/https:\/\/(?:www\.)?progress\.com[^"'\s<>)\\]*/g)].map(m => m[0].replaceAll('&amp;', '&'))

test('every Progress link on the website carries exactly the opex-au referral tag', async () => {
  const files = (await readdir(PUBLIC)).filter(name => name.endsWith('.html') || name === 'spa-shell.js')
  let seen = 0
  for (const name of files) {
    for (const link of progressLinks(await readFile(new URL(name, PUBLIC), 'utf8'))) {
      seen++
      const url = new URL(link)
      assert.equal(url.search, `?${TAG}`, `${name}: ${link}`)
    }
  }
  // The footers on five pages, the Ask notice and the privacy link, plus the shell made from index.html.
  assert.ok(seen >= 8, `found only ${seen} Progress links`)
})
