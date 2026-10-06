import * as THREE from 'three';
import { NativeMoneyScene } from '../src/features/money/NativeMoneyScene';
import { decodeMoneyGraph } from '../src/features/money/data';
import { pinned } from './pinned';
import type { ExpoWebGLRenderingContext } from 'expo-gl';

jest.mock('../src/features/money/native-context', () => ({
  nativeWebGL2Context: (gl: unknown) => gl,
}));
jest.mock('three', () => {
  const actual = jest.requireActual('three');
  return {
    ...actual,
    WebGLRenderer: jest.fn().mockImplementation(() => ({
      setSize: jest.fn(),
      setClearColor: jest.fn(),
      render: jest.fn(),
      dispose: jest.fn(),
      info: { memory: { geometries: 2, textures: 0 }, programs: [1, 2] },
    })),
  };
});
function create() {
  const gl = {
    drawingBufferWidth: 64,
    drawingBufferHeight: 64,
    isContextLost: () => false,
    finish: jest.fn(),
    endFrameEXP: jest.fn(),
    flushEXP: jest.fn(),
  };
  return {
    gl,
    scene: new NativeMoneyScene(
      gl as unknown as ExpoWebGLRenderingContext,
      decodeMoneyGraph(pinned('/graph/money.json')),
      360,
      350,
    ),
  };
}
test('a settled orbit reuses geometry and buffers; focus only updates appearance', () => {
  const { scene } = create();
  const render = jest.mocked(THREE.WebGLRenderer).mock.results.at(-1)!.value
    .render;
  for (let i = 0; i < 400; i++) scene.render(i * 34);
  expect(scene.diagnostics().layoutSettled).toBe(true);
  const root = render.mock.calls.at(-1)![0] as THREE.Scene;
  const nodes = root.children.find(
    (x) => x instanceof THREE.InstancedMesh,
  ) as THREE.InstancedMesh;
  const edges = root.children.find(
    (x) => x instanceof THREE.Mesh && !(x instanceof THREE.InstancedMesh),
  ) as THREE.Mesh;
  const matrix = nodes.instanceMatrix;
  const positions = edges.geometry.attributes
    .position! as THREE.BufferAttribute;
  const colours = edges.geometry.attributes.flowColor! as THREE.BufferAttribute;
  const matrixVersion = matrix.version;
  const positionVersion = positions.version;
  const colourVersion = colours.version;
  for (let i = 0; i < 100; i++) {
    scene.orbit(1, 0);
    scene.render(14000 + i * 34);
  }
  expect(nodes.instanceMatrix).toBe(matrix);
  expect(matrix.version).toBe(matrixVersion);
  expect(positions.version).toBe(positionVersion);
  expect(colours.version).toBe(colourVersion);
  scene.focus('party:Labor');
  scene.render(18000);
  expect(positions.version).toBe(positionVersion);
  expect(colours.version).toBe(colourVersion + 1);
  scene.dispose();
});
test('each submitted frame waits for completion; closing releases owned Three resources once', () => {
  const { gl, scene } = create();
  scene.render(0);
  scene.endFrame();
  expect(gl.finish.mock.invocationCallOrder[0]).toBeLessThan(
    gl.endFrameEXP.mock.invocationCallOrder[0]!,
  );
  expect(gl.endFrameEXP.mock.invocationCallOrder[0]).toBeLessThan(
    gl.flushEXP.mock.invocationCallOrder[0]!,
  );
  expect(scene.diagnostics().completedFrames).toBe(1);
  const renderer = jest.mocked(THREE.WebGLRenderer).mock.results.at(-1)!.value;
  const root = renderer.render.mock.calls[0][0] as THREE.Scene;
  const meshes = root.children.filter(
    (x) => x instanceof THREE.Mesh,
  ) as THREE.Mesh[];
  const disposals = meshes.flatMap((x) => [
    jest.spyOn(x.geometry, 'dispose'),
    jest.spyOn(x.material as THREE.Material, 'dispose'),
  ]);
  scene.dispose();
  scene.dispose();
  disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
  expect(renderer.dispose).toHaveBeenCalledTimes(1);
  expect(root.children).toHaveLength(0);
  expect(() => scene.render(1)).toThrow('released');
});
