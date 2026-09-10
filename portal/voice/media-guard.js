// Scoped to SDK capture calls at build time: never replaces a browser API.
export async function captureAudio(constraints, signal) {
  signal?.throwIfAborted();
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const stop = () => stream.getTracks().forEach(track => track.stop());
  if (signal?.aborted) {
    stop();
    signal.throwIfAborted();
  }
  signal?.addEventListener('abort', stop, { once: true });
  return stream;
}
