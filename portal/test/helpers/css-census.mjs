// How much of a stylesheet is hard-coded: the classifier behind the design
// ratchet in design-tokens.test.mjs (and the uplift census, docs/design/
// uplift-2026-10). Each declaration in seven categories (spacing, type, colour,
// radius, shadow, motion, rules) is a token use, hard-coded (any literal value,
// with or without a token beside it) or neutral (0, none, auto, inherit).
export function stripComments(css) {
  // Keep newlines so line numbers survive.
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}
/** Yields {selector, at, prop, value, line} for every declaration. */
export function* walk(css, startLine = 1) {
  const src = stripComments(css);
  const stack = []; // {kind:'rule'|'at', text}
  let buf = '';
  let line = startLine;
  let bufLine = line;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\n') line++;
    if (ch === '{') {
      stack.push(buf.trim());
      buf = ''; bufLine = line;
    } else if (ch === '}') {
      yield* decls(buf, stack, bufLine);
      stack.pop();
      buf = ''; bufLine = line;
    } else if (ch === ';' && stack.length) {
      yield* decls(buf, stack, bufLine);
      buf = ''; bufLine = line;
    } else {
      if (!buf.trim()) bufLine = line;
      buf += ch;
    }
  }
}
function* decls(text, stack, line) {
  const t = text.trim();
  if (!t) return;
  const sel = stack[stack.length - 1] || '';
  if (/^@(font-face|keyframes|-webkit-keyframes)/.test(stack.find((s) => s.startsWith('@')) || '') && /^@font-face/.test(stack.find((s) => s.startsWith('@')) || '')) return;
  const m = t.match(/^(--[\w-]+|[a-z-]+)\s*:\s*([\s\S]*)$/i);
  if (!m) return;
  const at = stack.filter((s) => s.startsWith('@')).join(' ');
  yield { selector: sel, at, prop: m[1].toLowerCase(), value: m[2].replace(/\s*!important\s*$/, '').trim(), line };
}

