import { useLocalSearchParams } from 'expo-router';
import { SeatStateList } from '../../../features/seat/SeatStateList';

/** `/seat/state/[code]`: Browse by state inside the sheet. */
export default function SeatState() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <SeatStateList code={String(code ?? '')} presentation="sheet" />;
}
