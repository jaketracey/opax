export const todayRoute = (name?: string) => ({
  pathname: '/' as const,
  params: { ...(name ? { name } : {}) },
});
export const todayFollowsRoute = {
  pathname: '/(tabs)/(today)/follows' as const,
};
