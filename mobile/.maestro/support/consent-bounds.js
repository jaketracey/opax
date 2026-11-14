/* global maestro, output */
(function () {
  const sample = JSON.parse(maestro.copiedText);
  function measured(frame) {
    return (
      !!frame &&
      [frame.x, frame.y, frame.width, frame.height].every(function (value) {
        return typeof value === 'number' && isFinite(value);
      }) &&
      frame.width > 0 &&
      frame.height > 0
    );
  }
  const sheet = sample.consentSheet;
  const action = sample.consentContinue;
  output.consentAX5 = sample.consentAX5 === true;
  output.consentContinueInside =
    output.consentAX5 &&
    measured(sheet) &&
    measured(action) &&
    action.x >= sheet.x &&
    action.y >= sheet.y &&
    action.x + action.width <= sheet.x + sheet.width &&
    action.y + action.height <= sheet.y + sheet.height;
})();
