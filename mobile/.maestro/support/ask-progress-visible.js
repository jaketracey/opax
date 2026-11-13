/* global maestro, output */
// Runs in Maestro and in the geometry regression tests. No inset is an edge:
// keyboard-controller may reserve scroll space without covering those pixels.
(function () {
  const ask = JSON.parse(maestro.copiedText);
  function measured(frame) {
    return !!frame && isFinite(frame.y) && frame.width > 0 && frame.height > 0;
  }
  const question = ask.askQuestion;
  const block = measured(ask.askProgress) ? ask.askProgress : ask.askError;
  const top =
    measured(ask.navContent) && measured(ask.scrollFrame)
      ? Math.max(ask.navContent.y + ask.navContent.height, ask.scrollFrame.y)
      : NaN;
  const bottom =
    measured(ask.scrollFrame) && measured(ask.askDock)
      ? Math.min(
          ask.scrollFrame.y + ask.scrollFrame.height,
          ask.askDock.y,
          measured(ask.tab) ? ask.tab.y : ask.windowHeight,
          ask.windowHeight - ask.keyboardHeight,
        )
      : NaN;
  function readable(frame) {
    return (
      measured(frame) && frame.y >= top && frame.y + frame.height <= bottom
    );
  }
  output.askVisible =
    ask.screen === 'ask-screen' && readable(question) && readable(block);
})();
