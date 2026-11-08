export const moneyRoute = (
  party?: string | null,
  jurisdiction = 'federal',
  name?: string,
) => {
  const state = ['qld', 'vic', 'tas'].find(
    (key) => jurisdiction === key || jurisdiction === `au-${key}`,
  );
  const params = {
    ...(name ? { name } : {}),
    ...(party ? { focus: `party:${party}` } : {}),
    ...(state ? { jurisdiction: state } : {}),
  };
  return {
    pathname: '/money' as const,
    ...(Object.keys(params).length ? { params } : {}),
  };
};

export const moneyNodeRoute = (node: string) => ({
  pathname: '/money-node' as const,
  params: { node },
});
