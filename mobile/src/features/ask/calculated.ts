import { formatDate, formatFinancialYear } from '../../design/format';
import { parseAnswer } from './answer-markdown';
import type { Answer } from './model';

/**
 * Calculated answers (pay, money) and the other answer kinds: the kind line
 * with the date the data was current, where Machine-written pills go, the
 * one caveat, and figure blocks that are drawn only with their own date and
 * source (specs/ask.md 2.5, journeys/ask.md 4.5 and 10.7). The as-at date is
 * never the answer's own time.
 */
export function isCalculated(answer: Answer): boolean {
  return (
    answer.answer_status === 'calculated' ||
    !!answer.money_ranking ||
    !!answer.pay_answer
  );
}
const isPay = (answer: Answer) => !!answer.pay_answer;
const ISO = /^(\d{4})-(\d{2})-(\d{2})/;
const FY = /^(\d{4})\s*[-–]\s*(\d{2})$/;

function financialYearOf(date: string): number | null {
  const fy = FY.exec(date.trim());
  if (fy) return Number(fy[1]);
  const iso = ISO.exec(date.trim());
  if (!iso) return null;
  const year = Number(iso[1]);
  return Number(iso[2]) >= 7 ? year : year - 1;
}
/** The date the answer's data was current: "1 Jul 2026" or "2024–25". */
export function asAtFor(answer: Answer): string | null {
  const sent = answer.data_as_at?.trim();
  if (sent) {
    if (ISO.test(sent)) return formatDate(sent.slice(0, 10), 'short') || null;
    const fy = FY.exec(sent);
    if (fy) return formatFinancialYear(Number(fy[1]));
  }
  const dates = answer.sources.flatMap((s) => (s.date ? [s.date.trim()] : []));
  if (isPay(answer)) {
    const newest = dates
      .filter((d) => ISO.test(d))
      .map((d) => d.slice(0, 10))
      .sort()
      .at(-1);
    return newest ? formatDate(newest, 'short') || null : null;
  }
  const years = dates.flatMap((d) => {
    const fy = financialYearOf(d);
    return fy === null ? [] : [fy];
  });
  return years.length ? formatFinancialYear(Math.max(...years)) : null;
}
/** The line under the question for answers that are not ordinary. */
export function kindLine(answer: Answer): string | null {
  if (isCalculated(answer)) {
    const asAt = asAtFor(answer);
    return isPay(answer)
      ? `Calculated from the pay determinations${asAt ? ` as at ${asAt}` : ''}`
      : `Calculated from disclosed receipts${asAt ? ` to ${asAt}` : ''}`;
  }
  if (answer.answer_status === 'evidence_only')
    return 'Passages from the record';
  return null;
}
/** A table or list built from the records, with no sentence a model wrote. */
function deterministic(text: string): boolean {
  const blocks = parseAnswer(text);
  return (
    blocks.length > 0 &&
    blocks.every(
      (block) =>
        block.kind === 'table' ||
        block.kind === 'bullets' ||
        block.kind === 'numbered',
    )
  );
}
/**
 * One Machine-written pill per block a model wrote. The overview always has
 * one; a calculated body has one only when it is model-written (by the
 * Worker's flag, or, until it sends one, when it is not a table or list).
 */
export function pills(answer: Answer): { overview: boolean; body: boolean } {
  const overview = !!answer.money_overview?.trim();
  if (answer.answer_status === 'evidence_only')
    return { overview, body: false };
  if (!isCalculated(answer)) return { overview, body: true };
  const body =
    answer.model_written ??
    (!!answer.answer.trim() && !deterministic(answer.answer));
  // A model-written body straight after the overview is the same block.
  return { overview, body: body && !overview };
}
export function caveat(answer: Answer): string | null {
  if (isCalculated(answer))
    return isPay(answer)
      ? 'Entitlements, not payslips.'
      : 'A selection of disclosed receipts, not every donor.';
  if (answer.answer_status === 'uncited')
    return 'This answer has no citations. Check the records it found.';
  return null;
}
export type FigureBlockData = {
  value: string;
  label?: string;
  asAt: string;
  source: string;
  path?: string;
};
/** Only figures the Worker dates and sources; the rest stay in the text. */
export function figureBlocks(answer: Answer): FigureBlockData[] {
  return (answer.figures ?? []).flatMap((figure) => {
    const asAt = figure.as_at?.trim();
    const source = figure.source?.trim();
    if (!asAt || !source) return [];
    const fy = FY.exec(asAt);
    return [
      {
        value: figure.value,
        ...(figure.label ? { label: figure.label } : {}),
        asAt: ISO.test(asAt)
          ? formatDate(asAt.slice(0, 10), 'short') || asAt
          : fy
            ? formatFinancialYear(Number(fy[1]))
            : asAt,
        source,
        ...(figure.path ? { path: figure.path } : {}),
      },
    ];
  });
}
