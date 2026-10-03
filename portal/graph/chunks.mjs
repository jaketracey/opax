// Which files in public/chunks/ a graph build may remove. The directory is
// shared: voice/build.mjs writes its voice-* chunks there, and an older money
// map chunk can be kept on purpose for a page still holding the money map that
// imports it. So the build removes only chunks it wrote itself, as recorded in
// graph/chunks.json by the previous build, that this build no longer writes,
// and never one that a script left in public/ still imports.
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CHUNK_FILE = /^[A-Za-z0-9_-]+\.js$/

/** The chunk file names the last graph build recorded; [] before the first. */
export function readManifest(path) {
  if (!existsSync(path)) return []
  const names = JSON.parse(readFileSync(path, 'utf8')).chunks
  if (!Array.isArray(names) || !names.every((n) => typeof n === 'string' && CHUNK_FILE.test(n))) {
    throw new Error(`${path}: "chunks" must be a list of chunk file names`)
  }
  return names
}

export function writeManifest(path, names) {
  writeFileSync(path, `${JSON.stringify({ chunks: [...names].sort() }, null, 2)}\n`)
}

/**
 * Removes the previous build's chunks that this build did not write again and
 * that nothing left in public/ imports. A kept chunk's own imports are kept
 * with it. Returns { removed, kept } (file names, sorted).
 */
export function pruneChunks({ publicDir, previous, current }) {
  const chunksDir = join(publicDir, 'chunks')
  const written = new Set(current)
  const stale = new Set(previous.filter((n) => !written.has(n) && existsSync(join(chunksDir, n))))
  const scripts = (dir, prefix) => existsSync(dir)
    ? readdirSync(dir).filter((n) => n.endsWith('.js')).map((n) => ({ name: prefix + n, path: join(dir, n) }))
    : []
  // Every script that stays: the top-level modules and the other chunks.
  const live = [...scripts(publicDir, ''), ...scripts(chunksDir, 'chunks/')]
    .filter((s) => !(s.name.startsWith('chunks/') && stale.has(s.name.slice(7))))
  const kept = new Set()
  for (let i = 0; i < live.length; i++) {
    const text = readFileSync(live[i].path, 'utf8')
    for (const name of stale) {
      if (kept.has(name) || !text.includes(name)) continue
      kept.add(name)
      live.push({ name: `chunks/${name}`, path: join(chunksDir, name) })
    }
  }
  const removed = [...stale].filter((n) => !kept.has(n)).sort()
  for (const name of removed) rmSync(join(chunksDir, name))
  return { removed, kept: [...kept].sort() }
}
