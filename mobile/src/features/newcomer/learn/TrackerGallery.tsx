import { View } from 'react-native';
import { Screen } from '../../../design/layout';
import { Heading, Text } from '../../../design/text';
import { rhythm } from '../../../design/tokens';
import { StageTracker } from '../StageTracker';
import { trackerFixtures } from '../tracker-model';

/** Capture only: the tracker on the four kinds of bill it has to read well on. */
export default function TrackerGallery() {
  return (
    <Screen grouped barTitle="Tracker states" testID="tracker-gallery">
      <Heading level={1} kind="page">
        Bill-stage tracker
      </Heading>
      {trackerFixtures.map((fixture, i) => (
        <View
          key={i}
          style={{ gap: rhythm.tight }}
          testID={`tracker-case-${i}`}
        >
          <Text wordSafe variant="strong">
            {fixture.title}
          </Text>
          <StageTracker
            stages={fixture.stages}
            status={fixture.status}
            testID={`tracker-${i}`}
          />
        </View>
      ))}
    </Screen>
  );
}
