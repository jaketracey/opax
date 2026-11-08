import { useEffect, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { yearPictures } from '../../api/runtime';
import { localImageURI } from '../../api/image-policy';
import { yearPictureKey } from '../../api/year-picture-policy';
import { useReduceMotion } from '../../design/accessibility';
import { Button, Icon, Text } from '../../design/primitives';
import { colors, radii, rhythm } from '../../design/tokens';
import { symbols } from '../../design/symbols';

/**
 * One year photograph in its frame. Native Image reads only a device cache
 * file, fetched when the frame mounts. The frame keeps its shape from
 * placeholder to photo; a failure draws inside it, with Try again.
 */
export function Picture({
  file,
  ratio = 4 / 3,
  ground = 'sunken',
  rounded = true,
}: {
  file: string;
  /** The frame's width over height; archive photographs are never cropped. */
  ratio?: number;
  /** The photo viewer draws on black. */
  ground?: 'sunken' | 'black';
  rounded?: boolean;
}) {
  const [retry, setRetry] = useState(0);
  const [saved, setSaved] = useState<{
    file: string;
    retry: number;
    localURI?: string;
    failed?: boolean;
    onDisplay?: (visible: boolean) => void;
  } | null>(null);
  const [shown, setShown] = useState<string | null>(null);
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
              setShown(`${file}/${retry}`);
              reveal.setValue(reduced ? 1 : 0);
              if (!reduced)
                Animated.timing(reveal, {
                  toValue: 1,
                  duration: 150,
                  easing: Easing.out(Easing.quad),
                  useNativeDriver: true,
                }).start();
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
    /* Keep the placeholder. */
  }
  const identity = `${file}/${retry}`;
  const ready = !!uri && shown === identity;
  const key = yearPictureKey('/' + file);
  return (
    <View
      testID={`tm-photo-${key}${ready ? '-loaded' : '-placeholder'}`}
      accessibilityIgnoresInvertColors
      style={{
        width: '100%',
        aspectRatio: ratio,
        backgroundColor: ground === 'black' ? '#000' : colors.sunken,
        borderRadius: rounded ? radii.thumb : 0,
        borderCurve: 'continuous',
        overflow: 'hidden',
      }}
    >
      {uri && !current?.failed ? (
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: ready ? reveal : 0 }]}
        >
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
        </Animated.View>
      ) : null}
      {current?.failed ? (
        <View style={styles.failed}>
          <Icon name={symbols.error} size={28} tone="inkSoft" />
          <Text
            wordSafe
            variant="secondary"
            tone="inkSoft"
            style={styles.center}
          >
            {"Photo couldn't be loaded."}
          </Text>
          <Button
            label="Try again"
            variant="plain"
            onPress={() => setRetry((v) => v + 1)}
          />
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  failed: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: rhythm.tight,
    padding: rhythm.block,
  },
  center: { textAlign: 'center' },
});
