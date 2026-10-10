import * as THREE from 'three';
import type { ExpoWebGLRenderingContext } from 'expo-gl';
import { clusterCentres3D, ForceSim3D } from './ported/force3d';
import { clusterColour, nodeColour, SURFACE } from './ported/palette';
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
  /** An industry cluster, a party beside its node, or the selected node. */
  kind: 'group' | 'party' | 'focus';
  /** A cluster's ink; parties and the selection take the ink role. */
  ink?: string;
}
/** How many parties are named at once: the largest in view. */
export const PARTY_LABELS = 4;
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
  private cameraDirty = true;
  private disposed = false;
  private width: number;
  private height: number;
  private framebufferWidth: number;
  private framebufferHeight: number;
  private byId: Map<string, MoneyNode>;
  private connected = new Set<string>();
  private colours: THREE.Color[];
  private edgeColours: THREE.Color[];
  private nodeColour = new THREE.Color();
  private paperColour = new THREE.Color(SURFACE);
  private direction = new THREE.Vector3();
  private projected = new THREE.Vector3();
  private active: Set<string>;
  private activeEdges: Uint8Array;
  private visibleGroups: Set<string>;
  private widthSide: Float32Array;
  private positions: Float32Array;
  private others: Float32Array;
  private appearanceDirty = true;
  private layoutDirty = true;
  private completedFrames = 0;
  private flowColors: Float32Array;
  private probePixels = new Uint8Array(32 * 32 * 4);

  constructor(
    private gl: ExpoWebGLRenderingContext,
    private graph: MoneyGraph,
    width: number,
    height: number,
  ) {
    this.cameraDirty = true;
    this.width = width;
    this.height = height;
    this.framebufferWidth = gl.drawingBufferWidth;
    this.framebufferHeight = gl.drawingBufferHeight;
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
    this.active = new Set(this.byId.keys());
    this.activeEdges = new Uint8Array(graph.edges.length).fill(1);
    this.visibleGroups = new Set(graph.nodes.map((n) => this.group(n)));
    this.colours = graph.nodes.map((n) => new THREE.Color(nodeColour(n)));
    this.edgeColours = graph.edges.map(
      (e) => new THREE.Color(nodeColour(this.byId.get(e.source)!)),
    );
    const groups = new Map<string, number>();
    graph.nodes.forEach((n) =>
      groups.set(this.group(n), (groups.get(this.group(n)) ?? 0) + 1),
    );
    this.centres = clusterCentres3D(groups, width / height, 'parties');
    this.sim = new ForceSim3D({
      nodes: graph.nodes.map((n) => ({
        id: n.id,
        group: this.group(n),
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
    const widthSide = (this.widthSide = new Float32Array(
      graph.edges.length * 6 * 2,
    ));
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
  private group(node: MoneyNode) {
    return node.kind === 'grantor' ? 'public money' : node.group;
  }
  /** Filters reuse this context, simulation, geometry and every upload buffer. */
  setView(view: MoneyGraph) {
    this.active = new Set(view.nodes.map((n) => n.id));
    this.visibleGroups = new Set(view.nodes.map((n) => this.group(n)));
    view.nodes.forEach((n) => this.byId.set(n.id, n));
    const byPair = new Map(
      view.edges.map((e) => [`${e.source}\0${e.target}`, e]),
    );
    const degrees = new Map<string, number>();
    view.edges.forEach((e) => {
      degrees.set(e.source, (degrees.get(e.source) ?? 0) + 1);
      degrees.set(e.target, (degrees.get(e.target) ?? 0) + 1);
    });
    this.sim.nodes.forEach((n) => {
      n.radius = radiusFor('links', degrees.get(n.id) ?? 0);
    });
    this.graph.edges.forEach((e, i) => {
      const shown = byPair.get(`${e.source}\0${e.target}`);
      this.activeEdges[i] = shown ? 1 : 0;
      const width = shown
        ? Math.max(
            0.24,
            Math.min(1.9, 0.2 + 0.42 * Math.log10(1 + shown.total / 10000)),
          )
        : 0;
      for (let k = 0; k < 6; k++) this.widthSide[(i * 6 + k) * 2] = width;
    });
    this.edges.geometry.attributes.flowWidthSide!.needsUpdate = true;
    this.layoutDirty = this.appearanceDirty = true;
    if (this.selected && !this.active.has(this.selected)) this.focus(null);
    else this.updateConnected();
  }
  resize(width: number, height: number, pixelRatio: number) {
    if (width <= 0 || height <= 0) return;
    if (width === this.width && height === this.height) return;
    this.cameraDirty = true;
    this.width = width;
    this.height = height;
    this.framebufferWidth = Math.round(width * pixelRatio);
    this.framebufferHeight = Math.round(height * pixelRatio);
    this.renderer.setSize(this.framebufferWidth, this.framebufferHeight, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
  setReducedMotion(value: boolean) {
    if (this.reduced !== value) this.cameraDirty = true;
    this.reduced = value;
    this.edges.material.uniforms.uReduced!.value = value ? 1 : 0;
  }
  orbit(dx: number, dy: number) {
    this.cameraDirty = true;
    this.owned = true;
    this.theta -= dx * 0.006;
    this.phi = THREE.MathUtils.clamp(
      this.phi + dy * 0.006,
      0.35,
      Math.PI - 0.55,
    );
  }
  zoom(scale: number) {
    this.cameraDirty = true;
    this.owned = true;
    this.distance = THREE.MathUtils.clamp(
      this.distance / scale,
      this.fit * 0.22,
      this.fit * 3.2,
    );
  }
  focus(id: string | null) {
    this.cameraDirty = true;
    this.appearanceDirty = true;
    id = id && this.active.has(id) ? id : null;
    this.selected = id;
    this.updateConnected();
    if (id) {
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
  private updateConnected() {
    this.connected.clear();
    const id = this.selected;
    if (id) {
      this.connected.add(id);
      this.graph.edges.forEach((e, i) => {
        if (this.activeEdges[i] && (e.source === id || e.target === id)) {
          this.connected.add(e.source);
          this.connected.add(e.target);
        }
      });
    }
  }
  pick(x: number, y: number): string | null {
    let nearest = 24;
    let id: string | null = null;
    this.sim.nodes.forEach((n) => {
      if (!this.active.has(n.id)) return;
      const p = this.projected.set(n.x, n.y, n.z).project(this.camera);
      const d = Math.hypot(
        ((p.x + 1) * this.width) / 2 - x,
        ((1 - p.y) * this.height) / 2 - y,
      );
      if (p.z > -1 && p.z < 1 && d < nearest) {
        nearest = d;
        id = n.id;
      }
    });
    return id;
  }
  labels(): ProjectedLabel[] {
    const labels: ProjectedLabel[] = [];
    const occupied: { x: number; y: number }[] = [];
    const place = (x: number, y: number, z: number) => {
      const p = this.projected.set(x, y, z).project(this.camera);
      const px = ((p.x + 1) * this.width) / 2;
      const py = ((1 - p.y) * this.height) / 2;
      if (
        p.z < 1 &&
        px > 45 &&
        px < this.width - 45 &&
        py > 12 &&
        py < this.height - 24 &&
        !occupied.some(
          (o) => Math.abs(o.x - px) < 100 && Math.abs(o.y - py) < 30,
        )
      ) {
        occupied.push({ x: px, y: py });
        return { x: px, y: py };
      }
      return null;
    };
    // Parties are drawn in one neutral grey; the largest in view are named
    // beside their node first (the flows end there), so no party is told
    // apart by colour alone. Industry clusters take the room left.
    const parties = this.graph.nodes
      .filter(
        (n) =>
          n.kind === 'party' && this.active.has(n.id) && n.id !== this.selected,
      )
      .sort((a, b) => b.total - a.total)
      .slice(0, PARTY_LABELS);
    for (const party of parties) {
      const n = this.sim.byId(party.id);
      if (!n) continue;
      const at = place(n.x, n.y, n.z);
      if (at)
        labels.push({ id: party.id, label: party.label, ...at, kind: 'party' });
    }
    for (const [group, c] of this.centres) {
      if (group === 'parties' || !this.visibleGroups.has(group)) continue;
      const at = place(c.x, c.y + c.r, c.z);
      if (at)
        labels.push({
          id: group,
          label: group,
          ...at,
          kind: 'group',
          ink: clusterColour(group).ink,
        });
    }
    if (this.selected) {
      const n = this.sim.byId(this.selected)!;
      const p = this.projected.set(n.x, n.y, n.z).project(this.camera);
      labels.push({
        id: n.id,
        label: this.byId.get(n.id)!.label,
        x: ((p.x + 1) * this.width) / 2,
        y: ((1 - p.y) * this.height) / 2,
        kind: 'focus',
      });
    }
    return labels;
  }
  render(now: number) {
    if (this.disposed) throw new Error('GL context has been released');
    if (this.gl.isContextLost()) throw new Error('GL context lost');
    if (
      this.reduced &&
      this.sim.alpha() <= 0.004 &&
      !this.layoutDirty &&
      !this.appearanceDirty &&
      !this.cameraDirty
    )
      return false;
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
          this.dummy.scale.setScalar(this.active.has(n.id) ? n.radius : 0);
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
        const alpha = !this.activeEdges[i]
          ? 0
          : this.selected &&
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
    this.cameraDirty = false;
    return true;
  }
  /** Read native pixels at visible nodes without allocating two full framebuffers. */
  verifyPixels(): number {
    let ink = 0;
    let patches = 0;
    const width = Math.min(32, this.framebufferWidth);
    const height = Math.min(32, this.framebufferHeight);
    if (width <= 0 || height <= 0) throw new Error('GL surface unavailable');
    for (const node of this.sim.nodes) {
      if (!this.active.has(node.id)) continue;
      const p = this.projected.set(node.x, node.y, node.z).project(this.camera);
      if (Math.abs(p.x) > 1 || Math.abs(p.y) > 1 || Math.abs(p.z) > 1) continue;
      const x = Math.max(
        0,
        Math.min(
          this.framebufferWidth - width,
          Math.round(((p.x + 1) * this.framebufferWidth) / 2 - width / 2),
        ),
      );
      const y = Math.max(
        0,
        Math.min(
          this.framebufferHeight - height,
          Math.round(((p.y + 1) * this.framebufferHeight) / 2 - height / 2),
        ),
      );
      this.gl.readPixels(
        x,
        y,
        width,
        height,
        this.gl.RGBA,
        this.gl.UNSIGNED_BYTE,
        this.probePixels,
      );
      const error = this.gl.getError();
      if (error !== this.gl.NO_ERROR) throw new Error(`GL error ${error}`);
      for (let i = 0; i < width * height * 4; i += 4)
        if (
          this.probePixels[i]! < 230 ||
          this.probePixels[i + 1]! < 230 ||
          this.probePixels[i + 2]! < 225
        )
          ink++;
      if (ink >= 50 || ++patches >= 16) break;
    }
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
    // A lost native context may already reject GL deletes. Continue releasing
    // every JS resource; GLView's native owner destroys the context on unmount.
    for (const release of [
      () => this.geometry.dispose(),
      () => this.material.dispose(),
      () => this.edges.geometry.dispose(),
      () => this.edges.material.dispose(),
      () => this.nodes.dispose(),
      () => this.renderer.dispose(),
    ]) {
      try {
        release();
      } catch {
        /* Native context has already gone. */
      }
    }
    this.scene.clear();
    this.byId.clear();
    this.connected.clear();
    this.active.clear();
    this.visibleGroups.clear();
  }
}
