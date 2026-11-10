import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Picture } from './Picture';
import type { YearPicture } from './pictures';
import {
  photoFit,
  photoFocalOffset,
  photoOffset,
  photoScale,
} from './photo-zoom';

/** Android ScrollView has no zoomScale: all continuous gesture work stays on UI. */
export function AndroidPhoto({
  photo,
  width,
  height,
  reduced,
  onPage,
  onClose,
  onToggleChrome,
}: {
  photo: YearPicture;
  width: number;
  height: number;
  reduced: boolean;
  onPage: (direction: number) => void;
  onClose: () => void;
  onToggleChrome: () => void;
}) {
  const fit = photoFit(width, height, photo.width / photo.height);
  const scale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);
  // A second finger cancels navigation for the whole pan, even after it lifts.
  const multiple = useSharedValue(false);
  const [zoom, setZoom] = useState(1);
  const duration = reduced ? 0 : 150;
  const zoomTo = (next: number) => {
    scale.value = withTiming(next, { duration });
    x.value = withTiming(0, { duration });
    y.value = withTiming(0, { duration });
    setZoom(next);
  };
  const pinch = Gesture.Pinch()
    .onStart((event) => {
      multiple.value = true;
      startScale.value = scale.value;
      startX.value = x.value;
      startY.value = y.value;
      focalX.value = event.focalX - width / 2;
      focalY.value = event.focalY - height / 2;
    })
    .onUpdate((event) => {
      const next = photoScale(startScale.value * event.scale);
      x.value = photoOffset(
        photoFocalOffset(startX.value, focalX.value, startScale.value, next) +
          event.focalX -
          width / 2 -
          focalX.value,
        next,
        fit.width,
        width,
      );
      y.value = photoOffset(
        photoFocalOffset(startY.value, focalY.value, startScale.value, next) +
          event.focalY -
          height / 2 -
          focalY.value,
        next,
        fit.height,
        height,
      );
      scale.value = next;
    })
    .onFinalize(() => {
      runOnJS(setZoom)(scale.value);
    });
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const pan = Gesture.Pan()
    .minDistance(12)
    .onBegin(() => {
      multiple.value = false;
      panX.value = x.value;
      panY.value = y.value;
    })
    .onTouchesDown((event) => {
      if (event.numberOfTouches > 1) multiple.value = true;
    })
    .onUpdate((event) => {
      if (multiple.value) return;
      if (scale.value > 1.01) {
        x.value = photoOffset(
          panX.value + event.translationX,
          scale.value,
          fit.width,
          width,
        );
        y.value = photoOffset(
          panY.value + event.translationY,
          scale.value,
          fit.height,
          height,
        );
      } else if (
        Math.abs(event.translationX) >
        Math.abs(event.translationY) * 1.5
      ) {
        x.value = event.translationX;
        y.value = 0;
      } else if (!reduced && event.translationY > 0) {
        x.value = 0;
        y.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (multiple.value || scale.value > 1.01) return;
      if (
        Math.abs(event.translationX) > 50 &&
        Math.abs(event.translationX) > Math.abs(event.translationY) * 1.5
      )
        runOnJS(onPage)(event.translationX < 0 ? 1 : -1);
      else if (
        !reduced &&
        event.translationY > 80 &&
        event.translationY > Math.abs(event.translationX) * 1.5
      )
        runOnJS(onClose)();
    })
    .onFinalize(() => {
      if (scale.value <= 1.01) {
        x.value = withTiming(0, { duration });
        y.value = withTiming(0, { duration });
      }
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((event, success) => {
      if (!success) return;
      const next = scale.value > 1.01 ? 1 : 3;
      x.value = withTiming(
        photoOffset(
          photoFocalOffset(x.value, event.x - width / 2, scale.value, next),
          next,
          fit.width,
          width,
        ),
        { duration },
      );
      y.value = withTiming(
        photoOffset(
          photoFocalOffset(y.value, event.y - height / 2, scale.value, next),
          next,
          fit.height,
          height,
        ),
        { duration },
      );
      scale.value = withTiming(next, { duration });
      runOnJS(setZoom)(next);
    });
  const tap = Gesture.Tap().onEnd((_event, success) => {
    if (success) runOnJS(onToggleChrome)();
  });
  const transform = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { scale: scale.value },
    ],
  }));
  return (
    <GestureDetector
      gesture={Gesture.Race(
        Gesture.Simultaneous(pinch, pan),
        Gesture.Exclusive(doubleTap, tap),
      )}
    >
      <View style={[styles.viewport, { width, height }]} accessible={false}>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={photo.caption}
          accessibilityValue={{ text: `Zoom ${Math.round(zoom * 100)}%` }}
          accessibilityActions={[
            { name: 'zoomIn', label: 'Zoom in' },
            { name: 'zoomOut', label: 'Zoom out' },
            { name: 'previous', label: 'Previous photograph' },
            { name: 'next', label: 'Next photograph' },
          ]}
          onAccessibilityAction={({ nativeEvent }) => {
            switch (nativeEvent.actionName) {
              case 'zoomIn':
                zoomTo(3);
                break;
              case 'zoomOut':
                zoomTo(1);
                break;
              case 'previous':
                onPage(-1);
                break;
              case 'next':
                onPage(1);
                break;
            }
          }}
          testID="photo-viewer-image"
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        />

        <Animated.View style={[fit, transform]}>
          <Picture
            file={photo.file}
            ratio={photo.width / photo.height}
            ground="black"
            rounded={false}
            failure="inline"
          />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  viewport: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
