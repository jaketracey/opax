import type { AskStage, AskStep } from './stream';

/** Start order is retained when an already-running lookup reports again. */
export function runningSteps(
  steps: readonly AskStep[],
  step: AskStep,
): AskStep[] {
  const index = steps.findIndex((running) => running.id === step.id);
  if (step.state !== 'running') return steps.filter((s) => s.id !== step.id);
  if (index < 0) return [...steps, step];
  return steps.map((s, i) => (i === index ? step : s));
}

export function askStatusText(
  stage: AskStage | null,
  steps: readonly AskStep[],
) {
  // Writing is the final status, even if a lookup's completion went missing.
  const step =
    stage === 'Writing the answer'
      ? undefined
      : steps.filter((s) => s.state === 'running').at(-1);
  return step
    ? step.arg
      ? `${step.label}: ${step.arg}`
      : step.label
    : (stage ?? 'Reading your question');
}
