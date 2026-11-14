import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { InlineError, LinkRow } from '../../design/primitives';
import { searchInterestRoute, type InterestResult } from './navigation';
import { interestDetail, interestName, resultMeta } from './present';

/** Interest results open the member's register section in either search list. */
export function InterestRow({
  row,
  fallback,
  testID,
}: {
  row: InterestResult;
  fallback: () => void | Promise<void>;
  testID: string;
}) {
  const [failed, setFailed] = useState(false);
  const open = () => {
    setFailed(false);
    void (async () => {
      const route = await searchInterestRoute(row);
      if (route) router.push(route);
      else await fallback();
    })().catch(() => setFailed(true));
  };
  return (
    <View>
      <LinkRow
        title={interestName(row.title)}
        detail={[resultMeta(row), interestDetail(row)]
          .filter(Boolean)
          .join(' · ')}
        onPress={open}
        testID={testID}
      />
      {failed ? (
        <InlineError
          subject="This page"
          message="This page couldn’t be opened."
          onRetry={open}
        />
      ) : null}
    </View>
  );
}
