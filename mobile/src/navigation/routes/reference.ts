export const aboutRoute = { pathname: '/account/about' as const };
export const coverageRoute = { pathname: '/account/coverage' as const };
export const methodsRoute = { pathname: '/account/methods' as const };
export const sourcesRoute = { pathname: '/account/sources' as const };
export const datasetsRoute = { pathname: '/account/sources/datasets' as const };
export const datasetRoute = (id: string, name?: string) => ({
  pathname: '/account/sources/dataset/[id]' as const,
  params: { id, ...(name ? { name } : {}) },
});
export const portraitsRoute = {
  pathname: '/account/sources/portraits' as const,
};
export const photosRoute = { pathname: '/account/sources/photos' as const };
export const fontsRoute = { pathname: '/account/sources/fonts' as const };
/** The source sheet's licence row: a dataset as the Licence sheet's root. */
export const licenceRoute = (id: string, name?: string) => ({
  pathname: '/licence/[id]' as const,
  params: { id, ...(name ? { name } : {}) },
});
/** Sources and licences pushed inside the Licence sheet. */
export const licenceHubRoute = { pathname: '/licence/sources' as const };
export const licenceSourcesRoute = (path: string[], name?: string) => ({
  pathname: '/licence/sources/[...path]' as const,
  params: { path, ...(name ? { name } : {}) },
});
