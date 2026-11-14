import { Screen } from '../../design/layout';
import { ContentUnavailable } from '../../design/states';
import { learnCopy } from './copy';

/**
 * `/learn/minute`: "Parliament in a minute" belongs to ad-newcomer-c, which
 * replaces this file with its page when it merges. Until then the hub's row
 * opens this holding screen.
 */
export default function MinutePlaceholder() {
  return (
    <Screen testID="learn-minute">
      <ContentUnavailable
        symbol="text.book.closed"
        title={learnCopy.minute}
        testID="learn-minute-placeholder"
      />
    </Screen>
  );
}
