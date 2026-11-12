import { chips, defaultOptions, type Answer, type Turn } from './model';

/** A description of this search, never a claim about exhaustive coverage. */
export function noAnswerSearch(data: Answer, question: Turn) {
  const options = { ...defaultOptions, ...question.options, ...data.scope };
  const query = data.asked_as?.trim() || question.askedAs || question.text;
  const filters = chips(options).map((chip) => `${chip.key}: ${chip.value}`);
  return `Searched OPAX ${options.kind === 'speech' ? 'speeches' : 'records'} for “${query}”.${filters.length ? ` ${filters.join('. ')}.` : ''}`;
}
