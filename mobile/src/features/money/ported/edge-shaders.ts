// Extracted verbatim from portal/graph/map3d-engine.ts at 7b70d11f.
export const EDGE_VERTEX_SHADER = `
attribute vec4 flowColor;
attribute float flowT;
attribute float flowSeed;
attribute float flowKind;
varying vec4 vFlowColor;
varying float vFlowT;
varying float vFlowSeed;
varying float vFlowKind;
void main() {
  vFlowColor = flowColor;
  vFlowT = flowT;
  vFlowSeed = flowSeed;
  vFlowKind = flowKind;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const EDGE_FRAGMENT_SHADER = `
uniform float uPhase;
uniform float uReduced;
varying vec4 vFlowColor;
varying float vFlowT;
varying float vFlowSeed;
varying float vFlowKind;
void main() {
  float alpha = vFlowColor.a;
  if (vFlowKind < 0.5) {
    if (uReduced > 0.5) {
      alpha *= mix(0.68, 1.0, vFlowT);
    } else {
      float cycle = fract(vFlowT - uPhase - vFlowSeed);
      float distanceToDash = min(cycle, 1.0 - cycle);
      float dash = 1.0 - smoothstep(0.035, 0.09, distanceToDash);
      alpha *= 0.72 + 0.48 * dash;
    }
  } else {
    alpha *= uReduced > 0.5 ? 0.78 : 0.2;
  }
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(vFlowColor.rgb, min(alpha, 0.82));
}
`;
