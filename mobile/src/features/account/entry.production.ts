import { Platform } from 'react-native';
import { AccountComingSoon } from '../ComingSoon';
import { AccountRowsScreen } from './AccountRows';

// Production Account and about with the voice switch off. iOS keeps its
// placeholder; Android, which then leaves its OpaxVoice module out, shows the
// one list of rows, as any Android build without the module does. Voice and
// its sign-in stay out of these builds (src/voice/README.md).
const ProductionAccount =
  Platform.OS === 'android' ? AccountRowsScreen : AccountComingSoon;
export default ProductionAccount;
