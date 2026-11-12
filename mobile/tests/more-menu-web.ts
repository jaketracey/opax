// Load the public entry first so its path registry completes before spying
// on the implementation behind the entry's read-only re-exports.
import '../src/navigation/external';
import * as external from '../src/navigation/external/sheets';

/** Press the actual menu action, checking its destination with the real guard. */
export function expectPublicSiteAction(
  rows: readonly { label: string; onPress?: () => void }[],
  path: string,
) {
  const open = jest.spyOn(external, 'openOnWeb').mockResolvedValue(undefined);
  try {
    const action = rows.at(-1)!;
    expect(action.label).toBe('Open on opax.com.au');
    expect(action.onPress).toEqual(expect.any(Function));
    action.onPress!();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0]!.slice(0, 2)).toEqual([path, expect.any(String)]);
    expect(external.webPageUrl(open.mock.calls[0]![0])).not.toBeNull();
  } finally {
    open.mockRestore();
  }
}
