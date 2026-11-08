import { useSegments, type Href } from 'expo-router';
import {
  datasetRoute,
  datasetsRoute,
  fontsRoute,
  licenceHubRoute,
  licenceSourcesRoute,
  photosRoute,
  portraitsRoute,
  sourcesRoute,
} from '../../navigation/routes/reference';

/**
 * Which stack Sources and licences is in: the Account sheet, or the Licence
 * sheet a source sheet's licence row opens (account.md 4.2). Its rows push
 * within the same stack, so a reader checking a figure never lands in an
 * Account sheet they did not open.
 */
export type SourcesBase = 'account' | 'licence';
export function useSourcesBase(): SourcesBase {
  const segments = useSegments() as string[];
  return segments[0] === 'account' ? 'account' : 'licence';
}

export function sourcesHrefs(base: SourcesBase) {
  const account = base === 'account';
  return {
    hub: (account ? sourcesRoute : licenceHubRoute) as Href,
    datasets: (account
      ? datasetsRoute
      : licenceSourcesRoute(['datasets'])) as Href,
    dataset: (id: string) =>
      (account
        ? datasetRoute(id)
        : licenceSourcesRoute(['dataset', id])) as Href,
    portraits: (account
      ? portraitsRoute
      : licenceSourcesRoute(['portraits'])) as Href,
    photos: (account ? photosRoute : licenceSourcesRoute(['photos'])) as Href,
    fonts: (account ? fontsRoute : licenceSourcesRoute(['fonts'])) as Href,
  };
}
