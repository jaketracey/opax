export const sourceRoute = (params: Record<string, string> = {}) => ({
  pathname: '/source' as const,
  params,
});
export const machineNoteRoute = (params: Record<string, string> = {}) => ({
  pathname: '/machine-note' as const,
  params,
});
export const citationRoute = (params: Record<string, string> = {}) => ({
  pathname: '/citation' as const,
  params,
});
export const ruleRoute = (params: Record<string, string> = {}) => ({
  pathname: '/rule' as const,
  params,
});
export const licencesRoute = { pathname: '/licences' as const };
