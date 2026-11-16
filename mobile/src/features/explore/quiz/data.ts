import { isE2E } from '../../../design/environment';
import {
  plainQuestion,
  quizId,
  type Deck,
  type FrontPageQuestion,
  type Question,
} from '../quiz-model';
import snapshot from '../quiz-rounds.json';
import frontPage from '../quiz-front-page.json';
import frontPageSources from '../quiz-front-page-sources.json';

/** The date the engine wrote the rounds: the quiz's source date. */
export const quizAsOf: string = snapshot.generated;

/**
 * A question's source date. Today's record questions carry their own
 * export's date, keyed by template name; the rest are the rounds'.
 */
export function questionAsOf(q: Pick<Question, 'template'>): string {
  const asOf: Record<string, string> = frontPageSources.asOf;
  return Object.hasOwn(asOf, q.template) ? asOf[q.template]! : quizAsOf;
}

const rounds = Object.fromEntries(
  (['money', 'words', 'mixed'] as const).map((deck) => [
    deck,
    (snapshot.rounds[deck] as Question[][]).map((round) =>
      round.map(plainQuestion),
    ),
  ]),
) as Record<Deck, Question[][]>;
export const quizRounds: Readonly<Record<Deck, readonly Question[][]>> = rounds;

/** One round at random for the deck (the first in e2e builds, so flows know it). */
export function drawRound(deck: Deck): Question[] {
  const list = rounds[deck];
  return list[isE2E ? 0 : Math.floor(Math.random() * list.length)]!;
}

/** Today's question deck (generate-today-question.mjs): each with its id. */
export const frontPageDeck: readonly FrontPageQuestion[] = (
  frontPage as Question[]
).map((q) => plainQuestion({ ...q, id: quizId(q) }));
export function frontPageQuestion(
  id: string | null | undefined,
): FrontPageQuestion | null {
  return (id && frontPageDeck.find((q) => q.id === id)) || null;
}
