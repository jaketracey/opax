/** The record's Markdown, shared by the SPA and crawlable answers.
 * Deliberately bounded: source HTML is always text; only http(s) links live. */
const NOTE_BASE = 'https://theyvoteforyou.org.au';
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function billNoteRepair(text) {
  return String(text || '').replace(/\r\n?/g, '\n')
    .replace(/([*_]{1,3})(\[[^\]]+\]\([^)\s]+\))\1/g, '$2')
    .replace(/\[[^\]\n]+\]\([^\n]*?\)(?=\s|[.,;:]|$)|([^\s(\]*_])\(/g, (match, before) => before ? before + ' (' : match)
    .replace(/[ \t]+([.,;:])/g, '$1')
    .replace(/[ \t]+\)/g, ')')
    .replace(/[ \t]+/g, ' ').trim();
}
export function billStripTitle(text, bill) {
  let out = String(text || '').trim();
  for (const t of [bill?.title, bill?.short_title]) {
    const title = String(t || '').trim();
    if (title && out.toLowerCase().startsWith(title.toLowerCase())) {
      out = out.slice(title.length).replace(/^\s*[-–—:]\s*/, '').trim();
    }
  }
  return out;
}
export function billStripStage(text, stage) {
  const s = String(stage || '').trim(), out = String(text || '').trim();
  if (!s || !out.toLowerCase().startsWith(s.toLowerCase())) return out;
  return out.slice(s.length).replace(/^\s*[-–—:]\s*/, '').trim() || out;
}

/** Some TVFY exports already collapsed the block boundaries. Recover only
 * explicit markers after sentence/colon boundaries, never ordinary a > b.
 * Their flattened question-heading ends at its question mark. */
function blockLines(text) {
  return String(text || '').replace(/\r\n?/g, '\n')
    .replace(/([.!?)][*_]?)[ \t]+(#{1,3}[ \t]+)/g, '$1\n\n$2')
    .replace(/(^#{1,3}[ \t]+[^\n>]+?)[ \t]+(?=>[ \t])/gm, '$1\n\n')
    .replace(/(^#{1,3}[ \t]+[^\n?]+\?)[ \t]+(?=\S)/gm, '$1\n\n')
    .replace(/:[ \t]+>[ \t]+/g, ':\n\n> ')
    .replace(/^[ \t]*>[^\n]*$/gm, line => line.replace(/[ \t]+>[ \t]+>[ \t]+/g, '\n>\n> '));
}

// Tokenise before escaping, so generated HTML can never be reparsed as source.
function inline(text, links = true, depth = 0) {
  if (depth > 8) return escape(text);
  const tokens = /\[([^\]\n]+)\]\(([^\s()]+(?:\([^\s()]*\)[^\s()]*)*)(?:[ \t]+"[^"\n]*")?\)|\*\*(\S(?:[^*\n]*?\S)?)\*\*|\*(\S(?:[^*\n]*?\S)?)\*|\b_(\S(?:[^_\n]*?\S)?)_\b/g;
  let out = '', last = 0;
  for (const m of text.matchAll(tokens)) {
    out += escape(text.slice(last, m.index));
    if (m[1] !== undefined) {
      let href = null;
      try {
        const value = /^\/(?!\/)/.test(m[2]) ? NOTE_BASE + m[2] : m[2];
        if (/^https?:\/\//i.test(value) && !/[\u0000-\u0020\u007f]/.test(value)) {
          const url = new URL(value);
          if (/^https?:$/.test(url.protocol)) href = url.href;
        }
      } catch { /* invalid destinations keep their label */ }
      const label = inline(m[1], false, depth + 1);
      out += links && href ? `<a href="${escape(href)}" rel="noopener" target="_blank">${label}&nbsp;↗︎</a>` : label;
    } else {
      const bold = m[3] !== undefined;
      out += `<${bold ? 'strong' : 'em'}>${inline(m[3] ?? m[4] ?? m[5], links, depth + 1)}</${bold ? 'strong' : 'em'}>`;
    }
    last = m.index + m[0].length;
  }
  return out + escape(text.slice(last));
}

export function divisionPlain(text) {
  return blockLines(text)
    .replace(/\[([^\]]+)\]\(([^\s()]+(?:\([^\s()]*\)[^\s()]*)*)(?:\s+"[^"]*")?\)/g, '$1')
    .replace(/^\s*(?:#{1,3}\s+|>\s?|[-*]\s+|\d+[.)]\s+)/gm, '')
    .replace(/[*_]{1,3}(?=\S)([^*_]+?)(?<=\S)[*_]{1,3}/g, '$1')
    .replace(/\s+/g, ' ').trim();
}

export function renderDivisionMarkdown(text, depth = 0) {
  if (depth > 8) return `<p>${escape(text)}</p>`;
  const lines = blockLines(billNoteRepair(text)).split('\n');
  const list = line => /^\s*(?:([-*])\s+|(\d+)[.)]\s+)(.*)$/.exec(line);
  const block = line => /^\s*(?:#{1,3}\s+|>\s?)/.test(line) || list(line);
  let out = '', i = 0;
  while (i < lines.length) {
    if (!lines[i].trim()) { i++; continue; }
    const heading = /^\s*#{1,3}\s+(.+)$/.exec(lines[i]);
    if (heading) { out += `<p class="division-markdown-heading"><strong>${inline(heading[1])}</strong></p>`; i++; continue; }
    if (/^\s*>/.test(lines[i])) {
      const quote = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>[ \t]?/, ''));
      out += `<blockquote>${renderDivisionMarkdown(quote.join('\n'), depth + 1)}</blockquote>`;
      continue;
    }
    const item = list(lines[i]);
    if (item) {
      const tag = item[2] ? 'ol' : 'ul';
      out += `<${tag}${item[2] && Number(item[2]) !== 1 ? ` start="${Number(item[2])}"` : ''}>`;
      while (i < lines.length) {
        const next = list(lines[i]);
        if (!next || (next[2] ? 'ol' : 'ul') !== tag) break;
        i++; const body = [next[3]];
        while (i < lines.length && lines[i].trim() && !block(lines[i])) body.push(lines[i++]);
        out += `<li>${body.map(line => inline(line)).join('<br>')}</li>`;
      }
      out += `</${tag}>`; continue;
    }
    const para = [lines[i++]];
    while (i < lines.length && lines[i].trim() && !block(lines[i])) para.push(lines[i++]);
    out += `<p>${para.map(line => inline(line)).join('<br>')}</p>`;
  }
  return out;
}
