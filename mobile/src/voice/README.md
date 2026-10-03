# Voice seam

This module is reserved for the later voice lane. The harness adds no microphone
purpose string, voice SDK, auth request or transport. The shared public catalog
client must remain read-only: voice and community will use separate scoped clients.

The fixture owns HTTP `upgrade` rejection in `scripts/fixture-server.ts`. The voice
lane can attach a fake relay there and explicit fixture-only auth/voice routes,
with silent synthetic PCM events. It must never proxy a real provider or production.
The Talk sheet navigation seam is described in `src/navigation/routes.ts`.
The voice lane must deliberately update `plugins/withNetworkPolicy.js` when it
adds the microphone purpose string; the harness currently strips that permission.
