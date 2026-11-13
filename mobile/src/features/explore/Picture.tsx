import { useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { localImageURI } from '../../api/image-policy';
import { yearPictures } from '../../api/runtime';
import { yearPictureKey } from '../../api/year-picture-policy';
import { useReduceMotion } from '../../design/accessibility';
import { InlineError } from '../../design/primitives';
import { HeightReveal } from '../../design/reveal';
import { Text } from '../../design/text';
import { colors, radii, rhythm } from '../../design/tokens';

/** A photo’s black ground in every scheme. */
export const PHOTO_BLACK = colors.photoGround;

/**
 * One year photograph in its frame. Native Image reads only a device cache
 * file, fetched when the frame mounts. The frame keeps its shape from
 * placeholder to photo. Cards fail quietly; the full viewer offers Try again.
 */
export function Picture({
  file,
  ratio = 4 / 3,
  ground = 'sunken',
  rounded = true,
  resizeMode = 'contain',
  failure = 'quiet',
}: {
  file: string;
  /** The frame's width over height. */
  ratio?: number;
  /** The photo viewer draws on black. */
  ground?: 'sunken' | 'black';
  rounded?: boolean;
  /** Cover previews use the native centred crop; viewers keep the whole photo. */
  resizeMode?: 'contain' | 'cover';
  /** Collapse an unavailable preview without leaving an empty photo frame. */
  failure?: 'quiet' | 'inline' | 'collapse';
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
    const fail = () => setSaved({ file, retry, failed: true });
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
                fail();
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
        if (active) fail();
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
  const frame = (
    <View
      testID={`tm-photo-${key}${ready ? '-loaded' : '-placeholder'}`}
      accessibilityIgnoresInvertColors
      style={{
        width: '100%',
        aspectRatio: ratio,
        backgroundColor: ground === 'black' ? PHOTO_BLACK : colors.sunken,
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
            resizeMode={resizeMode}
            accessible={false}
            accessibilityIgnoresInvertColors
            onLoad={() => current?.onDisplay?.(true)}
            onError={() => current?.onDisplay?.(false)}
          />
        </Animated.View>
      ) : null}
      {current?.failed && failure === 'inline' ? (
        <View style={styles.failed}>
          {Platform.OS === 'android' && ground === 'black' ? (
            <>
              <Text wordSafe style={styles.onBlack}>
                {"Photo couldn't be loaded."}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Try again"
                onPress={() => setRetry((v) => v + 1)}
                style={styles.retry}
                android_ripple={{ color: colors.onBand }}
              >
                <Text style={styles.onBlack}>Try again</Text>
              </Pressable>
            </>
          ) : (
            <InlineError
              subject="Photo"
              message="Photo couldn't be loaded."
              onRetry={() => setRetry((v) => v + 1)}
            />
          )}
        </View>
      ) : null}
    </View>
  );
  if (failure !== 'collapse') return frame;
  // A collapsing preview gives back its 4:3 frame smoothly, so the content
  // below slides up instead of snapping (at once with Reduce Motion).
  return (
    <HeightReveal reduceMotion={reduced}>
      {current?.failed ? null : frame}
    </HeightReveal>
  );
}
const styles = StyleSheet.create({
  onBlack: { color: colors.onBand, textAlign: 'center' },
  retry: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: 'center',
    paddingHorizontal: rhythm.block,
  },
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
