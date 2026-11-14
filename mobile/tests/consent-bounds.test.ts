import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const script = readFileSync(
  join(__dirname, '../.maestro/support/consent-bounds.js'),
  'utf8',
);
const sheet = { x: 242, y: 360, width: 540, height: 584 };
const action = { x: 258, y: 800, width: 508, height: 90 };
function check(bounds: object, frame: object = sheet, ax5 = true) {
  const output = { consentAX5: false, consentContinueInside: false };
  runInNewContext(script, {
    maestro: {
      copiedText: JSON.stringify({
        consentAX5: ax5,
        consentSheet: frame,
        consentContinue: bounds,
      }),
    },
    output,
  });
  return output;
}
test('the whole Continue button must fit inside the actual sheet on both axes', () => {
  expect(check(action)).toEqual({
    consentAX5: true,
    consentContinueInside: true,
  });
  for (const clipped of [
    { ...action, y: 900 },
    { ...action, y: 350 },
    { ...action, x: 240 },
    { ...action, width: 600 },
    { ...action, height: 0 },
    { ...action, y: null },
  ])
    expect(check(clipped).consentContinueInside).toBe(false);
  expect(check(action, {}).consentContinueInside).toBe(false);
});
test('correct bounds at any category other than AX5 fail the flow check', () => {
  expect(check(action, sheet, false)).toEqual({
    consentAX5: false,
    consentContinueInside: false,
  });
});
test('the flow checks the runner environment and native bounds before pressing Continue', () => {
  const flow = readFileSync(
    join(__dirname, '../.maestro/58b-ipad-ax5-first-question.yaml'),
    'utf8',
  );
  expect(flow).toContain(
    "${CONTENT_SIZE === 'accessibility-extra-extra-extra-large'}",
  );
  expect(flow.indexOf('- runFlow: support/consent-bounds.yaml')).toBeLessThan(
    flow.indexOf('- tapOn:\n    id: ask-consent-continue'),
  );
  const probe = readFileSync(
    join(__dirname, '../plugins/search-geometry/Probe.swift'),
    'utf8',
  );
  expect(probe).toContain('"consentSheet": visibleRect(consentSheet, window)');
  expect(probe).toContain('"consentContinue": rect(');
});
