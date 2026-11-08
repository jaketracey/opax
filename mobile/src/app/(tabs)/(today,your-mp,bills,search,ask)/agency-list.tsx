import { Redirect, useLocalSearchParams } from 'expo-router';
import { agencyRoute } from '../../../navigation/routes/public-money';

/** An agency's suppliers or contracts: the agency page, on that segment. */
export default function AgencyList() {
  const {
    id = '',
    kind,
    name,
  } = useLocalSearchParams<{
    id: string;
    kind?: string;
    name?: string;
  }>();
  const route = agencyRoute(id, name);
  return (
    <Redirect
      href={{
        ...route,
        params: {
          ...route.params,
          ...(kind === 'suppliers' || kind === 'contracts'
            ? { section: kind }
            : {}),
        },
      }}
    />
  );
}
