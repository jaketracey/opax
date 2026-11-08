import { router } from 'expo-router';
import { catalogs } from '../../api/runtime';
import { askFilterModel } from '../sheets/filter-models';
import {
  registerFilterModel,
  type FilterChoice,
  type FilterValues,
} from '../sheets/filter-model';
import { filtersRoute } from '../../navigation/routes/filters';
import { defaultOptions, normaliseOptions, type AskOptions } from './model';
import { askSession } from './session';

export const topics: Record<string, string> = {
  gambling: 'Gambling',
  'financial-services': 'Financial services',
  'mining-energy': 'Mining & energy',
  'climate-environment': 'Climate & environment',
  'property-construction': 'Property & construction',
  housing: 'Housing',
  health: 'Health',
  'media-communications': 'Media & communications',
  'hospitality-alcohol': 'Hospitality & alcohol',
  'defence-security': 'Defence & security',
  agriculture: 'Agriculture',
  'unions-workplace': 'Unions & workplace',
  immigration: 'Immigration',
  'indigenous-affairs': 'Indigenous affairs',
  'tax-budget': 'Tax & budget',
  education: 'Education',
  'welfare-social': 'Welfare & social services',
  'integrity-democracy': 'Integrity & democracy',
  'infrastructure-transport': 'Infrastructure & transport',
  'justice-law': 'Justice & law',
  'foreign-affairs': 'Foreign affairs',
};
/** The filter sheet's owner key for Ask's options. */
export const ASK_OPTIONS_OWNER = 'ask';
const keys = ['speaker', 'party', 'state', 'topic', 'from', 'to'] as const;
export function toFilterValues(o: AskOptions): FilterValues {
  return { ...Object.fromEntries(keys.map((k) => [k, o[k]])), kind: o.kind };
}
export function fromFilterValues(v: FilterValues): AskOptions {
  const o = { ...defaultOptions };
  for (const k of keys) o[k] = typeof v[k] === 'string' ? (v[k] as string) : '';
  o.kind = v.kind === 'speech' ? 'speech' : 'all';
  return normaliseOptions(o);
}
/**
 * Ask's options use Search's one filter config (A2, `journeys/ask.md` 4.3
 * and 14): "Person" names the member row (senators are on it; "Speaker"
 * reads as the Speaker of the House) and the request key stays `speaker`.
 */
export function askOptionsModel(members?: FilterChoice[]) {
  const base = askFilterModel({
    members,
    topics: Object.entries(topics).map(([value, label]) => ({ value, label })),
  });
  return {
    ...base,
    rows: base.rows.map((row) =>
      row.key === 'speaker' ? { ...row, title: 'Person' } : row,
    ),
    footer: 'All records include political funding, contracts and grants.',
  };
}
let members: FilterChoice[] | undefined;
async function loadMembers() {
  if (members) return members;
  try {
    const roster = await catalogs.roster();
    const people = roster.data.people.filter((p) => !p.roster_only);
    members = [
      ...people.filter((p) => p.current),
      ...people.filter((p) => !p.current),
    ].map((p) => ({ value: p.name, label: p.name }));
  } catch {
    /* The sheet still opens; the Person list is empty until the roster loads. */
  }
  return members;
}
/** Registers the options model with the composer's options, then opens the sheet. */
export function bindAskOptions(choices?: FilterChoice[]) {
  return registerFilterModel(askOptionsModel(choices), {
    owner: ASK_OPTIONS_OWNER,
    value: toFilterValues(askSession.composerOptions()),
    // Done and every change land on the fresh draft or the open conversation.
    onChange: (next) => askSession.options(fromFilterValues(next)),
  });
}
export async function openAskOptions() {
  bindAskOptions(members);
  router.push(filtersRoute('ask', ASK_OPTIONS_OWNER));
  const loaded = await loadMembers();
  if (loaded) bindAskOptions(loaded);
}
