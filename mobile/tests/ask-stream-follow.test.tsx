import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { ScrollView } from 'react-native';
import {
  followOffset,
  useStreamFollow,
} from '../src/features/ask/stream-follow';

describe('followOffset', () => {
  const base = { viewport: 700, obscured: 100, gap: 24, offset: -100 };
  test('an answer that still fits moves nothing: its first line stays under the bar', () => {
    expect(followOffset({ ...base, tailBottom: 300 })).toBeNull();
    // Exactly at the edge, and within a point of it.
    expect(followOffset({ ...base, tailBottom: 476 })).toBeNull();
    expect(followOffset({ ...base, tailBottom: 477 })).toBeNull();
  });
  test('once it outgrows the room, the tail sits the gap above the composer', () => {
    const y = followOffset({ ...base, tailBottom: 900 })!;
    expect(y).toBe(900 + 24 - (700 - 100));
    // The tail's bottom edge, seen from that offset.
    expect(900 - y).toBe(700 - 100 - 24);
  });
  test('it never scrolls back up', () => {
    expect(followOffset({ ...base, offset: 500, tailBottom: 900 })).toBeNull();
  });
  test('a taller composer or keyboard covers more, so it follows sooner', () => {
    expect(followOffset({ ...base, obscured: 400, tailBottom: 400 })).toBe(
      400 + 24 - 300,
    );
  });
});

