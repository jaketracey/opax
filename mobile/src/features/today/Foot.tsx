import { View } from 'react-native';
import { PageFoot } from '../../design/record';

/**
 * The foot of Today (`PageFoot`, Today variant): the independence line,
 * then "Report a correction". The edition's source is in its card and the
 * "leads, not findings" line lives on Leads and About. The containers keep
 * the journeys' ids: `today-foot`, and `today-independence` and
 * `today-screen-footer` for the independence line's block.
 */
export function TodayFoot() {
  return (
    <View testID="today-foot" collapsable={false}>
      <View testID="today-independence" collapsable={false}>
        <View testID="today-screen-footer" collapsable={false}>
          <PageFoot variant="today" />
        </View>
      </View>
    </View>
  );
}
