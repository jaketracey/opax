import type { ApiClient } from '../../api/client';
import { decodeMatrix, decodeTide } from '../reports/model';
import { decodeYear, type Matrix, type Tide, type TideScope } from './model';
import { date, invalid, object, optional } from '../../api/validation';
import { decodePictures } from './pictures';
import { TwoSlotStore } from '../../storage/two-slot';

/**
 * D-E1: `/api/tide` and `/api/matrix` date their counts with `generated_at`.
 * Kept when present so the source line reads it (`dataAsOf`); a response
 * without it stays "Date not published", never the fetch time.
 */
const generatedAt = (raw: unknown) => {
  const value = optional(date)(object(raw).generated_at);
  return value ? { generated_at: value } : {};
};
export const decodeDatedTide = (raw: unknown): Tide => ({
  ...decodeTide(raw),
  ...generatedAt(raw),
});
export const decodeDatedMatrix = (raw: unknown): Matrix => ({
  ...decodeMatrix(raw),
  ...generatedAt(raw),
});
export class ExploreRepository {
  constructor(private client: Pick<ApiClient, 'get' | 'getForAction'>) {}
  year = (year: number) =>
    this.client.get(`/years/${year}.json`, (raw) => decodeYear(raw, year));
  pictures = () => this.client.get('/years/pictures.json', decodePictures);
  tide = (scope: TideScope) =>
    this.client.getForAction(`/api/tide?scope=${scope}`, (raw) => {
      const data = decodeDatedTide(raw);
      if (data.scope !== scope)
        invalid('The returned tide does not match these parliaments.');
      return data;
    });
  /** One paid read per session (the client keeps the promise). */
  matrix = () => this.client.getForAction('/api/matrix', decodeDatedMatrix);
}

/** Device-only conveniences: the last year and subject the reader chose. */
export interface ExploreChoices {
  year?: number;
  subject?: string;
}
const decodeChoices = (raw: unknown): ExploreChoices | null => {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  return {
    ...(Number.isInteger(value.year) &&
    (value.year as number) >= 1998 &&
    (value.year as number) <= 2026
      ? { year: value.year as number }
      : {}),
    ...(typeof value.subject === 'string' ? { subject: value.subject } : {}),
  };
};
const choiceStore = new TwoSlotStore<ExploreChoices>(
  ['opax-explore-choices-v1.json', 'opax-explore-choices-v1.b.json'],
  decodeChoices,
  (v) => v,
);
let choices: ExploreChoices | null = null;
/** Never throws: a missing or unreadable store is no choice. */
export async function readExploreChoices(): Promise<ExploreChoices> {
  if (choices) return choices;
  try {
    choices = (await choiceStore.read()) ?? {};
  } catch {
    choices = {};
  }
  return choices;
}
export function saveExploreChoice(change: ExploreChoices) {
  void readExploreChoices()
    .then((saved) => {
      choices = { ...saved, ...change };
      return choiceStore.save(choices);
    })
    .catch(() => undefined); // Device convenience only.
}
