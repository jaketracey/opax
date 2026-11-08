import { useLocalSearchParams } from 'expo-router';
import { SeatChooser } from '../../../features/seat/SeatChooser';

/** `/welcome/seat`: the chooser pushed inside the welcome (today.md 4). */
export default function WelcomeSeat() {
  const { locate } = useLocalSearchParams<{ locate?: string }>();
  return <SeatChooser presentation="welcome" locate={locate === '1'} />;
}
