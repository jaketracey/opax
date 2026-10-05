import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Button } from '../src/design/primitives';
import { AnswerCaption } from '../src/features/talk/AnswerCaption';
import type { TranscriptTurn } from '../src/voice';

test.each<TranscriptTurn>([
  { role: 'user', id: 1, text: 'Synthetic question' },
  { role: 'agent', id: 2, text: ' ' },
])('does not offer reporting for $role caption "$text"', (turn) => {
  const report = jest.fn();
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <AnswerCaption turn={turn} onReportAnswer={report} />,
    );
  });
  expect(renderer.root.findAllByType(Button)).toHaveLength(0);
  expect(report).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});

test('reporting passes only the selected completed answer after an explicit tap', () => {
  const report = jest.fn();
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <>
        <AnswerCaption
          turn={{ role: 'agent', id: 1, text: 'First synthetic answer' }}
          onReportAnswer={report}
        />
        <AnswerCaption
          turn={{ role: 'agent', id: 2, text: 'Second synthetic answer' }}
          onReportAnswer={report}
        />
      </>,
    );
  });
  expect(report).not.toHaveBeenCalled();
  const button = renderer.root.findAllByType(Button)[1]!;
  expect(button.props.label).toBe('Report this answer');
  act(() => button.props.onPress());
  expect(report).toHaveBeenCalledTimes(1);
  expect(report).toHaveBeenCalledWith({
    id: 2,
    text: 'Second synthetic answer',
  });
  act(() => renderer.unmount());
});

test('the same report control uses corrected answer words', () => {
  const report = jest.fn();
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <AnswerCaption
        turn={{ role: 'agent', id: 1, text: 'Original synthetic answer' }}
        onReportAnswer={report}
      />,
    );
    renderer.update(
      <AnswerCaption
        turn={{ role: 'agent', id: 1, text: 'Corrected synthetic answer' }}
        onReportAnswer={report}
      />,
    );
  });
  expect(report).not.toHaveBeenCalled();
  act(() => renderer.root.findByType(Button).props.onPress());
  expect(report).toHaveBeenCalledWith({
    id: 1,
    text: 'Corrected synthetic answer',
  });
  act(() => renderer.unmount());
});
