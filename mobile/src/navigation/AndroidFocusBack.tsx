import { useCallback } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect } from 'expo-router';

/** Mount only on Android: local chooser dismissal must not hijack other tabs. */
export function AndroidFocusBack({
  active,
  onBack,
}: {
  active: boolean;
  onBack: () => void;
}) {
  useFocusEffect(
    useCallback(() => {
      if (!active) return;
      const back = BackHandler.addEventListener('hardwareBackPress', () => {
        onBack();
        return true;
      });
      return () => back.remove();
    }, [active, onBack]),
  );
  return null;
}
