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
  function Probe(props: {
    streaming: boolean;
    animated?: boolean;
    obscured?: number;
  }) {
    const made = useStreamFollow(scroll, {
      streaming: props.streaming,
      obscured: props.obscured ?? 100,
      gap: 24,
      animated: props.animated ?? true,
      rest: -100,
    });
    return <Holder follow={made} />;
  }
  // The handlers reach the test through a host prop, not a render-time write.
  function Holder(_props: { follow: Follow }) {
    return null;
  }
  const render = (props: Parameters<typeof Probe>[0]) => {
    act(() => {
      if (tree) tree.update(<Probe {...props} />);
      else tree = create(<Probe {...props} />);
    });
    follow = tree.root.findByType(Holder).props.follow;
  };
  beforeEach(() => {
    scrollTo.mockClear();
    tree = undefined as unknown as ReactTestRenderer;
    render({ streaming: true });
    act(() => {
      follow.onViewport(700);
      follow.onTurn(200);
    });
  });
  afterEach(() => act(() => tree.unmount()));

  test('it follows the growing end while the reader leaves it alone', () => {
    act(() => follow.onProgress(100));
    expect(scrollTo).not.toHaveBeenCalled();
    act(() => follow.onProgress(700));
    expect(scrollTo).toHaveBeenLastCalledWith({
      y: 200 + 700 + 24 - 600,
      animated: true,
    });
    // The next piece measures from where the last one went, before any
    // scroll event reports it.
    act(() => follow.onProgress(760));
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 384, animated: true });
    expect(scrollTo).toHaveBeenCalledTimes(2);
    // The same edge again asks for nothing.
    act(() => follow.onProgress(760));
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });

  test('a drag ends it for this answer; the next answer follows again', () => {
    act(() => follow.onProgress(700));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    act(() => {
      follow.onDrag();
      follow.onScroll(40);
    });
    act(() => follow.onProgress(900));
    act(() => follow.onProgress(1400));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    render({ streaming: false });
    render({ streaming: true });
    act(() => follow.onProgress(900));
    expect(scrollTo).toHaveBeenCalledTimes(2);
    expect(scrollTo).toHaveBeenLastCalledWith({
      y: 200 + 900 + 24 - 600,
      animated: true,
    });
  });

  test('Reduce Motion jumps', () => {
    render({ streaming: true, animated: false });
    act(() => follow.onProgress(700));
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 324, animated: false });
  });

  test('nothing moves once the answer has landed', () => {
    act(() => follow.onProgress(700));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    render({ streaming: false });
    // The final answer lays out taller, the composer changes, the page
    // reports its size: none of it scrolls.
    act(() => {
      follow.onProgress(1200);
      follow.onTurn(260);
      follow.onViewport(640);
    });
    render({ streaming: false, obscured: 300 });
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  test('the keyboard rising over a streaming answer brings its end back into view', () => {
    act(() => follow.onProgress(250));
    expect(scrollTo).not.toHaveBeenCalled();
    render({ streaming: true, obscured: 400 });
    expect(scrollTo).toHaveBeenLastCalledWith({
      y: 200 + 250 + 24 - 300,
      animated: true,
    });
  });
});
