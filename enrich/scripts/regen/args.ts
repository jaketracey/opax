// Strict flag parsing for the regen CLI. Fails closed: an unknown flag, a `--flag=value` form, a missing or
// malformed value, a stray word or a repeated flag is an error, never a silent default.
import { HARD_CAP_USD } from './guard.ts'
import { SLICES, type SliceName } from './slices.ts'

type Kind = 'bool' | 'id' | 'int' | 'usd' | 'text' | 'slice' | 'variant'

const RUN = { run: 'id' } as const
export const COMMANDS: Record<string, Record<string, Kind>> = {
  help: {},
  init: {},
  headroom: {},
  seed: { ...RUN, slice: 'slice', variant: 'variant', rids: 'text' },
  run: { ...RUN, 'cap-usd': 'usd', concurrency: 'int', limit: 'int', compare: 'bool', wait: 'bool' },
  status: { ...RUN },
  verify: { ...RUN },
  release: { ...RUN, variant: 'variant', 'dry-run': 'bool' },
  rollback: { ...RUN, all: 'bool', slice: 'slice', rids: 'text', limit: 'int', 'dry-run': 'bool' },
}

/** Flags each command cannot run without. */
export const REQUIRED: Record<string, string[]> = {
  seed: ['run', 'slice', 'rids'],
  run: ['run', 'cap-usd'],
  status: ['run'],
  verify: ['run'],
  release: ['run', 'variant'],
  rollback: ['run'],
}

export const MAX_CONCURRENCY = 4

export interface Parsed {
  cmd: string
  flags: Map<string, string | number | boolean>
}

export class ArgError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ArgError'
  }
}

function value(cmd: string, name: string, kind: Kind, raw: string): string | number {
  const bad = (want: string) => new ArgError(`${cmd}: --${name} ${want}, got '${raw}'`)
  switch (kind) {
    case 'id':
      if (!/^[a-z0-9-]{3,40}$/.test(raw)) throw bad('takes lowercase letters, digits and dashes (3-40)')
      return raw
    case 'int': {
      if (!/^[1-9][0-9]{0,6}$/.test(raw)) throw bad('takes a positive whole number')
      const n = Number(raw)
      if (name === 'concurrency' && n > MAX_CONCURRENCY) throw bad(`is at most ${MAX_CONCURRENCY}`)
      return n
    }
    case 'usd': {
      if (!/^[0-9]+(\.[0-9]+)?$/.test(raw)) throw bad(`takes a plain number of US dollars above 0 and at most ${HARD_CAP_USD} (no $ sign)`)
      const n = Number(raw)
      if (!(Number.isFinite(n) && n > 0 && n <= HARD_CAP_USD)) throw bad(`must be above 0 and at most ${HARD_CAP_USD}`)
      return n
    }
    case 'slice':
      if (!Object.hasOwn(SLICES, raw)) throw bad(`is one of ${Object.keys(SLICES).join(', ')}`)
      return raw as SliceName
    case 'variant':
      if (raw !== 'b' && raw !== 'role') throw bad('is b or role')
      return raw
    case 'text':
      if (!raw.trim()) throw bad('needs a value')
      return raw
    default:
      throw new ArgError(`${cmd}: --${name}: unknown kind`)
  }
}

/** argv without the node and script paths: `<command> --flag value --switch ...`. */
export function parseArgs(argv: readonly string[]): Parsed {
  const [cmd = 'help', ...rest] = argv
  const spec = COMMANDS[cmd]
  if (!spec) throw new ArgError(`unknown command '${cmd}' (one of ${Object.keys(COMMANDS).join(', ')})`)
  const flags = new Map<string, string | number | boolean>()
  for (let i = 0; i < rest.length; i += 1) {
    const tok = rest[i]
    if (!tok.startsWith('--') || tok.length < 3) throw new ArgError(`${cmd}: unexpected '${tok}' (flags start with --)`)
    if (tok.includes('=')) {
      const bare = tok.slice(0, tok.indexOf('='))
      const fix = spec[bare.slice(2)] === 'bool' ? bare : tok.replace('=', ' ')
      throw new ArgError(`${cmd}: write '${fix}', not '${tok}' (no = in flags)`)
    }
    const name = tok.slice(2)
    const kind = spec[name]
    if (!kind) throw new ArgError(`${cmd}: unknown flag --${name} (allowed: ${Object.keys(spec).map((f) => '--' + f).join(' ') || 'none'})`)
    if (flags.has(name)) throw new ArgError(`${cmd}: --${name} given twice`)
    const next = rest[i + 1]
    if (kind === 'bool') {
      if (next !== undefined && !next.startsWith('--')) throw new ArgError(`${cmd}: --${name} is a switch and takes no value (got '${next}')`)
      flags.set(name, true)
      continue
    }
    if (next === undefined || next.startsWith('--')) throw new ArgError(`${cmd}: --${name} needs a value`)
    flags.set(name, value(cmd, name, kind, next))
    i += 1
  }
  for (const name of REQUIRED[cmd] ?? []) if (!flags.has(name)) throw new ArgError(`${cmd}: --${name} is required`)
  if (cmd === 'rollback') {
    const scopes = ['all', 'slice', 'rids'].filter((f) => flags.has(f))
    if (scopes.length !== 1) throw new ArgError('rollback: give exactly one of --all, --slice <name> or --rids a,b,c')
  }
  if (cmd === 'seed') {
    const slice = flags.get('slice') as SliceName
    const variant = (flags.get('variant') as string | undefined) ?? SLICES[slice].variants[0]
    if (!(SLICES[slice].variants as readonly string[]).includes(variant)) throw new ArgError(`seed: slice ${slice} takes --variant ${SLICES[slice].variants.join(' or ')}`)
    flags.set('variant', variant)
  }
  return { cmd, flags }
}
