import { track } from '../analytics';

/**
 * How the welcome's electorate step ended, for the anonymous first-run
 * funnel (docs/ANALYTICS.md). Three fixed categories and nothing else:
 * which screen, whether a seat was chosen or the step was skipped, and
 * which control chose. Never the seat, the state, what was typed or a
 * position. Only the welcome reports; the `/seat` sheet does not.
 */
export type FirstRunStep = 'welcome' | 'seat' | 'state';
export type FirstRunMethod = 'search' | 'location' | 'browse';

export function firstRunSkipped(step: FirstRunStep) {
  track('opax_first_run', { step, outcome: 'skipped' });
}
export function firstRunChosen(step: FirstRunStep, method: FirstRunMethod) {
  track('opax_first_run', { step, outcome: 'chosen', method });
}
