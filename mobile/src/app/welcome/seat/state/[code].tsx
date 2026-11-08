import { useLocalSearchParams } from 'expo-router';
import { SeatStateList } from '../../../../features/seat/SeatStateList';

/** `/welcome/seat/state/[code]`: Browse by state inside the welcome. */
export default function WelcomeSeatState() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <SeatStateList code={String(code ?? '')} presentation="welcome" />;
}
