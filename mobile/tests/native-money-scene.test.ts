import * as THREE from 'three';
import { NativeMoneyScene } from '../src/features/money/NativeMoneyScene';
import { decodeMoneyGraph } from '../src/features/money/data';
import { defaultMoneyFilters, moneyView } from '../src/features/money/view';
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
test('year, industry and layer changes keep buffers and geometry; inactive nodes cannot be picked', () => {
  const { scene } = create();
  const graph = decodeMoneyGraph(pinned('/graph/money.json'));
  const filters = defaultMoneyFilters(graph);
  const renderer = jest.mocked(THREE.WebGLRenderer).mock.results.at(-1)!.value;
  scene.render(0);
  const root = renderer.render.mock.calls[0][0] as THREE.Scene;
  const meshes = root.children.filter(
    (x) => x instanceof THREE.Mesh,
  ) as THREE.Mesh[];
  const geometries = meshes.map((x) => x.geometry);
  const attributes = meshes.map((x) => x.geometry.attributes);
  for (let i = 0; i < 100; i++) {
    scene.setView(
      moneyView(graph, {
        ...filters,
        from: 2024,
        to: 2024,
        industry: i % 2 ? 'unions' : null,
        grants: false,
        contracts: false,
      }),
    );
    scene.focus('party:Labor');
    scene.render(i * 34);
    expect(meshes.map((x) => x.geometry)).toEqual(geometries);
    meshes.forEach((mesh, index) =>
      expect(mesh.geometry.attributes).toBe(attributes[index]),
    );
  }
  scene.setView({ meta: graph.meta, nodes: [], edges: [] });
  scene.render(4000);
  expect(scene.pick(180, 175)).toBeNull();
  const nodes = meshes.find(
    (x) => x instanceof THREE.InstancedMesh,
  ) as THREE.InstancedMesh;
  const matrix = new THREE.Matrix4();
  nodes.getMatrixAt(0, matrix);
  expect(matrix.elements[0]).toBe(0);
  scene.dispose();
});
test('cleanup continues after the native context has already been destroyed', () => {
  const { scene } = create();
  const renderer = jest.mocked(THREE.WebGLRenderer).mock.results.at(-1)!.value;
  scene.render(0);
  const root = renderer.render.mock.calls[0][0] as THREE.Scene;
  const meshes = root.children.filter(
    (x) => x instanceof THREE.Mesh,
  ) as THREE.Mesh[];
  jest.spyOn(meshes[0]!.geometry, 'dispose').mockImplementation(() => {
    throw new Error('Context destroyed');
  });
  const edgeDispose = jest.spyOn(meshes[1]!.geometry, 'dispose');
  expect(() => scene.dispose()).not.toThrow();
  expect(edgeDispose).toHaveBeenCalledTimes(1);
  expect(renderer.dispose).toHaveBeenCalledTimes(1);
  expect(root.children).toHaveLength(0);
});

test('native pixel verification reuses a bounded buffer and rejects a blank surface', () => {
  const { gl, scene } = create();
  const renderer = jest.mocked(THREE.WebGLRenderer).mock.results.at(-1)!.value;
  renderer.render.mockImplementation(
    (_root: THREE.Scene, camera: THREE.Camera) => camera.updateMatrixWorld(),
  );
  const readPixels = jest.fn(
    (_x, _y, _width, _height, _format, _type, pixels: Uint8Array) =>
      pixels.fill(10),
  );
  const getError = jest.fn(() => 0);
  Object.assign(gl, { readPixels, getError, NO_ERROR: 0 });
  scene.resize(1080, 1920, 3);
  scene.render(0);
  expect(scene.verifyPixels()).toBeGreaterThanOrEqual(50);
  expect(scene.verifyPixels()).toBeGreaterThanOrEqual(50);
  const buffer = readPixels.mock.calls[0]![6];
  expect(buffer.byteLength).toBe(4096);
  for (const call of readPixels.mock.calls) {
    expect(call[2]).toBeLessThanOrEqual(32);
    expect(call[3]).toBeLessThanOrEqual(32);
    expect(call[6]).toBe(buffer);
  }
  readPixels.mockImplementation(
    (_x, _y, _width, _height, _format, _type, pixels) => pixels.fill(255),
  );
  expect(() => scene.verifyPixels()).toThrow('Graph drew no pixels');
  getError.mockReturnValue(1282);
  expect(() => scene.verifyPixels()).toThrow('GL error 1282');
  scene.dispose();
});
