/** Geometry shared by Android's UI-thread photo gestures and their checks. */
export function photoFit(width: number, height: number, ratio: number) {
  return width / height > ratio
    ? { width: height * ratio, height }
    : { width, height: width / ratio };
}

export function photoScale(value: number) {
  'worklet';
  return Math.max(1, Math.min(3, value));
}

/** Keep the photograph over the viewport; a contained axis stays centred. */
export function photoOffset(
  value: number,
  scale: number,
  image: number,
  viewport: number,
) {
  'worklet';
  const limit = Math.max(0, (image * scale - viewport) / 2);
  return Math.max(-limit, Math.min(limit, value));
}

/** Keep the focal point under the fingers as the scale changes. */
export function photoFocalOffset(
  offset: number,
  focal: number,
  from: number,
  to: number,
) {
  'worklet';
  return focal - (focal - offset) * (to / from);
}
