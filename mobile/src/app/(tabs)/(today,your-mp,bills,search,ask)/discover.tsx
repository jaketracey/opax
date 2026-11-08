import { Redirect, useLocalSearchParams } from 'expo-router';

/** Discover is part of Leads: old links keep their kind and lead. */
export default function Discover() {
  const { category, item } = useLocalSearchParams<{
    category?: string;
    item?: string;
  }>();
  return (
    <Redirect
      href={{
        pathname: '/leads',
        params: {
          ...(category ? { category } : {}),
          ...(item ? { item } : {}),
        },
      }}
    />
  );
}
