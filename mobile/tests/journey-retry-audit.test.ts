import { registerRetries } from '../scripts/journey-retry-policy';

test('counts every executed register retry with its flow and prefix', () => {
  const log = [
    '06:00:01 [ INFO] maestro.js.JsConsole.log: OPAX_REGISTER_RETRY {"registerPrefix":"07"}',
    '06:00:02 [ INFO] maestro.js.JsConsole.log: OPAX_REGISTER_RETRY {"registerPrefix":"07-state"}',
  ].join('\n');
  expect(registerRetries(log, '07-flow')).toEqual([
    { flow: '07-flow', registerPrefix: '07' },
    { flow: '07-flow', registerPrefix: '07-state' },
  ]);
});

test('skipped and merely described scripts do not count as retries', () => {
  expect(
    registerRetries(
      [
        'Run ${console.log(\'OPAX_REGISTER_RETRY {"registerPrefix":"07"}\')} PENDING',
        'Run ${console.log(\'OPAX_REGISTER_RETRY {"registerPrefix":"07"}\')} SKIPPED',
        'maestro.js.JsConsole.log: another event',
      ].join('\n'),
      '07-flow',
    ),
  ).toEqual([]);
});

test('malformed executed markers fail the audit rather than hide retries', () => {
  expect(() =>
    registerRetries(
      'JsConsole.log: OPAX_REGISTER_RETRY {"registerPrefix":1}',
      '07',
    ),
  ).toThrow(/Invalid/);
  expect(() =>
    registerRetries('JsConsole.log: OPAX_REGISTER_RETRY {bad}', '07'),
  ).toThrow();
});
