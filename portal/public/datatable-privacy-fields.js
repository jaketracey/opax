import {queryValues} from './datatable-query.js?v=6dd55aab38';
import {csvFields} from './datatable-csv.js?v=af19f6f725';

/** Only explicitly selected person-bearing fields use row identity matching.
 * Visitor queries always use the complete strict guard. */
export function* privacyTexts(row,config = {}) {
  for (const [key,value] of Object.entries(row)) {
    if (config.privacyFields && !config.privacyFields.includes(key)) continue;
    yield key;
    if (value && typeof value === 'object') yield JSON.stringify(value);
    yield* queryValues(value);
  }
}
export const privacyValues = (row,config = {}) => Object.entries(row)
  .filter(([key])=>!config.privacyFields || config.privacyFields.includes(key))
  .flatMap(([,value])=>[...queryValues(value)]);
export function* privacyCSVFields(csv,config) {
  let at=0;
  for (const field of csvFields(csv)) {
    const column=config.columns[at++ % config.columns.length];
    if (!config.privacyFields || config.privacyFields.includes(column.key)) yield field;
  }
}
