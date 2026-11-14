import type { Block, Inline } from './answer-markdown';

/** A span the reveal keeps laid out but undrawn (AnswerBody sets it clear). */
export type RevealInline = Inline & { unseen?: boolean };

const runs = (block: Block): Inline[][] => {
  switch (block.kind) {
    case 'bullets':
    case 'numbered':
      return block.items;
    case 'table':
      return [...block.header, ...block.rows.flat()];
    default:
      return [block.spans];
  }
};
const length = (span: Inline) => (span.kind === 'cite' ? 0 : span.text.length);

/** The drawn characters of streamed blocks, in reading order. */
export function revealLength(blocks: readonly Block[]): number {
  let total = 0;
  for (const block of blocks)
    for (const run of runs(block))
      for (const span of run) total += length(span);
  return total;
}

/** Never between the halves of a surrogate pair. */
function cut(text: string, at: number) {
  const code = text.charCodeAt(at);
  return code >= 0xdc00 && code <= 0xdfff ? at + 1 : at;
}

/**
 * The same blocks with every character outside `[from, to)` marked unseen.
 * Spans are split at the window's edges, so both the settled layer and the
 * layer fading in lay out the whole text and break lines identically.
 */
export function revealWindow(
  blocks: readonly Block[],
  from: number,
  to: number,
): Block[] {
  let offset = 0;
  const mark = (run: Inline[]): Inline[] => {
    const out: RevealInline[] = [];
    for (const span of run) {
      if (span.kind === 'cite') {
        out.push(span);
        continue;
      }
      const start = offset;
      const text = span.text;
      offset += text.length;
      const edges = [from, to]
        .map((edge) => edge - start)
        .filter((edge) => edge > 0 && edge < text.length)
        .map((edge) => cut(text, edge));
      let at = 0;
      for (const edge of [...new Set([...edges, text.length])].sort(
        (a, b) => a - b,
      )) {
        if (edge <= at) continue;
        const seen = start + at >= from && start + at < to;
        out.push({
          ...span,
          text: text.slice(at, edge),
          ...(seen ? {} : { unseen: true }),
        });
        at = edge;
      }
    }
    return out;
  };
  return blocks.map((block): Block => {
    switch (block.kind) {
      case 'bullets':
      case 'numbered':
        return { ...block, items: block.items.map(mark) };
      case 'table':
        return {
          ...block,
          header: block.header.map(mark),
          rows: block.rows.map((row) => row.map(mark)),
        };
      default:
        return { ...block, spans: mark(block.spans) };
    }
  });
}

/** True when a run's first drawn character is unseen: its marker hides too. */
export function startsUnseen(run: readonly RevealInline[]): boolean {
  const first = run.find((span) => span.kind !== 'cite');
  return !first || !!first.unseen;
}
