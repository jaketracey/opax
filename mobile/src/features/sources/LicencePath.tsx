import { useLocalSearchParams } from 'expo-router';
import { PhotoCreditsList } from '../explore/PhotoCredits';
import DatasetsList from './DatasetsList';
import { DatasetPage } from './DatasetPage';
import FontsList from './FontsList';
import PortraitsList from './PortraitsList';
import { SourcesScreen } from './SourcesScreen';

/**
 * `/licence/sources/…`: the Account stack's Sources screens, pushed inside
 * the Licence sheet (account.md 4.4 "Further").
 */
export default function LicencePath() {
  const { path } = useLocalSearchParams<{ path?: string | string[] }>();
  const parts = (Array.isArray(path) ? path : path ? [path] : []).filter(
    Boolean,
  );
  switch (parts[0]) {
    case 'datasets':
      return <DatasetsList />;
    case 'dataset':
      return <DatasetPage id={parts[1] ?? ''} />;
    case 'portraits':
      return <PortraitsList />;
    case 'photos':
      return <PhotoCreditsList />;
    case 'fonts':
      return <FontsList />;
    default:
      return <SourcesScreen />;
  }
}
