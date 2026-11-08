import { useLocalSearchParams } from 'expo-router';
import { SeatChooser } from '../../features/seat/SeatChooser';

/** `/seat`: the seat chooser sheet (specs/your-mp.md 4); `scope=vic` for Victoria. */
export default function Seat() {
  const { locate, scope } = useLocalSearchParams<{
    locate?: string;
    scope?: string;
  }>();
  return (
    <SeatChooser
      presentation="sheet"
      scope={scope === 'vic' ? 'vic' : 'federal'}
      locate={locate === '1'}
    />
  );
}
