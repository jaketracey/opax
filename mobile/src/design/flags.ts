import Constants from 'expo-constants';

// Read once per module load so every screen in a build sees the same choices.
const extra = Constants.expoConfig?.extra;
const overrides =
  extra?.variant === 'development' || extra?.variant === 'e2e'
    ? extra.designFlags
    : undefined;
const flag = (name: string): boolean =>
  typeof overrides?.[name] === 'boolean' ? overrides[name] : true;

export const designFlags = Object.freeze({
  categorySymbols: flag('categorySymbols'),
  searchTab: flag('searchTab'),
  talkInAsk: flag('talkInAsk'),
  groupedSurfaces: flag('groupedSurfaces'),
});