describe('useStreamFollow', () => {
  type Follow = ReturnType<typeof useStreamFollow>;
  const scrollTo = jest.fn();
  const scroll = { current: { scrollTo } as unknown as ScrollView };
  let follow: Follow;
  let tree: ReactTestRenderer;
  type Props = {
    streaming: boolean;
    started?: boolean;
    animated?: boolean;
    obscured?: number;
  };
  function Probe(props: Props) {
    const made = useStreamFollow(scroll, {
      streaming: props.streaming,
      started: props.started ?? true,
      obscured: props.obscured ?? 100,
      gap: 16,
      near: 24,
      animated: props.animated ?? true,
      rest: -100,
    });
    return <Holder follow={made} />;
  }
  // The handlers reach the test through a host prop, not a render-time write.
  function Holder(_props: { follow: Follow }) {
    return null;
  }
  const render = (props: Props) => {
    act(() => {
      if (tree) tree.update(<Probe {...props} />);
      else tree = create(<Probe {...props} />);
    });
    follow = tree.root.findByType(Holder).props.follow;
  };
  /** Reports, then the frame that follows them. */
  const report = (run: () => void) =>
    act(() => {
      run();
      jest.advanceTimersByTime(20);
    });
  // The offset that puts `edge` the gap above the composer.
  const end = (edge: number, thread = 8, obscured = 100) =>
    thread + 200 + edge + 16 - (700 - obscured);
  beforeEach(() => {
    jest.useFakeTimers();
    scrollTo.mockClear();
    tree = undefined as unknown as ReactTestRenderer;
    render({ streaming: true });
    report(() => {
      follow.onViewport(700);
      follow.onThread(8);
      follow.onTurn(200);
    });
  });
  afterEach(() => {
    act(() => tree.unmount());
    jest.useRealTimers();
  });

  test('it follows the growing end while the reader leaves it alone', () => {
    report(() => follow.onProgress(100));
    expect(scrollTo).not.toHaveBeenCalled();
    report(() => follow.onProgress(700));
    expect(scrollTo).toHaveBeenLastCalledWith({ y: end(700), animated: true });
    // The next piece measures from where the last one went, before any
    // scroll event reports it.
    report(() => follow.onProgress(760));
    expect(scrollTo).toHaveBeenLastCalledWith({ y: end(760), animated: true });
    expect(scrollTo).toHaveBeenCalledTimes(2);
    // The same edge again asks for nothing.
    report(() => follow.onProgress(760));
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });

  test.each([
    ['iOS: the 8 pt thread padding', 8],
    // The in-content root title at font scale 2 (2 x 55), the 36 dp gap and
    // the 16 dp padding put the thread 162 dp down the content.
    ['Android: the in-content title at a large font, its gap and padding', 162],
  ])("the thread's own place in the content counts: %s", (_name, thread) => {
    report(() => follow.onThread(thread));
    report(() => follow.onProgress(700));
    const y = scrollTo.mock.calls.at(-1)![0].y;
    expect(y).toBe(end(700, thread));
    // From that offset the tail's bottom edge, in the content, is the gap
    // above the composer's top: never under it.
    const tailInView = thread + 200 + 700 - y;
    expect(tailInView).toBe(700 - 100 - 16);
  });

  test('a drag ends it; back at the growing end it follows again', () => {
    report(() => follow.onProgress(700));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    report(() => {
      follow.onScroll(end(700));
      follow.onDrag();
      follow.onScroll(40);
    });
    report(() => follow.onProgress(900));
    report(() => follow.onProgress(1400));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    // Let go far from the end: still theirs.
    report(() => follow.onDragEnd());
    report(() => follow.onProgress(1500));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    // Dragged back to within reach of the end, and released there.
    report(() => {
      follow.onDrag();
      follow.onScroll(end(1500) - 20);
      follow.onDragEnd();
    });
    expect(scrollTo).toHaveBeenCalledTimes(2);
    expect(scrollTo).toHaveBeenLastCalledWith({
      y: end(1500),
      animated: true,
    });
    report(() => follow.onProgress(1600));
    expect(scrollTo).toHaveBeenLastCalledWith({
      y: end(1600),
      animated: true,
    });
  });

  test('a scroll that is not a drag (VoiceOver, a status-bar or tab tap) ends it too', () => {
    report(() => follow.onProgress(700));
    report(() => follow.onScroll(end(700)));
    // The follow's own animated scroll only reports rising offsets.
    report(() => follow.onProgress(800));
    report(() => {
      follow.onScroll(end(700) + 30);
      follow.onScroll(end(800));
    });
    report(() => follow.onProgress(900));
    expect(scrollTo).toHaveBeenCalledTimes(3);
    report(() => follow.onScroll(end(900)));
    // No drag began: the offset just fell, by more than the follow could.
    report(() => follow.onScroll(end(900) - 300));
    report(() => follow.onProgress(1000));
    report(() => follow.onProgress(1100));
    expect(scrollTo).toHaveBeenCalledTimes(3);
    // The same reader, scrolled back down without a drag, is followed again.
    report(() => follow.onScroll(end(1100) - 10));
    expect(scrollTo).toHaveBeenCalledTimes(4);
    expect(scrollTo).toHaveBeenLastCalledWith({
      y: end(1100),
      animated: true,
    });
  });

  test("before the text starts, the screen's own reveal scrolling up does not end it", () => {
    render({ streaming: true, started: false });
    report(() => {
      follow.onScroll(900);
      follow.onScroll(120);
    });
    render({ streaming: true, started: true });
    report(() => follow.onProgress(700));
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  test('the next answer follows again after one the reader took over', () => {
    report(() => follow.onProgress(700));
    report(() => follow.onDrag());
    report(() => follow.onProgress(900));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    render({ streaming: false });
    render({ streaming: true });
    report(() => follow.onScroll(0));
    report(() => follow.onProgress(900));
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });

  test('Reduce Motion jumps', () => {
    render({ streaming: true, animated: false });
    report(() => follow.onProgress(700));
    expect(scrollTo).toHaveBeenLastCalledWith({
      y: end(700),
      animated: false,
    });
  });

  test('nothing moves once the answer has landed', () => {
    report(() => follow.onProgress(700));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    render({ streaming: false });
    // The final answer lays out taller, the composer changes, the page
    // reports its size: none of it scrolls.
    report(() => {
      follow.onProgress(1200);
      follow.onTurn(260);
      follow.onViewport(640);
      follow.onScroll(10);
      follow.onDragEnd();
    });
    render({ streaming: false, obscured: 300 });
    act(() => jest.advanceTimersByTime(50));
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  test('the keyboard rising and the shorter scroll view land in one frame: one scroll, to the right place', () => {
    report(() => follow.onProgress(250));
    expect(scrollTo).not.toHaveBeenCalled();
    // The composer's cover changes first, the scroll view's height after.
    act(() => {
      tree.update(<Probe streaming obscured={400} />);
      follow = tree.root.findByType(Holder).props.follow;
      follow.onViewport(650);
    });
    act(() => jest.advanceTimersByTime(20));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith({
      y: 8 + 200 + 250 + 16 - (650 - 400),
      animated: true,
    });
  });

  test('an unmount cancels the pending frame', () => {
    act(() => follow.onProgress(700));
    act(() => tree.update(<></>));
    act(() => jest.advanceTimersByTime(50));
    expect(scrollTo).not.toHaveBeenCalled();
    render({ streaming: true });
  });
});
