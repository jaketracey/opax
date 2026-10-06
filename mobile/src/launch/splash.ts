import * as SplashScreen from 'expo-splash-screen';
import { handoff } from './timing';

// Keep the native splash until the handoff has drawn the same image on top of
// it (src/launch/LaunchHandoff.tsx), so the swap has no seam. Imported once by
// the root layout, before anything renders.
let hidden = false;
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export function hideNativeSplash() {
  if (hidden) return;
  hidden = true;
  SplashScreen.hide();
}

// If the handoff never draws (fonts or the image fail), never leave anyone
// on the splash.
setTimeout(hideNativeSplash, handoff.splashFailsafe);
