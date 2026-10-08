import { useEffect, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { yearPictures } from '../../api/runtime';
import { localImageURI } from '../../api/image-policy';
import { yearPictureKey } from '../../api/year-picture-policy';
import { useReduceMotion } from '../../design/accessibility';
import { Button, Text } from '../../design/primitives';
import { colors, light } from '../../design/tokens';

/** Mounted only inside the opened photo disclosure; native Image reads a cache file. */
export function Picture({ file, ratio }: { file: string; ratio: number }) {
  const [retry, setRetry] = useState(0);
  const [saved, setSaved] = useState<{
    file: string;
    retry: number;
    localURI?: string;
    failed?: boolean;
    onDisplay?: (visible: boolean) => void;
  } | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [cleared, setCleared] = useState<string | null>(null);
  const [reveal] = useState(() => new Animated.Value(0));
  const reduced = useReduceMotion();
  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => yearPictures.get(yearPictureKey('/' + file), retry > 0))
      .then((value) => {
        const uri = localImageURI(value);
        let failed = false;
        if (active)
          setSaved({
            file,
            retry,
            localURI: uri,
            onDisplay: (visible) => {
              if (!visible) failed = true;
              if (!active) return;
              if (failed) {
                setSaved({ file, retry, failed: true });
                return;
              }
              const identity = `${file}/${retry}`;
              setShown(identity);
              if (reduced) setCleared(identity);
              else {
                reveal.setValue(0);
                Animated.timing(reveal, {
                  toValue: 1,
                  duration: 220,
                  easing: Easing.out(Easing.quad),
                  useNativeDriver: false,
                }).start(() => {
                  if (active) setCleared(identity);
                });
              }
            },
          });
      })
      .catch(() => {
        if (active) setSaved({ file, retry, failed: true });
      });
    return () => {
      active = false;
    };
  }, [file, retry, reduced, reveal]);
  const current = saved?.file === file && saved.retry === retry ? saved : null;
  let uri: string | undefined;
  try {
    if (current?.localURI) uri = localImageURI(current.localURI);
  } catch {
    /* Keep the soft fallback. */
  }
  const identity = `${file}/${retry}`;
  const ready = !!uri && shown === identity;
  const veil = ready
    ? cleared === identity
      ? null
      : reveal.interpolate({
          inputRange: [0, 1],
          outputRange: [light.sunken, `${light.sunken}00`],
        })
    : light.sunken;
  const key = yearPictureKey('/' + file);
  return (
    <>
      <View
        testID={`tm-photo-${key}${ready ? '-loaded' : '-placeholder'}`}
        accessibilityIgnoresInvertColors
        style={{
          width: '100%',
          aspectRatio: ratio,
          backgroundColor: colors.sunken,
        }}
      >
        {uri ? (
          <Image
            key={identity}
            source={{ uri: localImageURI(uri) }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
            accessible={false}
            accessibilityIgnoresInvertColors
            onLoad={() => current?.onDisplay?.(true)}
            onError={() => current?.onDisplay?.(false)}
          />
        ) : null}
        {veil ? (
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: veil }]}
          />
        ) : null}
      </View>
      {current?.failed ? (
        <>
          <Text wordSafe variant="metadata">
            This photograph is not available on this device.
          </Text>
          <Button label="Try again" onPress={() => setRetry((v) => v + 1)} />
        </>
      ) : null}
    </>
  );
}
