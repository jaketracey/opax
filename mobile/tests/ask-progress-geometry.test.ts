import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const script = readFileSync(
  resolve(__dirname, '../.maestro/support/ask-progress-visible.js'),
  'utf8',
);
const frame = (y: number, height: number) => ({
  x: 0,
  y,
  width: 350,
  height,
});
const sample = {
  screen: 'ask-screen',
  windowHeight: 874,
  // UIKit retains this expanded frame after Ask switches to an inline title.
  nav: frame(62, 106),
  navContent: frame(62, 44),
  scrollFrame: frame(0, 874),
  adjustedInset: { top: 168, bottom: 350 },
  askDock: frame(650, 100),
  tab: frame(770, 70),
  keyboardHeight: 0,
  askQuestion: frame(116.7, 50),
  askProgress: frame(180, 30),
  askError: {},
};
function visible(changes: Record<string, unknown> = {}) {
  const output: { askVisible?: boolean } = {};
  runInNewContext(script, {
    maestro: { copiedText: JSON.stringify({ ...sample, ...changes }) },
    output,
  });
  return output.askVisible;
}

test('the sim-62 question below the inline controls is readable despite the retained large-title frame and scroll insets', () => {
  expect(visible()).toBe(true);
  expect(visible({ adjustedInset: { top: 300, bottom: 800 } })).toBe(true);
});

test('the entire question and progress must clear the visible controls and viewport', () => {
  expect(visible({ askQuestion: frame(100, 50) })).toBe(false);
  expect(visible({ askProgress: frame(640, 30) })).toBe(false);
  expect(visible({ askQuestion: frame(620, 50) })).toBe(false);
  expect(visible({ askProgress: frame(90, 30) })).toBe(false);
  expect(visible({ scrollFrame: frame(130, 600) })).toBe(false);
  expect(visible({ scrollFrame: frame(0, 200) })).toBe(false);
});

test('the actual keyboard and tab bar cover content, even when the scroll insets do not', () => {
  const askProgress = frame(580, 30);
  expect(visible({ askProgress })).toBe(true);
  expect(visible({ askProgress, keyboardHeight: 280 })).toBe(false);
  expect(visible({ askProgress, tab: frame(600, 70) })).toBe(false);
  // A collapsed tab bar can leave no visible tab frame.
  expect(visible({ tab: {} })).toBe(true);
});

test('an error is measured as a whole block and missing progress never falls back to the question', () => {
  expect(visible({ askProgress: {}, askError: frame(180, 110) })).toBe(true);
  expect(visible({ askProgress: {}, askError: frame(600, 110) })).toBe(false);
  for (const field of ['askQuestion', 'navContent', 'scrollFrame', 'askDock']) {
    expect(visible({ [field]: {} })).toBe(false);
  }
  expect(visible({ askProgress: {} })).toBe(false);
  expect(visible({ screen: 'today-screen' })).toBe(false);
});
