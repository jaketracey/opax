import { useLocalSearchParams } from 'expo-router';
import { DatasetPage } from '../../features/sources/DatasetPage';

/** The source sheet's licence row: the dataset, as this sheet's root. */
export default function LicenceDataset() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DatasetPage id={String(id ?? '')} licenceRoot />;
}
