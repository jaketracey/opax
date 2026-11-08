import type { Href } from 'expo-router';
export type NativeRoute = Exclude<Href, string>;
export type WebPathResolver = (path: string) => NativeRoute | null;
