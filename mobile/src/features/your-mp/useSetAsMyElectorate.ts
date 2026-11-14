import { Alert } from 'react-native';
import type { Electorate } from '../../api/catalogs';
import { confirmAction } from '../../design/menu';
import { thisDevice } from '../../design/device';
import { savedSeatDirectory, useSeat } from './useSeat';
export interface SetAsMyElectorate {
  visible: boolean;
  label: string;
  run(): Promise<void>;
}
export function useSetAsMyElectorate(seat: Electorate): SetAsMyElectorate {
  const saved = useSeat();
  const current = saved.status === 'chosen' ? saved.choice.seatId : null;
  const visible =
    saved.status !== 'loading' &&
    saved.status !== 'error' &&
    current !== seat.electorate_id &&
    seat.jurisdiction === 'federal' &&
    seat.chamber === 'representatives' &&
    seat.status !== 'historical';
  const label = `Set ${seat.name} as my electorate`;
  async function commit(): Promise<void> {
    try {
      await saved.choose(seat);
    } catch {
      Alert.alert(
        `Your electorate couldn’t be saved on this ${thisDevice()}.`,
        undefined,
        [
          {
            text: 'Try again',
            onPress: () => {
              void commit();
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    }
  }
  async function run(): Promise<void> {
    if (!visible) return;
    if (current) {
      const old = savedSeatDirectory()?.electorates.data.electorates.find(
        (s) => s.electorate_id === current,
      );
      confirmAction(
        `Replace ${old?.name ?? 'your electorate'} with ${seat.name}?`,
        [
          {
            title: 'Replace',
            onPress: () => {
              void commit();
            },
          },
        ],
      );
    } else await commit();
  }
  return { visible, label, run };
}
