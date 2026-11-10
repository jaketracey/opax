import {
  PaintStyle,
  Skia,
  StrokeCap,
  type SkColor,
  type SkPicture,
} from '@shopify/react-native-skia';
import type { Bounds } from './camera';
import type { Painter } from './scene';

/**
 * Records a layer into a Skia picture: every draw call is captured once, on
 * JS, and replayed by the GPU each frame under the camera's transform.
 */
export function recordPicture(
  bounds: Bounds,
  paint: (painter: Painter) => void,
): SkPicture {
  const recorder = Skia.PictureRecorder();
  const margin = 64;
  const canvas = recorder.beginRecording(
    Skia.XYWHRect(
      bounds.minX - margin,
      bounds.minY - margin,
      bounds.maxX - bounds.minX + margin * 2,
      bounds.maxY - bounds.minY + margin * 2,
    ),
  );
  const colours = new Map<string, SkColor>();
  const colour = (hex: string) => {
    let c = colours.get(hex);
    if (!c) {
      c = Skia.Color(hex);
      colours.set(hex, c);
    }
    return c;
  };
  const fill = Skia.Paint();
  fill.setAntiAlias(true);
  const stroke = Skia.Paint();
  stroke.setAntiAlias(true);
  stroke.setStyle(PaintStyle.Stroke);
  stroke.setStrokeCap(StrokeCap.Round);
  paint({
    circle(x, y, r, hex, alpha) {
      fill.setColor(colour(hex));
      fill.setAlphaf(alpha);
      canvas.drawCircle(x, y, r, fill);
    },
    ring(x, y, r, width, hex, alpha) {
      stroke.setStrokeWidth(width);
      stroke.setColor(colour(hex));
      stroke.setAlphaf(alpha);
      canvas.drawCircle(x, y, r, stroke);
    },
    line(x1, y1, x2, y2, width, hex, alpha) {
      stroke.setStrokeWidth(width);
      stroke.setColor(colour(hex));
      stroke.setAlphaf(alpha);
      canvas.drawLine(x1, y1, x2, y2, stroke);
    },
  });
  return recorder.finishRecordingAsPicture();
}