// ---- classification -----------------------------------------------------------
export const CATEGORY = (p) => {
  if (p.startsWith('--')) return null; // custom property definitions are counted separately
  if (/^(margin|padding)(-(top|right|bottom|left|block|inline|block-start|block-end|inline-start|inline-end))?$/.test(p) || /^(gap|row-gap|column-gap|grid-gap|grid-row-gap|grid-column-gap)$/.test(p) || /^scroll-(margin|padding)/.test(p)) return 'spacing';
  if (/^(font|font-size|font-weight|line-height|letter-spacing|font-family)$/.test(p)) return 'type';
  if (/radius$/.test(p)) return 'radius';
  if (/^(box-shadow|text-shadow)$/.test(p)) return 'shadow';
  if (/^(transition|animation)(-|$)/.test(p)) return 'motion';
  if (/^(color|background|background-color|border-color|border-(top|right|bottom|left|block|inline|block-start|block-end|inline-start|inline-end)-color|outline-color|fill|stroke|text-decoration-color|caret-color|accent-color|column-rule-color|stop-color)$/.test(p)) return 'colour';
  if (/^(border|border-(top|right|bottom|left|block|inline|block-start|block-end|inline-start|inline-end)|outline|text-decoration)$/.test(p)) return 'rule'; // colour + width shorthand
  return null;
};
export const stripVars = (v) => {
  // Remove var(...) including nested parens, so a fallback inside is not counted.
  let out = '', depth = 0;
  for (let i = 0; i < v.length; i++) {
    if (depth === 0 && v.startsWith('var(', i)) { depth = 1; i += 3; continue; }
    if (depth > 0) { if (v[i] === '(') depth++; else if (v[i] === ')') depth--; continue; }
    out += v[i];
  }
  return out;
};
const LEN = /(?<![\w#.-])-?(?:\d*\.\d+|\d+)(px|rem|em|ch|ex|vw|vh|vmin|vmax|svh|dvh|lvh|pt|%)(?![\w])/g;
const NUM = /(?<![\w#.-])-?(?:\d*\.\d+|\d+)(?![\w%.])/g;
const HEXC = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
const FUNC_COLOUR = /\b(rgba?|hsla?|oklch|oklab|lab|lch)\(/g;
const NAMED = /\b(white|black|red|green|blue|grey|gray|silver|gold|navy|orange|yellow|purple|teal|maroon|olive|lime|aqua|fuchsia|beige|ivory|tan|khaki|crimson|whitesmoke|gainsboro|darkgr[ae]y|lightgr[ae]y|dimgr[ae]y)\b/gi;
const DUR = /(?<![\w.-])(?:\d*\.\d+|\d+)m?s\b/g;
const EASE = /\b(ease|ease-in|ease-out|ease-in-out|linear|cubic-bezier\([^)]*\)|steps\([^)]*\))\b/g;

const nonZero = (lits) => lits.filter((l) => !/^-?0*\.?0+(px|rem|em|%|ch|vw|vh)?$/.test(l));

export function rawLiterals(cat, prop, value) {
  const bare = stripVars(value);
  const colours = () => [...(bare.match(HEXC) || []), ...[...bare.matchAll(FUNC_COLOUR)].map((m) => m[0]), ...((bare.replace(/url\([^)]*\)/g, '').match(NAMED)) || [])];
  switch (cat) {
    case 'spacing': return nonZero(bare.match(LEN) || []);
    case 'radius': return nonZero(bare.match(LEN) || []);
    case 'type': {
      if (prop === 'font-family') return /^(inherit|initial|unset)$/.test(bare.trim()) || !bare.trim() ? [] : [bare.trim()];
      if (prop === 'font-weight') return /\b(\d{3}|bold|bolder|lighter)\b/.test(bare) ? [bare.trim()] : [];
      if (prop === 'line-height') return /^(normal|inherit|initial|unset)?$/.test(bare.trim()) ? [] : [bare.trim()];
      if (prop === 'letter-spacing') return nonZero(bare.match(LEN) || []).length || /\d/.test(bare) && !/^0$/.test(bare.trim()) ? [bare.trim()] : [];
      if (prop === 'font-size') return /^(inherit|initial|unset|smaller|larger)?$/.test(bare.trim()) ? [] : [bare.trim()];
      // font shorthand: raw unless the whole thing is a var()
      return bare.trim() && !/^(inherit|initial|unset)$/.test(bare.trim()) ? [bare.trim()] : [];
    }
    case 'colour': return colours();
    case 'shadow': return bare.trim() && !/^(none|inherit|initial|unset)$/.test(bare.trim()) && (nonZero(bare.match(LEN) || []).length || colours().length) ? [bare.trim()] : [];
    case 'motion': return [...(bare.match(DUR) || []).filter((d) => !/^0m?s$/.test(d)), ...((/(transition|animation)(-timing-function)?$/.test(prop) ? bare.match(EASE) : null) || [])];
    case 'rule': return [...colours(), ...nonZero(bare.match(LEN) || [])];
  }
  return [];
}
export const usesVar = (v) => /var\(--/.test(v);

export const classify = (prop, value) => { const cat = CATEGORY(prop); if (!cat) return null; const raw = rawLiterals(cat, prop, value); const v = usesVar(value); return { cat, raw, kind: raw.length && v ? 'mixed' : raw.length ? 'raw' : v ? 'token' : 'neutral' }; };

/** Hard-coded and token declaration counts for a stylesheet's text. */
export function census(css) {
  const counts = { hard: 0, token: 0 };
  for (const d of walk(css)) {
    if (d.prop.startsWith('--') || /@(-webkit-)?keyframes|@font-face/.test(d.at)) continue;
    const c = classify(d.prop, d.value);
    if (!c || c.kind === 'neutral') continue;
    if (c.kind === 'token') counts.token++; else counts.hard++;
  }
  return counts;
}
