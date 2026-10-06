import * as THREE from 'three';
import type { ExpoWebGLRenderingContext } from 'expo-gl';
import { clusterCentres3D, ForceSim3D } from './ported/force3d';
import { clusterColour, SURFACE } from './ported/palette';
import { radiusFor } from './ported/map-types';
import {
  EDGE_VERTEX_SHADER,
  EDGE_FRAGMENT_SHADER,
} from './ported/edge-shaders';
import type { MoneyGraph, MoneyNode } from './data';
import { nativeWebGL2Context } from './native-context';

export interface ProjectedLabel {
  id: string;
  label: string;
  x: number;
  y: number;
  ink: string;
}
/** Native adapter. No loaders, textures, DOM, URLs or runtime Three assets. */
export class NativeMoneyScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 2, 9000);
  private fog = new THREE.Fog(SURFACE, 600, 2400);
  private sim: ForceSim3D;
  private nodes: THREE.InstancedMesh;
  private edges: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private geometry = new THREE.SphereGeometry(1, 12, 8);
  private material = new THREE.MeshStandardMaterial({
    roughness: 0.8,
    metalness: 0,
  });
  private dummy = new THREE.Object3D();
  private centres: ReturnType<typeof clusterCentres3D>;
  private theta = 0.2;
  private phi = 0.95;
  private distance = 1400;
  private fit = 1400;
  private target = new THREE.Vector3();
  private selected: string | null = null;
  private owned = false;
  private reduced = false;
  private disposed = false;
  private width: number;
  private height: number;
  private byId: Map<string, MoneyNode>;
  private connected = new Set<string>();
  private colours: THREE.Color[];
  private edgeColours: THREE.Color[];
  private nodeColour = new THREE.Color();
  private paperColour = new THREE.Color(SURFACE);
  private direction = new THREE.Vector3();
  private positions: Float32Array;
  private others: Float32Array;
  private appearanceDirty = true;
  private layoutDirty = true;
  private completedFrames = 0;
  private flowColors: Float32Array;

  constructor(
    private gl: ExpoWebGLRenderingContext,
    private graph: MoneyGraph,
    width: number,
    height: number,
  ) {
    this.width = width;
    this.height = height;
    // Three needs only this canvas surface with an explicitly supplied context.
    // Native GLView owns the actual view and destroys its context on unmount.
    const canvas = {
      width: gl.drawingBufferWidth,
      height: gl.drawingBufferHeight,
      style: {},
      addEventListener() {},
      removeEventListener() {},
      setAttribute() {},
      getContext: () => gl,
    } as unknown as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      context: nativeWebGL2Context(gl),
      antialias: false,
      alpha: false,
    });
    this.renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight, false);
    this.renderer.setClearColor(SURFACE, 1);
    this.scene.background = new THREE.Color(SURFACE);
    this.scene.fog = this.fog;
    // Scene lighting and fog match map3d-engine.ts.
    const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 0.95);
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(0.55, 1, 0.4);
    const fill = new THREE.DirectionalLight(0xffffff, 0.3);
    fill.position.set(-0.6, -0.35, -0.7);
    this.scene.add(hemi, key, fill);
    this.byId = new Map(graph.nodes.map((n) => [n.id, n]));
    this.colours = graph.nodes.map(
      (n) => new THREE.Color(n.colour ?? clusterColour(n.group).colour),
    );
    this.edgeColours = graph.edges.map((e) => {
      const source = this.byId.get(e.source)!;
      return new THREE.Color(
        source.colour ?? clusterColour(source.group).colour,
      );
    });
    const groups = new Map<string, number>();
    graph.nodes.forEach((n) =>
      groups.set(n.group, (groups.get(n.group) ?? 0) + 1),
    );
    this.centres = clusterCentres3D(groups, width / height, 'parties');
    this.sim = new ForceSim3D({
      nodes: graph.nodes.map((n) => ({
        id: n.id,
        group: n.group,
        radius: radiusFor('resources', n.total / 10000),
      })),
      links: graph.edges,
      centres: this.centres,
      layout: 'grouped',
    });
    this.nodes = new THREE.InstancedMesh(
      this.geometry,
      this.material,
      graph.nodes.length,
    );
    this.nodes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.nodes.frustumCulled = false;
    this.scene.add(this.nodes);
    this.positions = new Float32Array(graph.edges.length * 6 * 3);
    this.others = new Float32Array(graph.edges.length * 6 * 3);
    const widthSide = new Float32Array(graph.edges.length * 6 * 2);
    this.flowColors = new Float32Array(graph.edges.length * 6 * 4);
    const flowT = new Float32Array(graph.edges.length * 6);
    const flowSeed = new Float32Array(graph.edges.length * 6);
    const flowKind = new Float32Array(graph.edges.length * 6);
    graph.edges.forEach((e, i) => {
      for (let v = 0; v < 6; v++) {
        flowT[i * 6 + v] = [0, 0, 1, 0, 1, 1][v]!;
        flowSeed[i * 6 + v] = (i * 0.618) % 1;
        flowKind[i * 6 + v] = e.grant ? 1 : 0;
        widthSide[(i * 6 + v) * 2] = Math.max(
          0.24,
          Math.min(1.9, 0.2 + 0.42 * Math.log10(1 + e.total / 10000)),
        );
        widthSide[(i * 6 + v) * 2 + 1] = v === 0 || v === 2 || v === 5 ? 1 : -1;
      }
    });
    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.positions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    edgeGeometry.setAttribute(
      'flowColor',
      new THREE.BufferAttribute(this.flowColors, 4).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    edgeGeometry.setAttribute(
      'flowOther',
      new THREE.BufferAttribute(this.others, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    edgeGeometry.setAttribute(
      'flowWidthSide',
      new THREE.BufferAttribute(widthSide, 2),
    );
    edgeGeometry.setAttribute('flowT', new THREE.BufferAttribute(flowT, 1));
    edgeGeometry.setAttribute(
      'flowSeed',
      new THREE.BufferAttribute(flowSeed, 1),
    );
    edgeGeometry.setAttribute(
      'flowKind',
      new THREE.BufferAttribute(flowKind, 1),
    );
    this.edges = new THREE.Mesh(
      edgeGeometry,
      new THREE.ShaderMaterial({
        // The web ribbon is camera-facing. Compute its side on the GPU instead
        // of copying all ribbon vertices through Expo's native queue each orbit.
        vertexShader: EDGE_VERTEX_SHADER.replace(
          'void main() {',
          `attribute vec3 flowOther;
attribute vec2 flowWidthSide;
uniform vec3 uView;
void main() {`,
        ).replace(
          'vec4(position, 1.0)',
          'vec4(position + normalize(cross(flowOther - position, uView)) * flowWidthSide.x * flowWidthSide.y, 1.0)',
        ),
        fragmentShader: EDGE_FRAGMENT_SHADER,
        uniforms: {
          uPhase: { value: 0 },
          uReduced: { value: 0 },
          uView: { value: this.direction },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.edges.frustumCulled = false;
    this.scene.add(this.edges);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const extent = Math.max(
      ...[...this.centres.values()].map((c) => Math.hypot(c.x, c.y, c.z) + c.r),
    );
    this.distance = this.fit =
      (extent /
        Math.sin(THREE.MathUtils.degToRad(20)) /
        Math.min(1, width / height)) *
      1.08;
    this.sim.tick(12);
  }
  setReducedMotion(value: boolean) {
    this.reduced = value;
    this.edges.material.uniforms.uReduced!.value = value ? 1 : 0;
  }
  orbit(dx: number, dy: number) {
    this.owned = true;
    this.theta -= dx * 0.006;
    this.phi = THREE.MathUtils.clamp(
      this.phi + dy * 0.006,
      0.35,
      Math.PI - 0.55,
    );
  }
  zoom(scale: number) {
    this.owned = true;
    this.distance = THREE.MathUtils.clamp(
      this.distance / scale,
      this.fit * 0.22,
      this.fit * 3.2,
    );
  }
  focus(id: string | null) {
    this.appearanceDirty = true;
    this.selected = id;
    this.connected.clear();
    if (id) {
      this.connected.add(id);
      this.graph.edges.forEach((e) => {
        if (e.source === id || e.target === id) {
          this.connected.add(e.source);
          this.connected.add(e.target);
        }
      });
      const node = this.sim.byId(id);
      if (node) {
        this.target.set(node.x, node.y, node.z);
        this.distance = Math.max(230, Math.min(560, this.fit * 0.4));
        this.owned = true;
      }
    } else {
      this.target.set(0, 0, 0);
      this.distance = this.fit;
    }
  }
  pick(x: number, y: number): string | null {
    let nearest = 24;
    let id: string | null = null;
    this.sim.nodes.forEach((n) => {
      const p = new THREE.Vector3(n.x, n.y, n.z).project(this.camera);
      const d = Math.hypot(
        ((p.x + 1) * this.width) / 2 - x,
        ((1 - p.y) * this.height) / 2 - y,
      );
      if (p.z < 1 && d < nearest) {
        nearest = d;
        id = n.id;
      }
    });
    return id;
  }
  labels(): ProjectedLabel[] {
    const labels: ProjectedLabel[] = [];
    const occupied: { x: number; y: number }[] = [];
    for (const [group, c] of this.centres) {
      if (group === 'parties') continue;
      const p = new THREE.Vector3(c.x, c.y + c.r, c.z).project(this.camera);
      const x = ((p.x + 1) * this.width) / 2;
      const y = ((1 - p.y) * this.height) / 2;
      if (
        p.z < 1 &&
        x > 45 &&
        x < this.width - 45 &&
        y > 12 &&
        y < this.height - 24 &&
        !occupied.some((o) => Math.abs(o.x - x) < 100 && Math.abs(o.y - y) < 30)
      ) {
        occupied.push({ x, y });
        labels.push({
          id: group,
          label: group,
          x,
          y,
          ink: clusterColour(group).ink,
        });
      }
    }
    if (this.selected) {
      const n = this.sim.byId(this.selected)!;
      const p = new THREE.Vector3(n.x, n.y, n.z).project(this.camera);
      labels.push({
        id: n.id,
        label: this.byId.get(n.id)!.label,
        x: ((p.x + 1) * this.width) / 2,
        y: ((1 - p.y) * this.height) / 2,
        ink: '#23271F',
      });
    }
    return labels;
  }
  render(now: number) {
    if (this.disposed) throw new Error('GL context has been released');
    if (this.gl.isContextLost()) throw new Error('GL context lost');
    if (this.sim.alpha() > 0.004) {
      this.sim.tick(1);
      this.layoutDirty = true;
    }
    if (!this.owned && !this.reduced)
      this.theta = 0.2 + Math.sin((now / 48000) * Math.PI * 2) * 0.22;
    this.camera.position.set(
      this.target.x + this.distance * Math.sin(this.phi) * Math.sin(this.theta),
      this.target.y + this.distance * Math.cos(this.phi),
      this.target.z + this.distance * Math.sin(this.phi) * Math.cos(this.theta),
    );
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
    this.fog.near = this.distance * 0.6;
    this.fog.far = this.distance * 2.2;
    if (this.layoutDirty || this.appearanceDirty) {
      this.sim.nodes.forEach((n, i) => {
        if (this.layoutDirty) {
          this.dummy.position.set(n.x, n.y, n.z);
          this.dummy.scale.setScalar(n.radius);
          this.dummy.updateMatrix();
          this.nodes.setMatrixAt(i, this.dummy.matrix);
        }
        if (this.appearanceDirty) {
          const colour = this.nodeColour.copy(this.colours[i]!);
          if (this.selected && !this.connected.has(n.id))
            colour.lerp(this.paperColour, 0.85);
          this.nodes.setColorAt(i, colour);
        }
      });
      if (this.layoutDirty) this.nodes.instanceMatrix.needsUpdate = true;
      if (this.appearanceDirty && this.nodes.instanceColor)
        this.nodes.instanceColor.needsUpdate = true;
      this.graph.edges.forEach((e, i) => {
        const from = this.sim.byId(e.source)!;
        const to = this.sim.byId(e.target)!;
        const alpha =
          this.selected &&
          e.source !== this.selected &&
          e.target !== this.selected
            ? 0.025
            : 0.22;
        const colour = this.edgeColours[i]!;
        for (let k = 0; k < 6; k++) {
          if (this.layoutDirty) {
            const endpoint = k === 2 || k === 4 || k === 5 ? to : from;
            const offset = (i * 6 + k) * 3;
            this.positions[offset] = endpoint.x;
            this.positions[offset + 1] = endpoint.y;
            this.positions[offset + 2] = endpoint.z;
            // Direction must be source -> target for both ribbon endpoints.
            this.others[offset] = endpoint.x + to.x - from.x;
            this.others[offset + 1] = endpoint.y + to.y - from.y;
            this.others[offset + 2] = endpoint.z + to.z - from.z;
          }
          if (this.appearanceDirty) {
            const offset = (i * 6 + k) * 4;
            this.flowColors[offset] = colour.r;
            this.flowColors[offset + 1] = colour.g;
            this.flowColors[offset + 2] = colour.b;
            this.flowColors[offset + 3] = alpha;
          }
        }
      });
      if (this.layoutDirty) {
        this.edges.geometry.attributes.position!.needsUpdate = true;
        this.edges.geometry.attributes.flowOther!.needsUpdate = true;
      }
      if (this.appearanceDirty)
        this.edges.geometry.attributes.flowColor!.needsUpdate = true;
      this.layoutDirty = this.appearanceDirty = false;
    }
    this.camera.getWorldDirection(this.direction);
    this.edges.material.uniforms.uPhase!.value = (now / 7000) % 1;
    this.renderer.render(this.scene, this.camera);
  }
  /** Native GPU readback; rejects a blank clear surface or a GL error. Once per run. */
  verifyPixels(): number {
    const pixels = new Uint8Array(
      this.gl.drawingBufferWidth * this.gl.drawingBufferHeight * 4,
    );
    this.gl.readPixels(
      0,
      0,
      this.gl.drawingBufferWidth,
      this.gl.drawingBufferHeight,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      pixels,
    );
    const error = this.gl.getError();
    if (error !== this.gl.NO_ERROR) throw new Error(`GL error ${error}`);
    let ink = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i]! < 230 || pixels[i + 1]! < 230 || pixels[i + 2]! < 225)
        ink++;
    if (ink < 50) throw new Error(`Graph drew no pixels (${ink})`);
    return ink;
  }
  endFrame() {
    // endFrameEXP schedules work; it does not provide backpressure. Wait for
    // this frame's GPU work and native batch before allowing another frame.
    this.gl.finish();
    this.gl.endFrameEXP();
    this.gl.flushEXP();
    this.completedFrames++;
  }
  diagnostics() {
    return {
      completedFrames: this.completedFrames,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      programs: this.renderer.info.programs?.length ?? 0,
      layoutSettled: this.sim.alpha() <= 0.004,
    };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.geometry.dispose();
    this.material.dispose();
    this.edges.geometry.dispose();
    this.edges.material.dispose();
    this.nodes.dispose();
    this.scene.clear();
    this.renderer.dispose();
  }
}
