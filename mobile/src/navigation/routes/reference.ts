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
export const licenceRoute = (id: string, name?: string) => ({
  pathname: '/licence/[id]' as const,
  params: { id, ...(name ? { name } : {}) },
});
export const licenceSourcesRoute = (path: string[], name?: string) => ({
  pathname: '/licence/sources/[...path]' as const,
  params: { path, ...(name ? { name } : {}) },
});
