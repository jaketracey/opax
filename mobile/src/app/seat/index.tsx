import { useLocalSearchParams } from 'expo-router';
import { SeatChooser } from '../../features/seat/SeatChooser';

/** `/seat`: the seat chooser sheet (specs/your-mp.md 4). */
export default function Seat() {
  const { locate } = useLocalSearchParams<{ locate?: string }>();
  return <SeatChooser presentation="sheet" locate={locate === '1'} />;
}
