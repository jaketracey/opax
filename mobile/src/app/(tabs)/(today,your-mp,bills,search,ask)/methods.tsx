import { Redirect } from 'expo-router';
import { methodsRoute } from '../../../navigation/routes/reference';
/** Methods lives in the Account stack; the quiz's `/methods` links land there. */
export default function LegacyMethods() {
  return <Redirect href={methodsRoute} />;
}
