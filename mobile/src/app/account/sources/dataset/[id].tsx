import { useLocalSearchParams } from 'expo-router';
import { DatasetPage } from '../../../../features/sources/DatasetPage';

export default function AccountDataset() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DatasetPage id={String(id ?? '')} />;
}
