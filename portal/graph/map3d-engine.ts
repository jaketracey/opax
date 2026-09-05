import * as THREE from 'three'
import {
  formatMoney,
  type GroupStyle,
  type Insets,
  type MapEdge,
  type MapLayout,
  type MapMeasure,
  type MapNode,
  radiusFor,
  shortLabel,
} from './map-types.ts'
import { type Centre3D, clusterCentres3D, ForceSim3D, type SimNode3D } from './force3d.ts'
import { ACCENT, CLUSTER_COLOURS, SURFACE } from './palette.ts'

// ---------------------------------------------------------------------------
// The money map's 3D engine - ported from corpuskit's map3d-engine.ts.
//
// Everything imperative lives here - the three.js scene, the camera, the
// gestures, the force simulation and the DOM label overlay - so the vanilla
// adapter above it (mount.ts) stays a thin shell that pushes data in and
// receives selections back.
//
// The visual grammar, carried into depth:
//
//   position   the industry territory a donor belongs to, and inside it, who
//              it gives to - an orbit around the parties at the centre
//   colour     the industry cluster (party nodes carry their party's colour)
//   size       lifetime dollars, log scaled
//   presence   dimmed nodes recede when something has focus
//   depth      distance fades into the paper via fog, so the third axis
//              reads as atmosphere rather than clutter
//
// Port changes, kept deliberately small: colours come from the static
// palette module instead of tenant CSS tokens (so the palette observer and
// probe element are gone), nodes may override their cluster hue (parties),
// and cluster centres accept a central group (the parties ring's origin).
// Everything else - gestures, momentum, labels, reduced motion - is the
// source engine's behaviour, unchanged.
// ---------------------------------------------------------------------------

/** Camera vertical field of view. Narrow enough to keep spheres round at the edges. */
const FOV = 40

/** Dolly bounds, as multiples of the fitted distance. */
const MIN_DIST_FACTOR = 0.22
const MAX_DIST_FACTOR = 3.2

/** How long the view takes to move to a selection - mirrors the 2D map. */
const FOCUS_MS = 380
const FIT_MS = 520

/**
 * The band a focus move lands in, in world units of camera distance. The
 * floor keeps a whole neighbourhood in frame; the ceiling stops a lone
 * entity pulling the camera into its surface.
 */
const FOCUS_MIN_DIST = 230
const FOCUS_MAX_DIST = 560

/**
 * Idle drift: a slow sway of +-IDLE_SWAY radians about the landing azimuth,
 * one full swing every IDLE_SWAY_PERIOD seconds (peak speed about 0.03 rad/s,
 * slow enough to read as alive, not busy). A sway rather than a spin: the
 * cluster ring is an ellipse up to 3.4:1, so a full turn would either walk
 * the clusters off the plate or, held in frame, need a fit two to four
 * times further out for the moment the long axis points at the camera. The
 * sway re-fits the view each frame it moves (see frame()).
 */
const IDLE_SWAY = 0.22
const IDLE_SWAY_PERIOD = 48

/** Polar clamp - the camera never goes underneath or straight overhead. */
const PHI_MIN = 0.35
const PHI_MAX = Math.PI - 0.55

// ---------------------------------------------------------------------------
// Semantic zoom. An industry cluster whose spread on screen falls below the
// collapse threshold folds into one hub mark; it unfolds again once it would
// be drawn wider than the expand threshold. The gap between the two is the
// hysteresis that keeps a wheel notch near the boundary from flickering.
// Thresholds are in CSS pixels of the cluster's radius, so the same rule
// gives the 380px front-page embed an all-hubs view and the full page a mixed
// one at its fitted distance (measured with the chrome insets in the fit: the
// seven big clusters draw at 73 to 93px there, the rest at 19 to 56px; on the
// 740x380 embed nothing exceeds 63px).
// ---------------------------------------------------------------------------

const COLLAPSE_PX = 68
const EXPAND_PX = 86
/** The collapse/expand choreography - eased both ways, no overshoot. */
const LOD_MS = 420
/** The camera flight into a clicked hub. */
const DIVE_MS = 560
/** A cluster this small has nothing to fold: one dot stays a dot. */
const HUB_MIN_MEMBERS = 2

/** Cluster caption box height in CSS px (the folded variant is the taller). */
const CAPTION_H = 17
/** Captions keep this far inside the plate edge. */
const PLATE_INSET = 6

/** Hub mark radius from the donor count - area follows count, like the blobs. */
function hubRadius(count: number): number {
  return Math.min(88, 15 + 6.2 * Math.sqrt(count))
}

/** Cubic in-out: the collapse gathers speed and settles, without a bounce. */
function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/** Screen-space label box, pooled per frame so placement allocates nothing. */
type LabelBox = { x1: number; y1: number; x2: number; y2: number }

type Palette3D = {
  cats: THREE.Color[]
  /** Text-safe ink per slot, for territory captions. */
  inks: string[]
  surface: THREE.Color
  accent: THREE.Color
}

export type EngineData = {
  nodes: MapNode[]
  edges: MapEdge[]
  groupStyles: Map<string, GroupStyle>
  degrees: Map<string, number>
  measure: MapMeasure
  layout: MapLayout
  aspect: number
  /** Group pinned to the origin with the rest ringed around it (the parties). */
  centralGroup?: string
}

export type EngineEmphasis = {
  selectedId: string | null
  pathEdges: MapEdge[] | null
  pathFrom: string | null
}

/**
 * A second reading laid over the scene, 0..1 per mark: a bronze ring around
 * a node whose reach and intensity follow the value, and an edge whose hue
 * leans towards the accent by its value. The words layer feeds it a party's
 * share of a debate; the engine only knows intensities.
 */
export type WordsOverlay = {
  /** Node id -> intensity. */
  rings: Map<string, number>
  /** `${source}|${target}` -> intensity. */
  edgeTint: Map<string, number>
}

type Fade = { current: number; target: number }

type HaloVisual = {
  mesh: THREE.Mesh
  material: THREE.MeshBasicMaterial
  /** 0..1 presence - eases in and out like every other mark. */
  presence: Fade
  /** The value itself, eased so a re-targeted ring glides rather than snaps. */
  value: Fade
}

/**
 * What an edge needs of its endpoints: a rendered position, a radius and a
 * hue. Nodes satisfy it directly; a collapsed cluster's hub satisfies it
 * through a small anchor object, so aggregated flows run through the same
 * tube code as individual ones.
 */
type EdgeAnchor = {
  node: { id: string; group: string }
  /** Where the mark is drawn this frame (a folding node drifts off its sim position). */
  pos: THREE.Vector3
  r: number
  scale: Fade
  colour: THREE.Color
}

type NodeVisual = EdgeAnchor & {
  node: MapNode
  sim: SimNode3D
  slot: number
  hollow: boolean
  unlinked: boolean
  mesh: THREE.Mesh
  material: THREE.MeshStandardMaterial
  /** Outline shell: the hollow ring for reused hues, the halo on hover. */
  shell: THREE.Mesh
  shellMaterial: THREE.MeshBasicMaterial
  opacity: Fade
  shellOpacity: Fade
  /** 0..1 - how far the node has come forward towards the camera on hover. */
  lift: Fade
  /** Edges on the node, for the hover card (a donor's parties, a party's donors). */
  degree: number
  /** Entrance stagger - the tick count before this node grows in. */
  bornAt: number
  label: HTMLDivElement
  /** Measured label width in CSS px, for collision placement. */
  labelW: number
  /** The cluster the node belongs to, for its fold state; null for the centre. */
  territory: TerritoryVisual | null
}

type EdgeVisual = {
  edge: MapEdge
  key: string
  from: EdgeAnchor
  to: EdgeAnchor
  /** Industry hue, written with per-flow opacity into the shared ribbon buffer. */
  colour: THREE.Color
  width: number
  crossing: boolean
  /** Parallel relations between one pair fan sideways by this much. */
  lateral: number
  opacity: Fade
  emphasised: boolean
  label: HTMLDivElement | null
  labelW: number
  /**
   * The cluster whose fold this edge follows: an individual flow fades OUT as
   * its cluster collapses, an aggregated one fades IN. Null: unaffected.
   */
  hub: HubVisual | null
  aggregate: boolean
}

/**
 * The single mark an industry cluster folds into when the camera is too far
 * out to tell its donors apart: one sphere in the cluster's hue sized by the
 * donor count, ringed by a hairline in its ink, with the cluster's flows to
 * each party summed into one tube apiece.
 */
type HubVisual = {
  id: string
  group: string
  /** Text-safe ink of the cluster's hue, for the caption and the ring. */
  ink: string
  count: number
  total: number
  /** Donor members, for the fold choreography. */
  members: NodeVisual[]
  anchor: EdgeAnchor
  mesh: THREE.Mesh
  material: THREE.MeshStandardMaterial
  ring: THREE.Mesh
  ringMaterial: THREE.MeshBasicMaterial
  /** One aggregated flow per party the cluster gave to. */
  flows: EdgeVisual[]
  /** Level of detail, 0 = dots, 1 = hub. Tweened, not approached. */
  lod: number
  lodTarget: number
  lodFrom: number
  /** performance.now() the tween began; -1 before the first evaluation, which snaps. */
  lodStarted: number
  /** Set by a click-to-open dive so the automatic rule cannot refold it mid-flight. */
  dived: boolean
  /** Presence under emphasis: dims like a node when something else has focus. */
  opacity: Fade
  /** Entrance grow-in, and a lift on hover. */
  scale: Fade
  bornAt: number
}

type TerritoryVisual = {
  group: string
  style: GroupStyle
  count: number
  total: number
  mesh: THREE.Mesh
  material: THREE.MeshBasicMaterial
  caption: HTMLDivElement
  captionFull: string
  captionShort: string
  /** Measured widths, CSS px: the open territory's caption and its larger folded variant. */
  captionW: number
  captionShortW: number
  captionHubW: number
  captionShortHubW: number
  centre: THREE.Vector3
  /** Blob radius: the spread plus a margin, for the territory volume. */
  r: number
  /** Furthest member (plus its radius) from the centroid - the cluster's real extent. */
  spread: number
  /** Null for the central group and for clusters too small to fold. */
  hub: HubVisual | null
}

type ScreenDisc = {
  ok: boolean
  sx: number
  sy: number
  camDist: number
  screenR: number
  opacity: number
}

type View = {
  target: THREE.Vector3
  theta: number
  phi: number
  dist: number
}

type ViewTween = {
  from: View
  to: View
  started: number
  duration: number
}

type DragState = {
  id: string
  plane: THREE.Plane
  moved: boolean
  lastX: number
  lastY: number
  /** Cumulative pointer travel - a press only becomes a drag past a threshold. */
  travel: number
}

type OrbitState = {
  mode: 'orbit' | 'pan'
  lastX: number
  lastY: number
  moved: number
  /** The hub the press landed on: released in place, it opens the cluster. */
  hub: string | null
}

type PinchState = {
  a: number
  b: number
  gap: number
  dist: number
  midX: number
  midY: number
}

/** Edge weight -> engraved ribbon half-width, quietly log-scaled by value. */
function edgeRadius(weight: number): number {
  return Math.max(0.24, Math.min(1.9, 0.2 + 0.42 * Math.log10(1 + Math.max(0, weight))))
}

/**
 * Resting opacity of an aggregated hub -> party flow: heavier flows come
 * forward. There are few of them, so they can carry more presence than the
 * faint individual cross-cluster lines without turning into a thicket.
 */
function flowResting(weight: number): number {
  const t = Math.max(0, Math.min(1, Math.log10(1 + Math.max(0, weight)) / 4))
  return 0.1 + 0.14 * t
}

function edgeValue(weight: number): number {
  return Math.max(0, Math.min(1, Math.log10(1 + Math.max(0, weight)) / 4))
}

/**
 * Every flow is one camera-facing ribbon plus a small arrowhead, merged into
 * one BufferGeometry. The shader lays a single faint dash over each ribbon;
 * `uPhase` takes seven seconds to cross source -> target. This keeps the map
 * to one draw call for all lines, including the folded industry flows.
 */
const EDGE_VERTEX_SHADER = `
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
`

const EDGE_FRAGMENT_SHADER = `
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
`

/** How far each edge in a parallel bundle bows sideways - ported from buildCurves. */
function buildLaterals(edges: MapEdge[]): number[] {
  const seen = new Map<string, number[]>()
  edges.forEach((edge, i) => {
    const key = edge.source < edge.target
      ? `${edge.source} ${edge.target}`
      : `${edge.target} ${edge.source}`
    const list = seen.get(key)
    if (list) list.push(i)
    else seen.set(key, [i])
  })
  const laterals = new Array<number>(edges.length).fill(0)
  for (const list of seen.values()) {
    if (list.length === 1) continue
    list.forEach((edgeIndex, j) => {
      laterals[edgeIndex] = -1 + (2 * j) / (list.length - 1)
    })
  }
  return laterals
}

export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/**
 * The static palette, in the module's cluster order - slot i is the i-th
 * cluster. The source engine resolved these from tenant CSS tokens at
 * runtime; the money map's palette is fixed, so this is built once.
 */
function buildPalette(): Palette3D {
  const cats: THREE.Color[] = []
  const inks: string[] = []
  for (const style of CLUSTER_COLOURS.values()) {
    cats.push(new THREE.Color(style.colour))
    inks.push(style.ink)
  }
  return {
    cats,
    inks,
    surface: new THREE.Color(SURFACE),
    accent: new THREE.Color(ACCENT),
  }
}

// ---------------------------------------------------------------------------
// The engine.
// ---------------------------------------------------------------------------

export class KnowledgeMapEngine {
  private canvas: HTMLCanvasElement
  private labelLayer: HTMLDivElement
  private onSelect: (id: string | null) => void
  /** Optional: a click that hits no node but lands on an edge reports it here. */
  onEdgePick: ((edge: MapEdge | null) => void) | null = null

  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private nodeGroup = new THREE.Group()
  private territoryGroup = new THREE.Group()
  private hemi: THREE.HemisphereLight
  private key: THREE.DirectionalLight
  private fill: THREE.DirectionalLight
  private fog: THREE.Fog

  private sphereGeo = new THREE.SphereGeometry(1, 40, 24)
  private shellGeo = new THREE.SphereGeometry(1, 32, 18)
  private edgeGeometry = new THREE.BufferGeometry()
  private edgeUniforms = {
    uPhase: { value: 0 },
    uReduced: { value: 0 },
  }
  private edgeMaterial: THREE.ShaderMaterial
  private edgeMesh: THREE.Mesh
  private edgePositions = new Float32Array(0)
  private edgeColours = new Float32Array(0)
  private edgeTimes = new Float32Array(0)
  private edgeSeeds = new Float32Array(0)
  private edgeKinds = new Float32Array(0)
  private ringGeo = new THREE.RingGeometry(1.18, 1.32, 48)
  private territoryGeo = new THREE.SphereGeometry(1, 28, 18)
  /** Thinner than the selection ring: an engraved line, not a badge. */
  private haloGeo = new THREE.RingGeometry(1, 1.045, 64)
  private haloGroup = new THREE.Group()
  private halos = new Map<string, HaloVisual>()
  private overlay: WordsOverlay | null = null

  private selectionRing: THREE.Mesh
  private selectionRingMaterial: THREE.MeshBasicMaterial
  private traceRing: THREE.Mesh
  private traceRingMaterial: THREE.MeshBasicMaterial

  private palette: Palette3D
  private popup: HTMLDivElement
  private popupName: HTMLDivElement
  private popupMeta: HTMLDivElement
  private popupCounts: HTMLDivElement
  private popupHint: HTMLDivElement
  /** Label boxes placed this frame; the array and its boxes are reused frame to frame. */
  private placedLabelBoxes: LabelBox[] = []
  private boxPool: LabelBox[] = []
  private discs: ScreenDisc[] = []
  /** Text measurement for label placement - one 2D context, fonts resolved per build. */
  private measureCtx: CanvasRenderingContext2D | null = null
  private labelFont = ''
  private captionFont = ''
  private captionSpacing = 0

  private data: EngineData | null = null
  private sim: ForceSim3D | null = null
  private centres: Map<string, Centre3D> = new Map()
  private nodeVisuals = new Map<string, NodeVisual>()
  private edgeVisuals: EdgeVisual[] = []
  /** Aggregated hub -> party flows, one list across every hub. */
  private flowVisuals: EdgeVisual[] = []
  private territories: TerritoryVisual[] = []
  /** Territories largest first - the order captions claim their space. */
  private captionRank: TerritoryVisual[] = []
  private hubs = new Map<string, HubVisual>()
  private hubGroup = new THREE.Group()
  private paintRank: NodeVisual[] = []
  private worldCentre = new THREE.Vector3()
  private worldRadius = 320

  private emphasis: EngineEmphasis = { selectedId: null, pathEdges: null, pathFrom: null }
  private hoveredId: string | null = null
  /** The hub under the pointer, by group. Exclusive with hoveredId. */
  private hoveredHub: string | null = null
  private neighbourIds: Set<string> | null = null
  private pathNodeIds: Set<string> | null = null
  private pathEdgeKeys: Set<string> | null = null

  private insets: Insets = { left: 0, right: 0, top: 0, bottom: 0 }

  private view: View
  private distGoal: number
  private tween: ViewTween | null = null
  private idleSpin: boolean
  /** The azimuth the idle sway swings about, and where in the swing it is. */
  private idleAnchor = -0.5
  private idlePhase = 0
  private reduced: boolean
  private reducedQuery: MediaQueryList | null = null
  private onContextLost: ((event: Event) => void) | null = null

  private onReducedChange = (event: MediaQueryListEvent) => {
    this.reduced = event.matches
    this.edgeUniforms.uReduced.value = event.matches ? 1 : 0
    if (event.matches) this.idleSpin = false
    this.renderDirty = true
  }
  private viewOwnedFlag = false
  private focusOwnedFlag = false
  private fitDist = 420

  private pointers = new Map<number, { x: number; y: number }>()
  private orbit: OrbitState | null = null
  private pinch: PinchState | null = null
  private drag: DragState | null = null
  private gestured = false
  private hoverPos: { x: number; y: number } | null = null
  private hoverDirty = false

  private raycaster = new THREE.Raycaster()
  private frameHandle: number | null = null
  private lastFrame = performance.now()
  private frameCount = 0
  private lastFlowPaint = 0
  private renderDirty = true
  private paused = false
  private resizeObserver: ResizeObserver
  private disposed = false
  private width = 1
  private height = 1

  constructor(
    canvas: HTMLCanvasElement,
    labelLayer: HTMLDivElement,
    onSelect: (id: string | null) => void,
    onContextLost?: () => void,
  ) {
    this.canvas = canvas
    this.labelLayer = labelLayer
    this.onSelect = onSelect
    // A lost context would otherwise freeze the canvas with no way back;
    // the shell swaps in the 2D map instead.
    if (onContextLost) {
      this.onContextLost = (event: Event) => {
        event.preventDefault()
        onContextLost()
      }
      canvas.addEventListener('webglcontextlost', this.onContextLost)
    }
    // Live, not a snapshot: a reader who turns reduced motion on mid-session
    // gets it honoured immediately, not at the next remount.
    this.reducedQuery = typeof globalThis.matchMedia === 'function'
      ? globalThis.matchMedia('(prefers-reduced-motion: reduce)')
      : null
    this.reduced = this.reducedQuery?.matches ?? false
    this.edgeUniforms.uReduced.value = this.reduced ? 1 : 0
    this.idleSpin = !this.reduced
    this.reducedQuery?.addEventListener('change', this.onReducedChange)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2))
    this.edgeMaterial = new THREE.ShaderMaterial({
      uniforms: this.edgeUniforms,
      vertexShader: EDGE_VERTEX_SHADER,
      fragmentShader: EDGE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    this.edgeMesh = new THREE.Mesh(this.edgeGeometry, this.edgeMaterial)
    this.edgeMesh.frustumCulled = false
    this.edgeMesh.raycast = () => undefined

    // The hover card - one pooled element, filled per node. DOM in the label
    // layer idiom: inert to the pointer, styled by the adapter's stylesheet.
    this.popup = document.createElement('div')
    this.popup.className = 'rp-map3d-popup'
    this.popup.style.display = 'none'
    this.popupName = document.createElement('div')
    this.popupName.className = 'rp-map3d-popup-name'
    this.popupMeta = document.createElement('div')
    this.popupMeta.className = 'rp-map3d-popup-meta'
    this.popupCounts = document.createElement('div')
    this.popupCounts.className = 'rp-map3d-popup-counts'
    this.popupHint = document.createElement('div')
    this.popupHint.className = 'rp-map3d-popup-hint'
    this.popupHint.textContent = 'Click for details'
    this.popup.append(this.popupName, this.popupMeta, this.popupCounts, this.popupHint)
    labelLayer.appendChild(this.popup)

    this.palette = buildPalette()

    this.camera = new THREE.PerspectiveCamera(FOV, 1.5, 2, 9000)
    this.fog = new THREE.Fog(this.palette.surface.clone(), 600, 2400)
    this.scene.fog = this.fog
    this.scene.add(this.territoryGroup)
    this.scene.add(this.edgeMesh)
    this.scene.add(this.nodeGroup)
    this.scene.add(this.hubGroup)
    this.scene.add(this.haloGroup)

    // Light-mode-first lighting: a bright hemisphere for the airy paper feel
    // and a soft key so the spheres read as satin objects, not flat dots. All
    // three derive from the surface token, so dark palettes relight themselves.
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 0.95)
    this.key = new THREE.DirectionalLight(0xffffff, 1.15)
    this.key.position.set(0.55, 1, 0.4)
    this.fill = new THREE.DirectionalLight(0xffffff, 0.3)
    this.fill.position.set(-0.6, -0.35, -0.7)
    this.scene.add(this.hemi, this.key, this.fill)

    this.selectionRingMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    this.selectionRing = new THREE.Mesh(this.ringGeo, this.selectionRingMaterial)
    this.selectionRing.visible = false
    this.scene.add(this.selectionRing)
    this.traceRingMaterial = this.selectionRingMaterial.clone()
    this.traceRing = new THREE.Mesh(this.ringGeo, this.traceRingMaterial)
    this.traceRing.visible = false
    this.scene.add(this.traceRing)

    this.applyPaletteToScene()

    // Start from a raised three-quarter view: high enough that the cluster
    // ring reads as a ring rather than clusters stacked behind one another,
    // low enough that depth still shows.
    this.view = {
      target: new THREE.Vector3(),
      theta: -0.5,
      phi: 0.95,
      dist: 640,
    }
    this.distGoal = this.view.dist

    this.resizeObserver = new ResizeObserver(() => this.handleResize())
    this.resizeObserver.observe(canvas.parentElement ?? canvas)
    this.handleResize()

    this.bindPointerHandlers()
    this.frameHandle = requestAnimationFrame(this.frame)
  }

  // -------------------------------------------------------------------
  // Palette.
  // -------------------------------------------------------------------

  private applyPaletteToScene() {
    const surface = this.palette.surface
    this.renderer.setClearColor(surface, 1)
    this.fog.color.copy(surface)
    // Sky drifts towards white above the surface, ground sits below it, so
    // the shading direction survives both light and dark palettes.
    this.hemi.color.copy(surface.clone().lerp(new THREE.Color(0xffffff), 0.72))
    this.hemi.groundColor.copy(surface.clone().multiplyScalar(0.55))
    this.selectionRingMaterial.color.copy(this.palette.accent)
    this.traceRingMaterial.color.copy(this.palette.accent)
  }

  private catColour(slot: number): THREE.Color {
    return this.palette.cats[slot] ?? this.palette.accent
  }

  private applyNodeColour(visual: NodeVisual) {
    const cat = visual.colour
    if (visual.hollow) {
      visual.material.color.copy(this.palette.surface)
      visual.material.emissive.set(0x000000)
      visual.shellMaterial.color.copy(cat)
    } else {
      visual.material.color.copy(cat)
      // A whisper of self-illumination keeps the hue saturated inside the
      // shadowed half of the sphere, which is where flat dots go muddy.
      visual.material.emissive.copy(cat).multiplyScalar(0.16)
      visual.shellMaterial.color.copy(cat)
    }
  }

  /**
   * What has the reader's attention: the selection, else the hovered node,
   * else the hovered hub (by its synthetic id). Edges test their endpoints
   * against it, so a hub's aggregated flows light up exactly as a node's do.
   */
  private focusKey(): string | null {
    return this.emphasis.selectedId ?? this.hoveredId ??
      (this.hoveredHub !== null ? this.hubs.get(this.hoveredHub)?.id ?? null : null)
  }

  private applyEdgeColour(visual: EdgeVisual) {
    const onPath = this.pathEdgeKeys?.has(visual.key) ?? false
    if (onPath) {
      visual.colour.copy(this.palette.accent)
      return
    }
    // A flow always keeps the giver's industry hue. Selection changes
    // strength, not meaning (a selected party must not turn every industry
    // line into the party's colour).
    visual.colour.copy(visual.from.colour)
    const tint = this.edgeTintOf(visual)
    if (tint > 0) {
      visual.colour.lerp(this.palette.accent, tint)
    }
  }

  private edgeTintOf(visual: EdgeVisual): number {
    const tint = this.overlay?.edgeTint.get(`${visual.edge.source}|${visual.edge.target}`) ?? 0
    return Math.max(0, Math.min(1, tint))
  }

  // -------------------------------------------------------------------
  // The words overlay - halos and edge tint.
  // -------------------------------------------------------------------

  /**
   * Lay the words reading over the scene, or clear it with null. Rings ease
   * in and out (instantly under reduced motion) and survive a data rebuild;
   * a ring for a node the scene does not hold simply waits for it.
   */
  setWordsOverlay(overlay: WordsOverlay | null) {
    this.overlay = overlay
    this.syncHalos()
    this.updateEmphasisSets()
  }

  private syncHalos() {
    const rings = this.overlay?.rings
    for (const [id, halo] of this.halos) {
      const value = rings?.get(id) ?? 0
      halo.presence.target = value > 0 ? 1 : 0
      if (value > 0) halo.value.target = value
    }
    if (!rings) return
    for (const [id, value] of rings) {
      if (value <= 0 || this.halos.has(id) || !this.nodeVisuals.has(id)) continue
      const material = new THREE.MeshBasicMaterial({
        color: this.palette.accent,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      const mesh = new THREE.Mesh(this.haloGeo, material)
      mesh.raycast = () => undefined
      mesh.visible = false
      this.haloGroup.add(mesh)
      this.halos.set(id, {
        mesh,
        material,
        presence: { current: 0, target: 1 },
        value: { current: value, target: value },
      })
    }
  }

  private clearHalos() {
    for (const halo of this.halos.values()) halo.material.dispose()
    this.haloGroup.clear()
    this.halos.clear()
  }

  // -------------------------------------------------------------------
  // Data - build the simulation and the scene.
  // -------------------------------------------------------------------

  setData(data: EngineData) {
    this.data = data
    const previous = new Map<string, { x: number; y: number; z: number }>()
    for (const [id, visual] of this.nodeVisuals) {
      previous.set(id, { x: visual.sim.x, y: visual.sim.y, z: visual.sim.z })
    }
    // Fold state survives a rebuild (a scrub step, a filter) so every hub does
    // not re-animate; a cluster new to the scene snaps to its resolved state.
    const previousLod = new Map<string, Pick<HubVisual, 'lod' | 'lodTarget' | 'lodFrom' | 'lodStarted' | 'dived'>>()
    for (const [group, hub] of this.hubs) {
      previousLod.set(group, {
        lod: hub.lod,
        lodTarget: hub.lodTarget,
        lodFrom: hub.lodFrom,
        lodStarted: hub.lodStarted,
        dived: hub.dived,
      })
    }
    const firstBuild = this.nodeVisuals.size === 0

    const counts = new Map<string, number>()
    for (const node of data.nodes) counts.set(node.group, (counts.get(node.group) ?? 0) + 1)
    const ordered = new Map(
      [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    )
    const centres: Map<string, Centre3D> = clusterCentres3D(
      ordered,
      data.aspect,
      data.centralGroup,
    )
    this.centres = centres
    // The landing angle is chosen, not fixed: looking straight down the ring
    // stacks one cluster behind another, so before the first fit the camera
    // walks the circle and keeps the azimuth that spreads the cluster
    // centres furthest apart on screen. A reader who has taken the view
    // keeps it.
    if (!this.viewOwnedFlag && centres.size > 2) {
      this.view.theta = this.bestTheta(centres)
      this.idleAnchor = this.view.theta
      this.idlePhase = 0
    }

    const radiusOf = (node: MapNode) =>
      radiusFor(
        data.measure,
        data.measure === 'links' ? (data.degrees.get(node.id) ?? 0) : node.weight,
      )

    this.sim = new ForceSim3D({
      nodes: data.nodes.map((node) => {
        const kept = previous.get(node.id)
        return {
          id: node.id,
          group: node.group,
          radius: radiusOf(node),
          ...(kept ? { x: kept.x, y: kept.y, z: kept.z } : {}),
        }
      }),
      links: data.edges.map((edge) => ({ source: edge.source, target: edge.target })),
      layout: data.layout,
      centres,
    })
    // Settle synchronously, like the 2D map - instant, and immune to
    // background-tab rAF throttling. Live physics then only animates drags.
    this.sim.tick(300)

    this.clearScene()

    data.nodes.forEach((node, index) => {
      const sim = this.sim?.byId(node.id)
      if (!sim) return
      const style = data.groupStyles.get(node.group)
      const slot = style?.slot ?? 0
      const hollow = style?.hollow ?? false
      const degree = data.degrees.get(node.id) ?? 0
      const unlinked = data.measure === 'links' && degree === 0
      const r = radiusOf(node)

      const material = new THREE.MeshStandardMaterial({
        roughness: 0.42,
        metalness: 0.04,
        transparent: true,
        opacity: 1,
      })
      const mesh = new THREE.Mesh(this.sphereGeo, material)
      mesh.userData.nodeId = node.id
      const shellMaterial = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: hollow ? 0.95 : 0,
        side: THREE.BackSide,
        depthWrite: false,
      })
      const shell = new THREE.Mesh(this.shellGeo, shellMaterial)
      shell.raycast = () => undefined
      mesh.add(shell)
      shell.scale.setScalar(hollow ? 1.22 : 1.14)
      this.nodeGroup.add(mesh)

      const label = document.createElement('div')
      label.className = 'rp-map3d-label'
      label.textContent = shortLabel(node.label)
      label.style.display = 'none'
      this.labelLayer.appendChild(label)

      const visual: NodeVisual = {
        node,
        sim,
        pos: new THREE.Vector3(sim.x, sim.y, sim.z),
        r: unlinked ? Math.max(3.5, r - 1.5) : r,
        slot,
        colour: node.colour ? new THREE.Color(node.colour) : this.catColour(slot).clone(),
        hollow,
        unlinked,
        mesh,
        material,
        shell,
        shellMaterial,
        opacity: { current: 1, target: 1 },
        shellOpacity: { current: hollow ? 0.95 : 0, target: hollow ? 0.95 : 0 },
        scale: {
          current: firstBuild && !this.reduced ? 0.001 : 1,
          target: 1,
        },
        lift: { current: 0, target: 0 },
        degree,
        bornAt: firstBuild && !this.reduced ? performance.now() + Math.min(index * 9, 900) : 0,
        label,
        labelW: 0,
        territory: null,
      }
      this.applyNodeColour(visual)
      this.nodeVisuals.set(node.id, visual)
    })

    const laterals = buildLaterals(data.edges)
    this.edgeVisuals = []
    data.edges.forEach((edge, index) => {
      const from = this.nodeVisuals.get(edge.source)
      const to = this.nodeVisuals.get(edge.target)
      if (!from || !to) return
      const crossing = from.node.group !== to.node.group
      const visual: EdgeVisual = {
        edge,
        key: `${edge.source}|${edge.label}|${edge.target}`,
        from,
        to,
        colour: from.colour.clone(),
        width: edgeRadius(edge.weight),
        crossing,
        lateral: laterals[index] ?? 0,
        opacity: { current: 0, target: crossing ? 0.08 : 0.15 },
        emphasised: false,
        label: null,
        labelW: 0,
        hub: null,
        aggregate: false,
      }
      this.applyEdgeColour(visual)
      this.edgeVisuals.push(visual)
    })

    // Territories only exist in the grouped layout, and only when there is
    // more than one category to tell apart. Every non-central territory with
    // enough members also gets its hub: the one mark it folds into when the
    // camera is too far out to tell its donors apart.
    this.territories = []
    if (data.layout === 'grouped' && ordered.size > 1) {
      const now = performance.now()
      let hubIndex = 0
      for (const [group] of ordered) {
        const style = data.groupStyles.get(group)
        if (!style) continue
        const members: NodeVisual[] = []
        let total = 0
        for (const visual of this.nodeVisuals.values()) {
          if (visual.node.group !== group) continue
          members.push(visual)
          total += visual.node.total ?? 0
        }
        const count = members.length
        const material = new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0.055,
          depthWrite: false,
        })
        const cat = this.palette.cats[style.slot] ?? this.palette.accent
        material.color.copy(cat)
        const mesh = new THREE.Mesh(this.territoryGeo, material)
        mesh.raycast = () => undefined
        mesh.renderOrder = -2
        this.territoryGroup.add(mesh)
        const caption = document.createElement('div')
        caption.className = 'rp-map3d-territory'
        caption.style.color = this.palette.inks[style.slot] ?? '#5A616B'
        const captionFull = `${group.toUpperCase()} · ${count}`
        caption.textContent = captionFull
        caption.style.display = 'none'
        this.labelLayer.appendChild(caption)
        const territory: TerritoryVisual = {
          group,
          style,
          count,
          total,
          mesh,
          material,
          caption,
          captionFull,
          captionShort: group.toUpperCase(),
          captionW: 0,
          captionShortW: 0,
          captionHubW: 0,
          captionShortHubW: 0,
          centre: new THREE.Vector3(),
          r: 0,
          spread: 0,
          hub: null,
        }
        for (const member of members) member.territory = territory
        this.territories.push(territory)

        if (group === data.centralGroup || count < HUB_MIN_MEMBERS) continue

        const hubMaterial = new THREE.MeshStandardMaterial({
          roughness: 0.42,
          metalness: 0.04,
          transparent: true,
          opacity: 0,
        })
        hubMaterial.color.copy(cat)
        hubMaterial.emissive.copy(cat).multiplyScalar(0.16)
        const hubMesh = new THREE.Mesh(this.sphereGeo, hubMaterial)
        hubMesh.raycast = () => undefined
        hubMesh.visible = false
        // The hairline in the cluster's ink: an engraved ring, not a badge.
        const ringMaterial = new THREE.MeshBasicMaterial({
          color: new THREE.Color(style.ink),
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
        const ring = new THREE.Mesh(this.haloGeo, ringMaterial)
        ring.raycast = () => undefined
        ring.visible = false
        this.hubGroup.add(hubMesh, ring)
        const kept = previousLod.get(group)
        const hub: HubVisual = {
          id: `hub:${group}`,
          group,
          ink: style.ink,
          count,
          total,
          members,
          // The anchor shares the territory's centre vector, so the hub and
          // its flows follow the centroid wherever the simulation takes it.
          anchor: {
            node: { id: `hub:${group}`, group },
            pos: territory.centre,
            r: hubRadius(count),
            scale: { current: 1, target: 1 },
            colour: cat.clone(),
          },
          mesh: hubMesh,
          material: hubMaterial,
          ring,
          ringMaterial,
          flows: [],
          lod: kept?.lod ?? 0,
          lodTarget: kept?.lodTarget ?? 0,
          lodFrom: kept?.lodFrom ?? 0,
          lodStarted: kept?.lodStarted ?? -1,
          dived: kept?.dived ?? false,
          opacity: { current: 1, target: 1 },
          scale: { current: firstBuild && !this.reduced ? 0.001 : 1, target: 1 },
          bornAt: firstBuild && !this.reduced ? now + 240 + Math.min(hubIndex * 45, 600) : 0,
        }
        hubIndex += 1
        territory.hub = hub
        this.hubs.set(group, hub)

        // One aggregated flow per party the cluster gave to: dollars and
        // weights summed, the donor count carried, the year span widened.
        const perTarget = new Map<string, {
          total: number
          weight: number
          donors: number
          firstYear: number | null
          lastYear: number | null
        }>()
        for (const edgeVisual of this.edgeVisuals) {
          if (edgeVisual.from.node.group !== group || edgeVisual.to.node.group === group) continue
          const edge = edgeVisual.edge
          const agg = perTarget.get(edge.target) ?? {
            total: 0, weight: 0, donors: 0, firstYear: null, lastYear: null,
          }
          agg.total += edge.total ?? 0
          agg.weight += edge.weight
          agg.donors += 1
          if (edge.firstYear) {
            agg.firstYear = agg.firstYear === null ? edge.firstYear : Math.min(agg.firstYear, edge.firstYear)
          }
          if (edge.lastYear) {
            agg.lastYear = agg.lastYear === null ? edge.lastYear : Math.max(agg.lastYear, edge.lastYear)
          }
          perTarget.set(edge.target, agg)
        }
        for (const [targetId, agg] of perTarget) {
          const to = this.nodeVisuals.get(targetId)
          if (!to) continue
          const synthetic: MapEdge = {
            source: hub.id,
            target: targetId,
            label: formatMoney(agg.total),
            weight: agg.weight,
            total: agg.total,
            count: agg.donors,
            firstYear: agg.firstYear,
            lastYear: agg.lastYear,
            hub: group,
          }
          const flow: EdgeVisual = {
            edge: synthetic,
            key: `${synthetic.source}|${synthetic.label}|${synthetic.target}`,
            from: hub.anchor,
            to,
            colour: hub.anchor.colour.clone(),
            width: edgeRadius(agg.weight),
            crossing: true,
            lateral: 0,
            opacity: { current: 0, target: flowResting(agg.weight) },
            emphasised: false,
            label: null,
            labelW: 0,
            hub,
            aggregate: true,
          }
          this.applyEdgeColour(flow)
          hub.flows.push(flow)
          this.flowVisuals.push(flow)
        }
      }
      // Individual flows follow their donor's cluster fold.
      for (const edgeVisual of this.edgeVisuals) {
        const from = this.nodeVisuals.get(edgeVisual.edge.source)
        const to = this.nodeVisuals.get(edgeVisual.edge.target)
        edgeVisual.hub = from?.territory?.hub ?? to?.territory?.hub ?? null
      }
    }
    this.captionRank = [...this.territories].sort((a, b) => b.count - a.count)

    this.paintRank = [...this.nodeVisuals.values()].sort((a, b) => b.r - a.r)
    this.measureLabels()
    this.updateWorldBounds()
    // Seed the territory volumes now rather than waiting for the first
    // rendered frame - captions must never paint at a stale origin.
    this.updateTerritories()
    this.syncHalos()
    this.rebuildEdgeBuffers()
    this.updateEmphasisSets()
    this.renderDirty = true
  }

  /**
   * Label widths for collision placement, measured once per build with a 2D
   * context set to the labels' computed fonts (the host may restyle them).
   * A display:none element still resolves its font, so nothing is laid out.
   */
  private measureLabels() {
    if (!this.measureCtx) {
      this.measureCtx = document.createElement('canvas').getContext('2d')
    }
    const ctx = this.measureCtx
    const fontOf = (element: HTMLElement | undefined): { font: string; spacing: number } => {
      if (!element) return { font: '', spacing: 0 }
      const cs = getComputedStyle(element)
      const spacing = parseFloat(cs.letterSpacing)
      return {
        font: `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`,
        spacing: Number.isFinite(spacing) ? spacing : 0,
      }
    }
    const first = this.paintRank[0]
    const label = fontOf(first?.label)
    const probe = this.territories[0]?.caption
    const caption = fontOf(probe)
    // The folded variant is a step larger: resolve it through the attribute
    // that styles it, so the two widths are both exact.
    probe?.setAttribute('data-hub', '')
    const hubCaption = fontOf(probe)
    probe?.removeAttribute('data-hub')
    this.labelFont = label.font
    this.captionFont = caption.font
    this.captionSpacing = caption.spacing
    const measure = (text: string, font: string, spacing: number, fallback: number): number => {
      if (!ctx || !font) return text.length * fallback
      ctx.font = font
      return ctx.measureText(text).width + spacing * text.length
    }
    for (const visual of this.paintRank) {
      visual.labelW = measure(visual.label.textContent ?? '', this.labelFont, 0, 6.2)
    }
    for (const territory of this.territories) {
      territory.captionW = measure(territory.captionFull, this.captionFont, this.captionSpacing, 7.4)
      territory.captionShortW = measure(territory.captionShort, this.captionFont, this.captionSpacing, 7.4)
      territory.captionHubW = measure(territory.captionFull, hubCaption.font, hubCaption.spacing, 8.2)
      territory.captionShortHubW = measure(territory.captionShort, hubCaption.font, hubCaption.spacing, 8.2)
    }
  }

  private clearScene() {
    this.clearHalos()
    for (const visual of this.nodeVisuals.values()) {
      visual.material.dispose()
      visual.shellMaterial.dispose()
      visual.label.remove()
    }
    for (const visual of this.edgeVisuals) visual.label?.remove()
    for (const visual of this.flowVisuals) visual.label?.remove()
    for (const hub of this.hubs.values()) {
      hub.material.dispose()
      hub.ringMaterial.dispose()
    }
    for (const territory of this.territories) {
      territory.material.dispose()
      territory.caption.remove()
    }
    this.nodeGroup.clear()
    this.edgeGeometry.setDrawRange(0, 0)
    this.territoryGroup.clear()
    this.hubGroup.clear()
    this.nodeVisuals.clear()
    this.edgeVisuals = []
    this.flowVisuals = []
    this.territories = []
    this.captionRank = []
    this.hubs.clear()
    this.hoveredHub = null
  }

  private updateWorldBounds() {
    const centre = new THREE.Vector3()
    let count = 0
    for (const visual of this.nodeVisuals.values()) {
      centre.x += visual.sim.x
      centre.y += visual.sim.y
      centre.z += visual.sim.z
      count += 1
    }
    if (count === 0) return
    centre.multiplyScalar(1 / count)
    let radius = 120
    for (const visual of this.nodeVisuals.values()) {
      const d = Math.hypot(
        visual.sim.x - centre.x,
        visual.sim.y - centre.y,
        visual.sim.z - centre.z,
      ) + visual.r
      if (d > radius) radius = d
    }
    this.worldCentre.copy(centre)
    this.worldRadius = radius
  }

  // -------------------------------------------------------------------
  // Emphasis - selection, hover, path.
  // -------------------------------------------------------------------

  setEmphasis(emphasis: EngineEmphasis) {
    this.emphasis = emphasis
    this.updateEmphasisSets()
  }

  /** The pointer's hover target: a node, a hub, or nothing. The two are exclusive. */
  private setHover(id: string | null, hub: string | null) {
    if (this.hoveredId === id && this.hoveredHub === hub) return
    this.hoveredId = id
    this.hoveredHub = hub
    this.updatePopup()
    this.canvas.style.cursor = id !== null || hub !== null ? 'pointer' : 'grab'
    this.updateEmphasisSets()
  }

  private setHovered(id: string | null) {
    this.setHover(id, null)
  }

  private setHoveredHub(group: string | null) {
    this.setHover(null, group)
  }

  private updateEmphasisSets() {
    const { selectedId, pathEdges, pathFrom } = this.emphasis
    const focus = this.focusKey()
    if (focus) {
      const ids = new Set<string>([focus])
      for (const visual of this.edgeVisuals) {
        if (visual.edge.source === focus) ids.add(visual.edge.target)
        if (visual.edge.target === focus) ids.add(visual.edge.source)
      }
      // A hovered hub's neighbourhood is the parties it gave to.
      for (const visual of this.flowVisuals) {
        if (visual.edge.source === focus) ids.add(visual.edge.target)
      }
      this.neighbourIds = ids
    } else {
      this.neighbourIds = null
    }
    if (pathEdges) {
      const ids = new Set<string>()
      for (const edge of pathEdges) {
        ids.add(edge.source)
        ids.add(edge.target)
      }
      this.pathNodeIds = ids
      this.pathEdgeKeys = new Set(pathEdges.map((e) => `${e.source}|${e.label}|${e.target}`))
    } else {
      this.pathNodeIds = null
      this.pathEdgeKeys = null
    }

    for (const visual of this.nodeVisuals.values()) {
      const id = visual.node.id
      const isSelected = id === selectedId
      const isHovered = id === this.hoveredId
      const isPathStart = id === pathFrom
      const inNeighbourhood = this.neighbourIds?.has(id) ?? true
      const onPath = this.pathNodeIds?.has(id) ?? false
      const dimmed = (this.pathNodeIds && !onPath) || (!this.pathNodeIds && !inNeighbourhood)
      const emphasised = isSelected || isHovered || isPathStart || onPath
      // Dimmed marks recede but stay clearly there - they still carry the
      // shape of the map, and the depth fog is already quietening the far
      // side, so a hard fade here would wash the back of the scene out.
      visual.opacity.target = dimmed ? 0.3 : visual.unlinked && !emphasised ? 0.6 : 1
      visual.shellOpacity.target = visual.hollow
        ? (dimmed ? 0.2 : 0.95)
        : isHovered && !isSelected
        ? 0.4
        : 0
      // The hovered node comes forward decisively; the selected one holds a
      // quieter, steadier presence under its ring.
      visual.scale.target = isHovered && !isSelected
        ? 1.24
        : isSelected
        ? 1.14
        : emphasised
        ? 1.08
        : 1
      visual.lift.target = isHovered && !isSelected ? 1 : 0
    }

    const pathKeys = this.pathEdgeKeys
    const emphasiseEdge = (visual: EdgeVisual) => {
      const onPath = pathKeys?.has(visual.key) ?? false
      const touchesFocus = focus !== null &&
        (visual.edge.source === focus || visual.edge.target === focus)
      const dimmed = (pathKeys && !onPath) ||
        (focus !== null && !touchesFocus && !pathKeys)
      const emphasised = onPath || touchesFocus
      visual.emphasised = emphasised
      // A tinted edge that nothing else is quietening comes forward with its
      // value, so the bronze reads even on the faint cross-cluster flows.
      const value = edgeValue(visual.edge.weight)
      const base = visual.aggregate
        ? flowResting(visual.edge.weight)
        : (visual.crossing ? 0.055 : 0.09) + 0.085 * value
      const resting = Math.max(base, 0.08 + 0.28 * this.edgeTintOf(visual))
      visual.opacity.target = dimmed ? 0.012 + 0.008 * value
        : emphasised ? 0.22 + 0.16 * value
        : resting
      this.applyEdgeColour(visual)
    }
    for (const visual of this.edgeVisuals) emphasiseEdge(visual)
    for (const visual of this.flowVisuals) emphasiseEdge(visual)

    // A hub keeps its presence when nothing has focus, when it is the focus,
    // or when one of its flows reaches the focused party; otherwise it recedes
    // like any other mark outside the neighbourhood.
    for (const hub of this.hubs.values()) {
      let dimmed: boolean
      if (pathKeys) {
        let onPath = false
        for (const flow of hub.flows) if (pathKeys.has(flow.key)) onPath = true
        dimmed = !onPath
      } else if (focus !== null && hub.id !== focus) {
        let touches = false
        for (const flow of hub.flows) if (flow.edge.target === focus) touches = true
        dimmed = !touches
      } else {
        dimmed = false
      }
      hub.opacity.target = dimmed ? 0.3 : 1
      hub.scale.target = hub.group === this.hoveredHub ? 1.1 : 1
    }
    this.updatePopup()
    this.renderDirty = true
  }

  /**
   * Fill and show the hover card for the hovered node or hub, or hide it. The
   * card is for scouting - the info card already tells the selected node's
   * story, so a hovered node that is also selected shows nothing.
   */
  private updatePopup() {
    const visual = this.hoveredId ? this.nodeVisuals.get(this.hoveredId) : undefined
    const hub = !visual && this.hoveredHub !== null ? this.hubs.get(this.hoveredHub) : undefined
    if ((!visual && !hub) || (visual && visual.node.id === this.emphasis.selectedId)) {
      this.popup.style.display = 'none'
      return
    }
    this.popupMeta.replaceChildren()
    const dot = document.createElement('span')
    dot.className = 'rp-map3d-popup-dot'
    const category = document.createElement('span')
    if (hub) {
      this.popupName.textContent = hub.group.charAt(0).toUpperCase() + hub.group.slice(1)
      dot.style.background = `#${hub.anchor.colour.getHexString()}`
      category.textContent = 'industry cluster'
      category.style.color = hub.ink
      const parties = hub.flows.length
      this.popupCounts.textContent = `${formatMoney(hub.total)} · ${hub.count} donors · ${
        parties === 1 ? '1 party' : `${parties} parties`
      }`
      this.popupHint.textContent = 'Click to open the cluster'
    } else if (visual) {
      const node = visual.node
      this.popupName.textContent = node.label
      dot.style.background = `#${visual.colour.getHexString()}`
      category.textContent = node.kind === 'party'
        ? 'political party'
        : (node.industry ?? node.group).replace(/_/g, ' ')
      category.style.color = this.palette.inks[visual.slot] ?? '#5A616B'
      const links = visual.degree === 1 ? '1' : `${visual.degree}`
      const who = node.kind === 'party'
        ? (visual.degree === 1 ? '1 donor shown' : `${links} donors shown`)
        : (visual.degree === 1 ? '1 party' : `${links} parties`)
      this.popupCounts.textContent = node.total !== undefined
        ? `${formatMoney(node.total)} · ${who}`
        : who
      this.popupHint.textContent = 'Click for details'
    }
    this.popupMeta.append(dot, category)
    // Kept as the layer's last child so it rides above every label.
    this.labelLayer.appendChild(this.popup)
    this.popup.style.display = 'block'
    this.positionPopup()
  }

  /** Pin the card beside the hovered mark, flipped inside the canvas edges. */
  private positionPopup() {
    if (this.popup.style.display === 'none') return
    const visual = this.hoveredId ? this.nodeVisuals.get(this.hoveredId) : undefined
    const hub = !visual && this.hoveredHub !== null ? this.hubs.get(this.hoveredHub) : undefined
    const anchor: EdgeAnchor | undefined = visual ?? hub?.anchor
    if (!anchor) {
      this.popup.style.display = 'none'
      return
    }
    this.labelVec.copy(anchor.pos).project(this.camera)
    if (this.labelVec.z > 1 || this.labelVec.z < -1) {
      this.popup.style.display = 'none'
      return
    }
    const sx = (this.labelVec.x * 0.5 + 0.5) * this.width
    const sy = (-this.labelVec.y * 0.5 + 0.5) * this.height
    const camDist = anchor.pos.distanceTo(this.camera.position)
    const halfTan = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
    const lift = visual ? visual.lift.current : 0
    const screenR = ((anchor.r * anchor.scale.current * (this.height / 2)) /
      (camDist * halfTan)) * (1 + lift * 0.15)
    const w = this.popup.offsetWidth
    const h = this.popup.offsetHeight
    let x = sx + screenR + 16
    if (x + w > this.width - 8) x = sx - screenR - 16 - w
    const y = Math.max(8, Math.min(this.height - h - 8, sy - h / 2))
    this.popup.style.transform = `translate(${Math.max(8, x).toFixed(1)}px, ${y.toFixed(1)}px)`
  }

  // -------------------------------------------------------------------
  // View - fit, focus, zoom, insets.
  // -------------------------------------------------------------------

  setInsets(insets: Insets) {
    this.insets = insets
  }

  get viewOwned(): boolean {
    return this.viewOwnedFlag
  }

  /**
   * True while the view is the one a focus move put there and the reader has
   * not touched it since - what lets the map give the space back when the
   * panel that caused the move goes away, without overriding a reader who
   * has moved on.
   */
  get focusOwned(): boolean {
    return this.focusOwnedFlag
  }

  private claimView() {
    this.tween = null
    this.viewOwnedFlag = true
    this.focusOwnedFlag = false
    this.idleSpin = false
  }

  /**
   * A dolly by the reader (wheel, pinch, the zoom buttons) or a fit hands
   * every opened cluster back to the automatic rule. Orbiting does not: a
   * reader turning a just-opened cluster around must not watch it refold.
   */
  private releaseDives() {
    for (const hub of this.hubs.values()) hub.dived = false
  }

  /** The part of the canvas the floating panels leave free, in pixels. */
  private freeBox() {
    const w = Math.max(1, this.width - this.insets.left - this.insets.right)
    const h = Math.max(1, this.height - this.insets.top - this.insets.bottom)
    return {
      w,
      h,
      cx: this.insets.left + w / 2,
      cy: this.insets.top + h / 2,
    }
  }

  /**
   * The camera distance at which a sphere of the given radius fits the free
   * box, and the world-space offset that shifts the camera target so the
   * subject lands in the box's centre rather than the canvas's.
   */
  private frameFor(radius: number) {
    const box = this.freeBox()
    const vHalf = THREE.MathUtils.degToRad(FOV / 2)
    const heightShare = Math.max(0.2, box.h / this.height)
    const widthShare = Math.max(0.2, box.w / this.width)
    const vLimit = Math.atan(Math.tan(vHalf) * heightShare * 0.9)
    const hLimit = Math.atan(Math.tan(vHalf) * this.camera.aspect * widthShare * 0.9)
    const dist = radius / Math.tan(Math.min(vLimit, hLimit))
    return { box, dist }
  }

  /** World units per screen pixel at the given camera distance. */
  private worldPerPixel(dist: number): number {
    return (2 * dist * Math.tan(THREE.MathUtils.degToRad(FOV / 2))) / this.height
  }

  private offsetRight = new THREE.Vector3()
  private offsetUp = new THREE.Vector3()
  private offsetForward = new THREE.Vector3()
  private offsetOut = new THREE.Vector3()

  /**
   * Shift a target so `point` projects at the free box's centre. Returns a
   * scratch vector (the idle sway calls this every frame): copy it before
   * the next call if it has to outlive one.
   */
  private offsetTarget(point: THREE.Vector3, dist: number): THREE.Vector3 {
    const box = this.freeBox()
    const wpp = this.worldPerPixel(dist)
    const ox = box.cx - this.width / 2
    const oy = box.cy - this.height / 2
    this.camera.matrixWorld.extractBasis(this.offsetRight, this.offsetUp, this.offsetForward)
    return this.offsetOut.copy(point)
      .addScaledVector(this.offsetRight, -ox * wpp)
      .addScaledVector(this.offsetUp, oy * wpp)
  }

  fit(animate = true) {
    this.tween = null
    this.viewOwnedFlag = false
    this.focusOwnedFlag = false
    this.releaseDives()
    if (this.nodeVisuals.size === 0) return
    this.updateWorldBounds()
    this.updateCamera()
    const dist = this.fitDistance()
    this.fitDist = dist
    const target = this.offsetTarget(this.fitCentre, dist).clone()
    const to: View = {
      target,
      theta: this.view.theta,
      phi: this.view.phi,
      dist,
    }
    this.moveView(to, animate ? FIT_MS : 0)
  }

  /**
   * The azimuth from which the cluster ring reads best: the candidate that
   * maximises the worst pairwise on-screen separation of the territory
   * centres, each distance normalised by the pair's blob radii so a large
   * pair is allowed to sit closer than two small ones.
   */
  private bestTheta(centres: Map<string, Centre3D>): number {
    const phi = this.view.phi
    const list = [...centres.values()]
    let best = this.view.theta
    let bestScore = -Infinity
    for (let step = 0; step < 36; step++) {
      const theta = (step / 36) * Math.PI * 2
      // Screen-plane basis at this azimuth: right in the ground plane, up
      // tilted by the elevation.
      const rx = Math.cos(theta)
      const rz = -Math.sin(theta)
      const upScale = Math.cos(phi)
      let score = Infinity
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i]
          const b = list[j]
          if (!a || !b) continue
          const dx = (a.x - b.x) * rx + (a.z - b.z) * rz
          const du = (a.y - b.y) * Math.sin(phi) -
            ((a.x - b.x) * -rz + (a.z - b.z) * rx) * upScale
          const separation = Math.hypot(dx, du) / (a.r + b.r)
          if (separation < score) score = separation
        }
      }
      if (score > bestScore) {
        bestScore = score
        best = theta
      }
    }
    return best
  }

  /** The point the last fit framed: the scene's extents' midpoint, not its centroid. */
  private fitCentre = new THREE.Vector3()
  private fitMidR = 0
  private fitMidU = 0

  /**
   * The distance at which every node and every cluster caption fits the
   * free box at the CURRENT orientation, with fitCentre set to the point to
   * frame. A 3D bounding sphere would be rotation-proof but wasteful: from
   * the map's natural elevation the cluster ring is far wider than it is
   * deep on screen, and a sphere fit strands half the canvas. Two passes:
   * the first, about the centroid, measures the scene's extents at the
   * distance it finds; the second re-solves about their midpoint, so both
   * sides of the plate bind and neither is left slack. The idle sway calls
   * this every frame it turns, which is what keeps the framing tight and
   * the clusters on the plate as the ring moves.
   */
  private fitDistance(): number {
    const { theta, phi } = this.view
    this.fitCentre.copy(this.worldCentre)
    this.fitDistanceAt(theta, phi, true)
    this.fitCentre
      .addScaledVector(this.fitVecRight, this.fitMidR)
      .addScaledVector(this.fitVecUp, this.fitMidU)
    return this.fitDistanceAt(theta, phi, false)
  }

  private fitVecE = new THREE.Vector3()
  private fitVecRight = new THREE.Vector3()
  private fitVecUp = new THREE.Vector3()
  private fitVecD = new THREE.Vector3()

  /**
   * Each node constrains the camera along its own line of sight -
   * dist >= lateral / tan(halfAngle) + depth. A caption is set in screen
   * pixels, so its extent GROWS with the distance (px * worldPerPixel(dist));
   * the same inequality with that term solves in closed form to
   * dist >= (lateral / tan + depth) / (1 - px * k / tan), k being world
   * units per pixel per unit of distance. With `measure`, the shift of the
   * frame centre that balances the two sides is recorded as fitMidR and
   * fitMidU (in this orientation's screen basis): each side's binding
   * quantity is extent + tan * depth, not the bare extent, so the balance
   * point is half the difference of the two one-sided maxima of that.
   */
  private fitDistanceAt(theta: number, phi: number, measure: boolean): number {
    // The basis the view will have, from the same spherical coordinates
    // updateCamera uses; e points from the target towards the camera.
    const e = this.fitVecE.set(
      Math.sin(phi) * Math.sin(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.cos(theta),
    )
    const right = this.fitVecRight.crossVectors(this.edgeUp, e)
    if (right.lengthSq() < 0.001) right.set(1, 0, 0)
    right.normalize()
    const up = this.fitVecUp.crossVectors(e, right)
    const box = this.freeBox()
    const vHalf = THREE.MathUtils.degToRad(FOV / 2)
    const tanH = Math.tan(vHalf) * this.camera.aspect * Math.max(0.2, box.w / this.width) * 0.92
    const tanV = Math.tan(vHalf) * Math.max(0.2, box.h / this.height) * 0.92
    const k = (2 * Math.tan(vHalf)) / this.height
    const centre = this.fitCentre
    const d = this.fitVecD
    let dist = 240
    // One-sided maxima of extent + tan * depth, per screen axis.
    let plusR = -Infinity
    let minusR = -Infinity
    let plusU = -Infinity
    let minusU = -Infinity
    for (const visual of this.nodeVisuals.values()) {
      d.set(visual.sim.x, visual.sim.y, visual.sim.z).sub(centre)
      const depth = d.dot(e)
      const pr = d.dot(right)
      const pu = d.dot(up)
      const lx = Math.abs(pr) + visual.r
      // Headroom for the labels above the marks - above only, so the frame
      // reserves no phantom room below the near side.
      const ly = Math.max(pu + visual.r + 26, -pu + visual.r)
      dist = Math.max(dist, lx / tanH + depth, ly / tanV + depth)
      if (measure) {
        const dh = tanH * depth
        const dv = tanV * depth
        if (pr + visual.r + dh > plusR) plusR = pr + visual.r + dh
        if (-pr + visual.r + dh > minusR) minusR = -pr + visual.r + dh
        if (pu + visual.r + 26 + dv > plusU) plusU = pu + visual.r + 26 + dv
        if (-pu + visual.r + dv > minusU) minusU = -pu + visual.r + dv
      }
    }
    // Captions: centred on the cluster, half a caption wide to either side,
    // and a caption tall above the territory's rim (above, where the
    // placement pass puts it first; the nodes already hold the side below).
    const tall = CAPTION_H + 5 + PLATE_INSET
    const fracV = (tall * k) / tanV
    for (const territory of this.territories) {
      d.copy(territory.centre).sub(centre)
      const depth = d.dot(e)
      const halfW = Math.max(territory.captionW, territory.captionHubW) / 2 + 4 + PLATE_INSET
      const fracH = (halfW * k) / tanH
      if (fracH < 0.9) {
        dist = Math.max(dist, (Math.abs(d.dot(right)) / tanH + depth) / (1 - fracH))
      }
      const top = d.dot(up) + territory.r
      if (fracV < 0.9 && top > 0) {
        dist = Math.max(dist, (top / tanV + depth) / (1 - fracV))
      }
    }
    if (measure) {
      // The captions' extents are only known once the distance is.
      for (const territory of this.territories) {
        d.copy(territory.centre).sub(centre)
        const depth = d.dot(e)
        const pr = d.dot(right)
        const pu = d.dot(up)
        const halfW = (Math.max(territory.captionW, territory.captionHubW) / 2 + 4 + PLATE_INSET) * k * dist
        const dh = tanH * depth
        if (pr + halfW + dh > plusR) plusR = pr + halfW + dh
        if (-pr + halfW + dh > minusR) minusR = -pr + halfW + dh
        const top = pu + territory.r + tall * k * dist + tanV * depth
        if (top > plusU) plusU = top
      }
      this.fitMidR = Number.isFinite(plusR) && Number.isFinite(minusR) ? (plusR - minusR) / 2 : 0
      this.fitMidU = Number.isFinite(plusU) && Number.isFinite(minusU) ? (plusU - minusU) / 2 : 0
    }
    return dist
  }

  /**
   * Move the view so a node sits in the middle of the space the panels leave
   * free, close enough that its neighbourhood reads. Returns the distance it
   * settled on (for the follow-up pass when a panel finishes measuring), or
   * null when the node is already comfortably in view - moving the map under
   * someone who can see what they clicked is worse than doing nothing.
   */
  focusOn(id: string, keepDist: number | null): number | null {
    const visual = this.nodeVisuals.get(id)
    if (!visual) return null
    this.updateCamera()
    const point = new THREE.Vector3(visual.sim.x, visual.sim.y, visual.sim.z)
    const box = this.freeBox()

    const projected = point.clone().project(this.camera)
    const sx = (projected.x * 0.5 + 0.5) * this.width
    const sy = (-projected.y * 0.5 + 0.5) * this.height
    const marginX = Math.min(90, box.w * 0.18)
    const marginY = Math.min(90, box.h * 0.18)
    const settled = projected.z < 1 &&
      sx > this.insets.left + marginX && sx < this.insets.left + box.w - marginX &&
      sy > this.insets.top + marginY && sy < this.insets.top + box.h - marginY
    // A node inside a folded cluster is "in view" only as a hub: the fold
    // rule is about to open its cluster, and the camera should go with it.
    const folded = visual.territory?.hub?.lodTarget === 1
    if (settled && this.insets.bottom <= 0 && !folded) return null

    let dist = keepDist
    if (dist === null) {
      let span = visual.r + 30
      let neighbours = 0
      for (const edgeVisual of this.edgeVisuals) {
        const otherId = edgeVisual.edge.source === id
          ? edgeVisual.edge.target
          : edgeVisual.edge.target === id
          ? edgeVisual.edge.source
          : null
        if (otherId === null) continue
        const other = this.nodeVisuals.get(otherId)
        if (!other) continue
        neighbours++
        const d = Math.hypot(
          other.sim.x - visual.sim.x,
          other.sim.y - visual.sim.y,
          other.sim.z - visual.sim.z,
        ) + other.r
        if (d > span) span = d
      }
      const { dist: fits } = this.frameFor(span * 1.12)
      // Hubs (a major party with hundreds of flows) need the whole
      // neighbourhood in frame: lift the ceiling with the log of the degree
      // and allow zooming OUT for them. The never-zoom-out rule (mirroring
      // the 2D map) only guards nodes with a handful of neighbours.
      const hub = neighbours >= 40
      const ceiling = hub ? FOCUS_MAX_DIST * (1 + Math.log10(neighbours / 20)) : FOCUS_MAX_DIST
      const fitted = Math.max(FOCUS_MIN_DIST, Math.min(ceiling, fits))
      dist = hub ? fitted : Math.min(this.view.dist, fitted)
    }
    dist = Math.max(this.minDist(), Math.min(this.maxDist(), dist))

    const target = this.offsetTarget(point, dist)
    this.moveView(
      { target, theta: this.view.theta, phi: this.view.phi, dist },
      FOCUS_MS,
    )
    this.viewOwnedFlag = true
    this.focusOwnedFlag = true
    this.idleSpin = false
    return dist
  }

  /**
   * A panel came or went with nothing selected: slide the view by half the
   * change so whatever was centred stays centred, rather than snapping back.
   */
  nudgeForInsets(dxPx: number, dyPx: number) {
    if (dxPx === 0 && dyPx === 0) return
    const wpp = this.worldPerPixel(this.view.dist)
    const right = new THREE.Vector3()
    const up = new THREE.Vector3()
    const forward = new THREE.Vector3()
    this.camera.matrixWorld.extractBasis(right, up, forward)
    const target = this.view.target.clone()
      .addScaledVector(right, -dxPx * wpp)
      .addScaledVector(up, dyPx * wpp)
    this.moveView({ ...this.view, target }, FOCUS_MS)
  }

  zoomBy(factor: number) {
    this.claimView()
    this.releaseDives()
    this.distGoal = Math.max(this.minDist(), Math.min(this.maxDist(), this.distGoal / factor))
  }

  private minDist(): number {
    return Math.max(60, this.fitDist * MIN_DIST_FACTOR)
  }

  private maxDist(): number {
    return this.fitDist * MAX_DIST_FACTOR
  }

  private moveView(to: View, duration: number) {
    if (this.reduced || duration <= 0) {
      this.view = { ...to, target: to.target.clone() }
      this.distGoal = to.dist
      this.tween = null
      this.renderDirty = true
      return
    }
    this.tween = {
      from: { ...this.view, target: this.view.target.clone() },
      to: { ...to, target: to.target.clone() },
      started: performance.now(),
      duration,
    }
    this.distGoal = to.dist
  }

  // -------------------------------------------------------------------
  // Pointer input - orbit, pan, pinch, node drag, hover, click.
  // -------------------------------------------------------------------

  private bindPointerHandlers() {
    const canvas = this.canvas
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointercancel', this.onPointerUp)
    canvas.addEventListener('pointerleave', this.onPointerLeave)
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    canvas.addEventListener('contextmenu', this.onContextMenu)
    canvas.addEventListener('keydown', this.onKeyDown)
  }

  private unbindPointerHandlers() {
    const canvas = this.canvas
    canvas.removeEventListener('pointerdown', this.onPointerDown)
    canvas.removeEventListener('pointermove', this.onPointerMove)
    canvas.removeEventListener('pointerup', this.onPointerUp)
    canvas.removeEventListener('pointercancel', this.onPointerUp)
    canvas.removeEventListener('pointerleave', this.onPointerLeave)
    canvas.removeEventListener('wheel', this.onWheel)
    canvas.removeEventListener('contextmenu', this.onContextMenu)
    canvas.removeEventListener('keydown', this.onKeyDown)
  }

  private localPoint(event: PointerEvent | WheelEvent) {
    const rect = this.canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  /**
   * Pointer capture can throw (NotFoundError) for a pointer the browser no
   * longer considers active - synthetic events, or a touch that ended while
   * the handler ran. Losing capture is cosmetic; aborting the handler and
   * stranding half-initialised gesture state is not, so both calls are
   * fenced.
   */
  private capturePointer(pointerId: number) {
    try {
      this.canvas.setPointerCapture?.(pointerId)
    } catch {
      // Capture is best-effort.
    }
  }

  private releasePointer(pointerId: number) {
    try {
      this.canvas.releasePointerCapture?.(pointerId)
    } catch {
      // Already released.
    }
  }

  private raycastVec = new THREE.Vector3()

  /**
   * Picking is analytic - a ray/sphere test against the SIM positions - not
   * a mesh raycast. Mesh matrixWorld is only current after a rendered frame,
   * and a tab whose rAF is throttled (backgrounded, just restored, headless)
   * has painted nothing yet: a mesh raycast there tests unit spheres at the
   * origin and every pick silently misses. The sim positions and the view
   * are always current, so this path cannot go stale. Dimmed marks stay
   * clickable, exactly as in 2D.
   */
  /** The last pick's result - fields, not a returned object, so a hover test allocates nothing. */
  private pickedNode: NodeVisual | null = null
  private pickedHub: HubVisual | null = null

  /**
   * Picking is analytic - a ray/sphere test against the rendered positions -
   * not a mesh raycast. Mesh matrixWorld is only current after a rendered
   * frame, and a tab whose rAF is throttled (backgrounded, just restored,
   * headless) has painted nothing yet: a mesh raycast there tests unit
   * spheres at the origin and every pick silently misses. The positions and
   * the view are always current, so this path cannot go stale. Dimmed marks
   * stay clickable, exactly as in 2D. Folded dots give way to their hub.
   * The winner lands in pickedNode / pickedHub (never both).
   */
  private pick(x: number, y: number) {
    // The camera may not have been placed yet this frame (or ever, in a
    // throttled tab) - derive it from the view before casting.
    this.updateCamera()
    this.raycaster.setFromCamera(
      new THREE.Vector2((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1),
      this.camera,
    )
    const origin = this.raycaster.ray.origin
    const dir = this.raycaster.ray.direction
    const toCentre = this.raycastVec
    let bestNode: NodeVisual | null = null
    let bestHub: HubVisual | null = null
    let bestAlong = Infinity
    const test = (pos: THREE.Vector3, r: number): number | null => {
      toCentre.copy(pos).sub(origin)
      const along = toCentre.dot(dir)
      if (along < 0) return null
      const missSq = toCentre.lengthSq() - along * along
      if (missSq > r * r) return null
      // Rank by where the ray ENTERS the sphere, so a small mark in front
      // beats the big one behind it - the same order a mesh raycast reports.
      const entry = along - Math.sqrt(r * r - missSq)
      if (entry < this.camera.near || entry >= bestAlong) return null
      return entry
    }
    for (const visual of this.nodeVisuals.values()) {
      const hub = visual.territory?.hub
      if (hub && hub.lod >= 0.5) continue
      // The resting radius, not the animated scale: mid-entrance nodes are
      // visually small but should be pickable at full size.
      const entry = test(visual.pos, visual.r)
      if (entry === null) continue
      bestNode = visual
      bestHub = null
      bestAlong = entry
    }
    for (const hub of this.hubs.values()) {
      if (hub.lod < 0.5) continue
      const entry = test(hub.anchor.pos, hub.anchor.r * hub.anchor.scale.current)
      if (entry === null) continue
      bestHub = hub
      bestNode = null
      bestAlong = entry
    }
    this.pickedNode = bestNode
    this.pickedHub = bestHub
  }

  private raycastNode(x: number, y: number): NodeVisual | null {
    this.pick(x, y)
    return this.pickedNode
  }

  /** How much of an edge its cluster's fold leaves visible: 1 - lod for a donor's own flow, lod for a hub's. */
  private edgeFold(visual: EdgeVisual): number {
    const hub = visual.hub
    if (!hub) return 1
    return visual.aggregate ? hub.lod : 1 - hub.lod
  }

  private pickVecA = new THREE.Vector3()
  private pickVecB = new THREE.Vector3()

  /**
   * The edge nearest a click, tested in SCREEN space (point-to-segment
   * distance against the projected endpoints) so a thin tube is as easy to
   * hit as it is to see. Same position discipline as pick() - no dependence
   * on rendered mesh state. Invisible edges never pick; aggregated flows
   * pick like any other.
   */
  private pickEdge(x: number, y: number, threshold = 9): EdgeVisual | null {
    this.updateCamera()
    let best: EdgeVisual | null = null
    let bestD = threshold
    const a = this.pickVecA
    const b = this.pickVecB
    const consider = (visual: EdgeVisual) => {
      // Gate on the INTENDED opacity: `current` only animates while frames
      // run, so a throttled tab would report every edge invisible (the same
      // trap pick() avoids by using positions).
      if (Math.max(visual.opacity.current, visual.opacity.target) < 0.05) return
      if (this.edgeFold(visual) < 0.5) return
      a.copy(visual.from.pos).project(this.camera)
      b.copy(visual.to.pos).project(this.camera)
      if ((a.z > 1 && b.z > 1) || (a.z < -1 && b.z < -1)) return
      const ax = (a.x * 0.5 + 0.5) * this.width
      const ay = (-a.y * 0.5 + 0.5) * this.height
      const bx = (b.x * 0.5 + 0.5) * this.width
      const by = (-b.y * 0.5 + 0.5) * this.height
      const dx = bx - ax
      const dy = by - ay
      const lenSq = dx * dx + dy * dy
      const t = lenSq > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lenSq)) : 0
      const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy))
      if (d < bestD) {
        bestD = d
        best = visual
      }
    }
    for (const visual of this.edgeVisuals) consider(visual)
    for (const visual of this.flowVisuals) consider(visual)
    return best
  }

  private onPointerDown = (event: PointerEvent) => {
    const point = this.localPoint(event)
    this.pointers.set(event.pointerId, point)
    this.capturePointer(event.pointerId)

    if (this.pointers.size === 2) {
      // A second finger ends whatever one finger had started.
      this.orbit = null
      this.releaseDrag()
      const [a, b] = [...this.pointers.entries()]
      if (a && b) {
        this.claimView()
        this.releaseDives()
        this.pinch = {
          a: a[0],
          b: b[0],
          gap: Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y),
          dist: this.view.dist,
          midX: (a[1].x + b[1].x) / 2,
          midY: (a[1].y + b[1].y) / 2,
        }
      }
      return
    }
    if (this.pointers.size > 2 || this.pinch) return
    // A press means the reader is acting, not scouting - the hover card and
    // lift depart before the gesture starts.
    this.setHovered(null)

    if (event.button === 0) this.pick(point.x, point.y)
    else {
      this.pickedNode = null
      this.pickedHub = null
    }
    const hit = this.pickedNode
    if (hit && this.sim) {
      // Drag the node on a camera-facing plane through it, so the motion
      // follows the pointer exactly at any orbit angle.
      const forward = new THREE.Vector3()
      this.camera.getWorldDirection(forward)
      const origin = new THREE.Vector3(hit.sim.x, hit.sim.y, hit.sim.z)
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(forward, origin)
      this.drag = {
        id: hit.node.id,
        plane,
        moved: false,
        lastX: point.x,
        lastY: point.y,
        travel: 0,
      }
      // A drag plane fixed at pointerdown under a still-drifting camera makes
      // the held node crawl away from the pointer - the drift stops here,
      // without claiming the whole view the way a pan or zoom does.
      this.idleSpin = false
      this.sim.reheat()
      return
    }
    // A press on a hub orbits if it travels and opens the cluster if it
    // does not - hubs are landmarks to grab the view by as much as targets.
    this.orbit = {
      mode: event.button === 2 || event.button === 1 || event.shiftKey ? 'pan' : 'orbit',
      lastX: point.x,
      lastY: point.y,
      moved: 0,
      hub: this.pickedHub ? this.pickedHub.group : null,
    }
    this.canvas.style.cursor = 'grabbing'
  }

  private onPointerMove = (event: PointerEvent) => {
    const point = this.localPoint(event)
    if (this.pointers.has(event.pointerId)) this.pointers.set(event.pointerId, point)

    const pinch = this.pinch
    if (pinch) {
      const a = this.pointers.get(pinch.a)
      const b = this.pointers.get(pinch.b)
      if (!a || !b) return
      const gap = Math.hypot(a.x - b.x, a.y - b.y)
      if (gap > 0 && pinch.gap > 0) {
        const next = Math.max(
          this.minDist(),
          Math.min(this.maxDist(), pinch.dist * (pinch.gap / gap)),
        )
        this.view.dist = next
        this.distGoal = next
      }
      const midX = (a.x + b.x) / 2
      const midY = (a.y + b.y) / 2
      this.panBy(midX - pinch.midX, midY - pinch.midY)
      pinch.midX = midX
      pinch.midY = midY
      this.renderDirty = true
      return
    }

    const drag = this.drag
    if (drag && this.sim) {
      // A press only becomes a drag after real travel - browsers fire
      // sub-pixel pointermoves during a plain click, and a single one must
      // not consume the selection (the same 3px threshold the orbit uses).
      drag.travel += Math.abs(point.x - drag.lastX) + Math.abs(point.y - drag.lastY)
      drag.lastX = point.x
      drag.lastY = point.y
      if (drag.travel <= 3) return
      drag.moved = true
      this.raycaster.setFromCamera(
        new THREE.Vector2((point.x / this.width) * 2 - 1, -(point.y / this.height) * 2 + 1),
        this.camera,
      )
      const hitPoint = new THREE.Vector3()
      if (this.raycaster.ray.intersectPlane(drag.plane, hitPoint)) {
        this.sim.pin(drag.id, hitPoint.x, hitPoint.y, hitPoint.z)
      }
      return
    }

    const orbit = this.orbit
    if (orbit) {
      const dx = point.x - orbit.lastX
      const dy = point.y - orbit.lastY
      orbit.moved += Math.abs(dx) + Math.abs(dy)
      orbit.lastX = point.x
      orbit.lastY = point.y
      if (orbit.moved > 3) this.claimView()
      if (orbit.mode === 'pan') this.panBy(dx, dy)
      else {
        this.view.theta -= dx * 0.005
        this.view.phi = Math.max(PHI_MIN, Math.min(PHI_MAX, this.view.phi - dy * 0.005))
      }
      this.renderDirty = true
      return
    }

    this.hoverPos = point
    this.hoverDirty = true
  }

  private panBy(dxPx: number, dyPx: number) {
    const wpp = this.worldPerPixel(this.view.dist)
    const right = new THREE.Vector3()
    const up = new THREE.Vector3()
    const forward = new THREE.Vector3()
    this.camera.matrixWorld.extractBasis(right, up, forward)
    this.view.target.addScaledVector(right, -dxPx * wpp).addScaledVector(up, dyPx * wpp)
  }

  private releaseDrag() {
    const drag = this.drag
    if (!drag) return
    this.sim?.unpin(drag.id)
    this.sim?.cool()
    // No gesture guard here: a drag's own pointerup is consumed inside the
    // drag branch, so flagging it would swallow the reader's NEXT click.
    // Only a pinch leaves a browser-synthesised click behind to guard against.
    this.drag = null
  }

  private onPointerUp = (event: PointerEvent) => {
    const point = this.localPoint(event)
    this.pointers.delete(event.pointerId)
    this.releasePointer(event.pointerId)

    if (this.pinch) {
      if (this.pointers.size < 2) {
        this.pinch = null
        this.gestured = true
      }
      return
    }

    const drag = this.drag
    if (drag) {
      const moved = drag.moved
      this.releaseDrag()
      if (!moved) {
        // A press on a node that never moved is a selection.
        this.onSelect(drag.id)
      }
      return
    }

    const orbit = this.orbit
    this.orbit = null
    this.canvas.style.cursor = 'grab'
    if (orbit && orbit.moved <= 3) {
      // The pointer went down and came back up in place: a click. The click
      // some browsers synthesise after a pinch must not clear the selection.
      if (this.gestured) {
        this.gestured = false
        return
      }
      if (orbit.hub !== null) {
        this.diveInto(orbit.hub)
        return
      }
      const hit = this.raycastNode(point.x, point.y)
      if (hit) {
        this.onSelect(hit.node.id)
      } else if (this.pickedHub) {
        this.diveInto(this.pickedHub.group)
      } else {
        // A miss can still land on an edge - the flow between two nodes is a
        // selectable fact of its own.
        const edge = this.onEdgePick ? this.pickEdge(point.x, point.y) : null
        if (edge) {
          this.onEdgePick?.(edge.edge)
        } else if (
          this.emphasis.selectedId === null && this.emphasis.pathEdges === null &&
          this.view.dist < this.fitDist * 0.9
        ) {
          // Nothing to clear and the view is inside a cluster: empty space
          // is the way back out, and the clusters refold on the way.
          this.fit(true)
        } else {
          this.onSelect(null)
        }
      }
    }
    this.gestured = false
  }

  private onPointerLeave = () => {
    this.hoverPos = null
    this.setHovered(null)
  }

  private onWheel = (event: WheelEvent) => {
    event.preventDefault()
    this.claimView()
    this.releaseDives()
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12
    this.distGoal = Math.max(this.minDist(), Math.min(this.maxDist(), this.distGoal / factor))
  }

  private onContextMenu = (event: Event) => {
    event.preventDefault()
  }

  /**
   * The entity closest to the middle of the free box - what Enter selects.
   * Orbiting with the arrows re-aims it, so the keyboard can reach anything
   * visible; the navigator rail and the find field cover the rest by name.
   */
  private centremost() {
    const box = this.freeBox()
    let bestD = Infinity
    const v = this.labelVec
    this.pickedNode = null
    this.pickedHub = null
    const consider = (pos: THREE.Vector3): boolean => {
      v.copy(pos).project(this.camera)
      if (v.z > 1 || v.z < -1) return false
      const sx = (v.x * 0.5 + 0.5) * this.width
      const sy = (-v.y * 0.5 + 0.5) * this.height
      if (sx < 0 || sx > this.width || sy < 0 || sy > this.height) return false
      const d = Math.hypot(sx - box.cx, sy - box.cy)
      if (d >= bestD) return false
      bestD = d
      return true
    }
    for (const visual of this.nodeVisuals.values()) {
      const hub = visual.territory?.hub
      if (hub && hub.lod >= 0.5) continue
      if (consider(visual.pos)) {
        this.pickedNode = visual
        this.pickedHub = null
      }
    }
    for (const hub of this.hubs.values()) {
      if (hub.lod < 0.5) continue
      if (consider(hub.anchor.pos)) {
        this.pickedHub = hub
        this.pickedNode = null
      }
    }
  }

  /** Keyboard access: arrows orbit, plus and minus zoom, Enter selects (or opens a hub). */
  private onKeyDown = (event: KeyboardEvent) => {
    const step = 0.15
    switch (event.key) {
      case 'Enter':
      case ' ': {
        this.centremost()
        if (this.pickedHub) this.diveInto(this.pickedHub.group)
        else if (this.pickedNode) this.onSelect(this.pickedNode.node.id)
        break
      }
      case 'ArrowLeft':
        this.claimView()
        this.view.theta += step
        break
      case 'ArrowRight':
        this.claimView()
        this.view.theta -= step
        break
      case 'ArrowUp':
        this.claimView()
        this.view.phi = Math.max(PHI_MIN, this.view.phi - step)
        break
      case 'ArrowDown':
        this.claimView()
        this.view.phi = Math.min(PHI_MAX, this.view.phi + step)
        break
      case '+':
      case '=':
        this.zoomBy(1.3)
        break
      case '-':
        this.zoomBy(1 / 1.3)
        break
      default:
        return
    }
    event.preventDefault()
    this.renderDirty = true
  }

  // -------------------------------------------------------------------
  // Frame loop.
  // -------------------------------------------------------------------

  private handleResize() {
    const parent = this.canvas.parentElement
    if (!parent) return
    const rect = parent.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return
    this.width = rect.width
    this.height = rect.height
    this.renderer.setSize(rect.width, rect.height, false)
    this.camera.aspect = rect.width / rect.height
    this.camera.updateProjectionMatrix()
    if (!this.viewOwnedFlag && this.nodeVisuals.size > 0) this.fit(false)
    this.renderDirty = true
  }

  private stepFades(dt: number): boolean {
    // Exponential approach: reads as the same cross-fade the 2D map does with
    // its 180ms opacity transition.
    const rate = this.reduced ? 1 : 1 - Math.exp(-dt / 110)
    let active = false
    const step = (fade: Fade): number => {
      const delta = fade.target - fade.current
      if (Math.abs(delta) < 0.004) {
        fade.current = fade.target
        return fade.current
      }
      active = true
      fade.current += delta * rate
      return fade.current
    }
    const now = performance.now()
    for (const visual of this.nodeVisuals.values()) {
      if (visual.bornAt > 0 && now < visual.bornAt) {
        active = true
      } else {
        visual.bornAt = 0
        step(visual.scale)
      }
      step(visual.opacity)
      step(visual.shellOpacity)
      step(visual.lift)
    }
    for (const visual of this.edgeVisuals) step(visual.opacity)
    for (const visual of this.flowVisuals) step(visual.opacity)
    for (const hub of this.hubs.values()) {
      if (hub.bornAt > 0 && now < hub.bornAt) {
        active = true
      } else {
        hub.bornAt = 0
        step(hub.scale)
      }
      step(hub.opacity)
    }
    for (const halo of this.halos.values()) {
      step(halo.presence)
      step(halo.value)
    }
    return active
  }

  private frame = (now: number) => {
    if (this.disposed || this.paused) return
    this.frameHandle = requestAnimationFrame(this.frame)
    const dt = Math.min(64, now - this.lastFrame)
    this.lastFrame = now
    this.frameCount += 1

    const simWarm = this.sim !== null && (this.sim.alpha() > 0.02 || this.drag !== null)
    if (simWarm) {
      this.sim?.tick(1)
      this.renderDirty = true
    }

    // Camera motion: the focus tween, the smoothed dolly and the idle drift.
    const tween = this.tween
    if (tween) {
      const t = Math.min(1, (now - tween.started) / tween.duration)
      const e = 1 - Math.pow(1 - t, 3)
      this.view.target.lerpVectors(tween.from.target, tween.to.target, e)
      this.view.theta = tween.from.theta + (tween.to.theta - tween.from.theta) * e
      this.view.phi = tween.from.phi + (tween.to.phi - tween.from.phi) * e
      this.view.dist = tween.from.dist * Math.pow(tween.to.dist / tween.from.dist, e)
      if (t >= 1) this.tween = null
      this.renderDirty = true
    } else {
      const distDelta = this.distGoal - this.view.dist
      if (Math.abs(distDelta) > 0.5) {
        this.view.dist += distDelta * (this.reduced ? 1 : Math.min(1, dt / 90))
        this.renderDirty = true
      }
      if (this.idleSpin && this.nodeVisuals.size > 0) {
        this.idlePhase += dt / 1000
        this.view.theta = this.idleAnchor +
          IDLE_SWAY * Math.sin((this.idlePhase / IDLE_SWAY_PERIOD) * Math.PI * 2)
        // The fit holds for one orientation, so the sway re-fits as it
        // turns: the framing stays tight and nothing walks off the plate or
        // under a panel. The change is a few percent over a whole swing.
        if (!this.viewOwnedFlag) {
          this.updateCamera()
          const dist = this.fitDistance()
          this.fitDist = dist
          this.view.dist = dist
          this.distGoal = dist
          this.view.target.copy(this.offsetTarget(this.fitCentre, dist))
        }
        this.renderDirty = true
      }
    }

    if (this.stepFades(dt)) this.renderDirty = true
    const lodActive = this.updateLod(now)
    if (lodActive) this.renderDirty = true

    // A fold in flight changes what is under a still pointer, so the hover
    // test reruns while one is active.
    if ((this.hoverDirty || lodActive) && !this.drag && !this.orbit && !this.pinch) {
      this.hoverDirty = false
      if (this.hoverPos) {
        this.pick(this.hoverPos.x, this.hoverPos.y)
        this.setHover(
          this.pickedNode ? this.pickedNode.node.id : null,
          this.pickedHub ? this.pickedHub.group : null,
        )
      }
    }

    // The travelling dash is intentionally capped at 24fps. It is a quiet
    // directional cue, and repainting it at display refresh rate buys no
    // legibility on a phone. Reduced motion leaves the static gradient and
    // arrowheads in place without keeping the scene alive.
    if (!this.reduced && this.edgeVisuals.length + this.flowVisuals.length > 0 &&
      now - this.lastFlowPaint >= 42) {
      this.lastFlowPaint = now
      this.edgeUniforms.uPhase.value = (now % 7000) / 7000
      this.renderDirty = true
    }

    if (!this.renderDirty) return

    this.renderDirty = false
    this.updateCamera()
    if (simWarm) this.updateTerritories()
    this.updateNodeMeshes()
    this.updateHubMeshes()
    this.updateEdgeMeshes()
    this.updateRings()
    this.renderer.render(this.scene, this.camera)
    this.projectLabels(now)
    if (simWarm || this.tween || lodActive) this.renderDirty = true
  }

  private updateCamera() {
    const { target, theta, phi, dist } = this.view
    const sinPhi = Math.sin(phi)
    this.camera.position.set(
      target.x + dist * sinPhi * Math.sin(theta),
      target.y + dist * Math.cos(phi),
      target.z + dist * sinPhi * Math.cos(theta),
    )
    this.camera.lookAt(target)
    this.camera.updateMatrixWorld()
    // Fog rides the camera so depth always fades at the same visual rate.
    // Gentle: the far side of the map softens into the paper but every mark
    // stays clearly readable at the fitted view - depth is a cue, not a veil.
    this.fog.near = dist + this.worldRadius * 0.35
    this.fog.far = dist + this.worldRadius * 4.4
  }

  private nodeLiftDir = new THREE.Vector3()

  private updateNodeMeshes() {
    for (const visual of this.nodeVisuals.values()) {
      const hub = visual.territory?.hub ?? null
      const lod = hub ? hub.lod : 0
      const pos = visual.pos
      pos.set(visual.sim.x, visual.sim.y, visual.sim.z)
      // The fold: each dot drifts to the centroid, thins and fades while the
      // hub grows over it; unfolding runs the same path backwards.
      if (hub && lod > 0) pos.lerp(hub.anchor.pos, lod)
      const open = 1 - lod
      const scale = Math.max(0.001, visual.r * visual.scale.current * (0.55 + 0.45 * open))
      visual.mesh.position.copy(pos)
      if (visual.lift.current > 0.001) {
        // The lift runs along the view axis, so the node comes towards the
        // reader without sliding off its own edges on screen.
        this.nodeLiftDir.copy(this.camera.position).sub(visual.mesh.position).normalize()
        visual.mesh.position.addScaledVector(
          this.nodeLiftDir,
          visual.lift.current * (visual.r * 0.6 + 10),
        )
      }
      visual.mesh.scale.setScalar(scale)
      const opacity = visual.opacity.current * open * open
      visual.mesh.visible = opacity > 0.005
      visual.material.opacity = opacity
      visual.material.depthWrite = opacity > 0.5
      visual.shellMaterial.opacity = visual.shellOpacity.current * open
      visual.shell.visible = visual.shellMaterial.opacity > 0.01
    }
  }

  private updateHubMeshes() {
    for (const territory of this.territories) {
      const hub = territory.hub
      if (!hub) continue
      const lod = hub.lod
      // The territory volume gives way to the hub as the cluster folds.
      territory.material.opacity = 0.055 * (1 - lod)
      territory.mesh.visible = lod < 0.98
      const grow = 0.55 + 0.45 * lod
      const scale = hub.scale.current * grow
      hub.anchor.scale.current = scale
      if (lod <= 0.001) {
        hub.mesh.visible = false
        hub.ring.visible = false
        continue
      }
      const r = Math.max(0.001, hub.anchor.r * scale)
      const opacity = hub.opacity.current * lod
      hub.mesh.visible = opacity > 0.005
      hub.mesh.position.copy(hub.anchor.pos)
      hub.mesh.scale.setScalar(r)
      hub.material.opacity = opacity
      hub.material.depthWrite = opacity > 0.5
      // The hairline sits just off the sphere, facing the camera, in the ink.
      const ringT = Math.max(0, (lod - 0.25) / 0.75)
      hub.ring.visible = ringT > 0.01
      hub.ring.position.copy(hub.anchor.pos)
      hub.ring.scale.setScalar(r * 1.24)
      hub.ring.quaternion.copy(this.camera.quaternion)
      hub.ringMaterial.opacity = 0.75 * hub.opacity.current * ringT
    }
  }

  private edgeUp = new THREE.Vector3(0, 1, 0)
  private edgeTmpDir = new THREE.Vector3()
  private edgeTmpSide = new THREE.Vector3()
  private edgeTmpMid = new THREE.Vector3()
  private edgeTmpView = new THREE.Vector3()
  private edgeTmpStart = new THREE.Vector3()
  private edgeTmpEnd = new THREE.Vector3()
  private edgeTmpTip = new THREE.Vector3()

  /** Allocate one dynamic indexed buffer for every individual and folded flow. */
  private rebuildEdgeBuffers() {
    const count = this.edgeVisuals.length + this.flowVisuals.length
    const vertices = count * 7
    this.edgePositions = new Float32Array(vertices * 3)
    this.edgeColours = new Float32Array(vertices * 4)
    this.edgeTimes = new Float32Array(vertices)
    this.edgeSeeds = new Float32Array(vertices)
    this.edgeKinds = new Float32Array(vertices)
    const IndexArray = vertices > 65_535 ? Uint32Array : Uint16Array
    const indices = new IndexArray(count * 9)
    for (let i = 0; i < count; i += 1) {
      const v = i * 7
      const j = i * 9
      indices.set([v, v + 1, v + 2, v + 2, v + 1, v + 3, v + 4, v + 5, v + 6], j)
      const seed = (i * 0.61803398875) % 1
      for (let k = 0; k < 7; k += 1) this.edgeSeeds[v + k] = seed
      this.edgeTimes.set([0, 0, 0.9, 0.9, 1, 0.88, 0.88], v)
      this.edgeKinds.set([0, 0, 0, 0, 1, 1, 1], v)
    }
    const dynamic = (array: Float32Array, itemSize: number) =>
      new THREE.BufferAttribute(array, itemSize).setUsage(THREE.DynamicDrawUsage)
    this.edgeGeometry.setAttribute('position', dynamic(this.edgePositions, 3))
    this.edgeGeometry.setAttribute('flowColor', dynamic(this.edgeColours, 4))
    this.edgeGeometry.setAttribute('flowT', new THREE.BufferAttribute(this.edgeTimes, 1))
    this.edgeGeometry.setAttribute('flowSeed', new THREE.BufferAttribute(this.edgeSeeds, 1))
    this.edgeGeometry.setAttribute('flowKind', new THREE.BufferAttribute(this.edgeKinds, 1))
    this.edgeGeometry.setIndex(new THREE.BufferAttribute(indices, 1))
    this.edgeGeometry.setDrawRange(0, indices.length)
  }

  private updateEdgeMeshes() {
    let index = 0
    for (const visual of this.edgeVisuals) this.layoutEdge(visual, index++)
    for (const visual of this.flowVisuals) this.layoutEdge(visual, index++)
    const position = this.edgeGeometry.getAttribute('position')
    const colour = this.edgeGeometry.getAttribute('flowColor')
    if (position) position.needsUpdate = true
    if (colour) colour.needsUpdate = true
  }

  private layoutEdge(visual: EdgeVisual, index: number) {
    const dir = this.edgeTmpDir
    const side = this.edgeTmpSide
    const mid = this.edgeTmpMid
    const view = this.edgeTmpView
    const start = this.edgeTmpStart
    const end = this.edgeTmpEnd
    const tip = this.edgeTmpTip
    const { from, to } = visual
    // Endpoints are the RENDERED positions, so a flow follows its donor into
    // the hub as the cluster folds instead of pointing at an empty spot.
    const fold = this.edgeFold(visual)
    const opacity = visual.opacity.current * fold
    dir.copy(to.pos).sub(from.pos)
    const len = dir.length()
    const vertex = index * 7
    const colourOffset = vertex * 4
    if (len < 1 || opacity <= 0.002) {
      for (let i = 0; i < 7; i += 1) this.edgeColours[colourOffset + i * 4 + 3] = 0
      return
    }
    dir.multiplyScalar(1 / len)
    const rFrom = from.r * from.scale.current
    const rTo = to.r * to.scale.current
    const width = visual.emphasised ? Math.max(visual.width, 0.72) : visual.width
    const arrowLength = Math.max(3.2, width * 3.4)
    const arrowWidth = Math.max(1.25, width * 1.8)

    // Face the ribbon to the camera so its amount-encoded width survives a
    // three-quarter orbit. A world-horizontal fallback handles a line that
    // happens to point straight at the camera.
    mid.copy(from.pos).add(to.pos).multiplyScalar(0.5)
    view.copy(this.camera.position).sub(mid)
    side.crossVectors(dir, view)
    if (side.lengthSq() < 0.01) side.set(1, 0, 0)
    side.normalize()
    const bow = visual.lateral * Math.min(12, len * 0.1)

    tip.copy(to.pos).addScaledVector(dir, -(rTo + 1)).addScaledVector(side, bow)
    end.copy(tip).addScaledVector(dir, -arrowLength)
    start.copy(from.pos).addScaledVector(dir, rFrom + 1).addScaledVector(side, bow)
    if (start.distanceToSquared(end) < 1) start.copy(end).addScaledVector(dir, -1)

    const p = this.edgePositions
    const write = (slot: number, point: THREE.Vector3, across: number) => {
      const offset = (vertex + slot) * 3
      p[offset] = point.x + side.x * across
      p[offset + 1] = point.y + side.y * across
      p[offset + 2] = point.z + side.z * across
    }
    write(0, start, width)
    write(1, start, -width)
    write(2, end, width)
    write(3, end, -width)
    write(4, tip, 0)
    write(5, end, arrowWidth)
    write(6, end, -arrowWidth)

    const c = this.edgeColours
    for (let i = 0; i < 7; i += 1) {
      const offset = colourOffset + i * 4
      c[offset] = visual.colour.r
      c[offset + 1] = visual.colour.g
      c[offset + 2] = visual.colour.b
      c[offset + 3] = opacity
    }
  }

  private updateTerritories() {
    for (const territory of this.territories) {
      let x = 0
      let y = 0
      let z = 0
      let n = 0
      for (const visual of this.nodeVisuals.values()) {
        if (visual.node.group !== territory.group) continue
        x += visual.sim.x
        y += visual.sim.y
        z += visual.sim.z
        n += 1
      }
      if (n === 0) {
        territory.mesh.visible = false
        territory.caption.style.display = 'none'
        continue
      }
      x /= n
      y /= n
      z /= n
      let spread = 0
      for (const visual of this.nodeVisuals.values()) {
        if (visual.node.group !== territory.group) continue
        const d = Math.hypot(visual.sim.x - x, visual.sim.y - y, visual.sim.z - z) + visual.r
        if (d > spread) spread = d
      }
      // The hub's anchor shares this vector, so the hub moves with the centroid.
      territory.centre.set(x, y, z)
      territory.spread = spread
      territory.r = spread + 22
      territory.mesh.visible = true
      territory.mesh.position.set(x, y, z)
      territory.mesh.scale.setScalar(territory.r)
    }
  }

  // -------------------------------------------------------------------
  // Semantic zoom - the fold state of each cluster.
  // -------------------------------------------------------------------

  /**
   * Retarget a hub's fold. The tween restarts from wherever the current
   * value is, so a reversal mid-flight turns back smoothly instead of
   * jumping to either end.
   */
  private setLod(hub: HubVisual, target: number, now: number) {
    if (hub.lodTarget === target && hub.lodStarted >= 0) return
    hub.lodTarget = target
    hub.lodFrom = hub.lod
    hub.lodStarted = now
    this.renderDirty = true
  }

  /** The distance the camera is heading for, so a fold decision anticipates a wheel or a flight. */
  private goalDist(): number {
    return this.tween ? this.tween.to.dist : this.distGoal
  }

  /**
   * Decide and advance every cluster's fold. A cluster folds once its spread
   * would draw narrower than COLLAPSE_PX on screen and unfolds past
   * EXPAND_PX; the gap is the hysteresis. Clusters holding the selection, a
   * selected flow's donor, or a just-opened hub never fold. Returns true
   * while any fold is mid-flight.
   */
  private updateLod(now: number): boolean {
    if (this.hubs.size === 0) return false
    // The camera may not have been placed since the last view change.
    this.updateCamera()
    const halfTan = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
    // Judged at the orbit distance the camera is heading for, not each
    // cluster's own depth: the smoothed dolly lags the wheel, so the fold
    // begins as the reader turns it, and clusters fold in size order rather
    // than the far side of the ring folding while the near side stays open.
    const dist = Math.max(1, this.goalDist())
    const pinnedGroups = this.pinnedGroups()
    let active = false
    for (const territory of this.territories) {
      const hub = territory.hub
      if (!hub) continue
      const pinned = pinnedGroups !== null && pinnedGroups.has(hub.group)
      const px = (territory.spread * (this.height / 2)) / (dist * halfTan)
      let want = hub.lodTarget
      if (pinned) want = 0
      else if (hub.lodTarget === 1 && px > EXPAND_PX) want = 0
      else if (hub.lodTarget === 0 && px < COLLAPSE_PX && !hub.dived) want = 1
      if (hub.lodStarted < 0) {
        // First evaluation: land in the resolved state without a show.
        hub.lodTarget = want
        hub.lod = want
        hub.lodFrom = want
        hub.lodStarted = now
        this.renderDirty = true
        continue
      }
      if (want !== hub.lodTarget) this.setLod(hub, want, now)
      if (hub.lod !== hub.lodTarget) {
        if (this.reduced) {
          hub.lod = hub.lodTarget
        } else {
          const t = Math.min(1, (now - hub.lodStarted) / LOD_MS)
          hub.lod = hub.lodFrom + (hub.lodTarget - hub.lodFrom) * easeInOut(t)
          if (t >= 1) hub.lod = hub.lodTarget
        }
        active = true
      }
    }
    return active
  }

  /** Groups that must stay unfolded: those holding the selection or a selected flow's ends. */
  private pinnedGroups(): Set<string> | null {
    const { selectedId, pathEdges, pathFrom } = this.emphasis
    if (selectedId === null && pathEdges === null && pathFrom === null) return null
    const groups = new Set<string>()
    const add = (id: string | null) => {
      if (id === null) return
      const visual = this.nodeVisuals.get(id)
      if (visual) groups.add(visual.node.group)
    }
    add(selectedId)
    add(pathFrom)
    if (pathEdges) {
      for (const edge of pathEdges) {
        add(edge.source)
        add(edge.target)
      }
    }
    return groups
  }

  /**
   * Open a folded cluster: fly the camera to frame it and unfold it on the
   * way. The dive flag keeps the automatic rule from refolding it while the
   * camera is still far out; the reader's next zoom or a fit releases it.
   */
  diveInto(group: string) {
    const territory = this.territories.find((t) => t.group === group)
    const hub = territory?.hub
    if (!territory || !hub) return
    this.updateCamera()
    // Frame the cluster with room around it: the parties it feeds and its
    // neighbours stay in view, so the reader keeps their bearings.
    const { dist: fits } = this.frameFor(territory.spread * 1.55 + 40)
    const dist = Math.max(this.minDist(), Math.min(this.maxDist(), fits))
    const target = this.offsetTarget(territory.centre, dist)
    this.moveView({ target, theta: this.view.theta, phi: this.view.phi, dist }, DIVE_MS)
    hub.dived = true
    this.setLod(hub, 0, performance.now())
    this.viewOwnedFlag = true
    this.focusOwnedFlag = true
    this.idleSpin = false
    this.setHoveredHub(null)
  }

  /** Every foldable cluster's fold state, by group - for the adapter's tests and chrome. */
  get folded(): ReadonlyMap<string, boolean> {
    const out = new Map<string, boolean>()
    for (const [group, hub] of this.hubs) out.set(group, hub.lodTarget === 1)
    return out
  }

  private updateRings() {
    const place = (ring: THREE.Mesh, material: THREE.MeshBasicMaterial, id: string | null) => {
      const visual = id ? this.nodeVisuals.get(id) : undefined
      if (!visual) {
        ring.visible = false
        return
      }
      ring.visible = true
      ring.position.copy(visual.pos)
      ring.scale.setScalar(visual.r * visual.scale.current)
      ring.quaternion.copy(this.camera.quaternion)
      material.opacity = 0.85
    }
    place(this.selectionRing, this.selectionRingMaterial, this.emphasis.selectedId)
    place(
      this.traceRing,
      this.traceRingMaterial,
      this.emphasis.pathFrom !== this.emphasis.selectedId ? this.emphasis.pathFrom : null,
    )
    // Halos sit outside the selection ring; reach grows a little with the
    // value, intensity carries it. A dimmed node's halo recedes with it.
    for (const [id, halo] of this.halos) {
      const visual = this.nodeVisuals.get(id)
      const presence = halo.presence.current
      if (!visual || presence < 0.01) {
        halo.mesh.visible = false
        continue
      }
      const value = Math.max(0, Math.min(1, halo.value.current))
      halo.mesh.visible = true
      halo.mesh.position.copy(visual.mesh.position)
      halo.mesh.scale.setScalar(visual.r * visual.scale.current * (1.42 + 0.5 * value))
      halo.mesh.quaternion.copy(this.camera.quaternion)
      halo.material.opacity = presence * (0.18 + 0.72 * value) * visual.opacity.current
    }
  }

  // -------------------------------------------------------------------
  // Labels - DOM, projected. Real type set in the tenant's own tokens, which
  // WebGL text never quite matches.
  // -------------------------------------------------------------------

  private labelVec = new THREE.Vector3()
  /** Scratch box for a placement test; a placement copies it into the pool. */
  private probeBox: LabelBox = { x1: 0, y1: 0, x2: 0, y2: 0 }

  /**
   * Claim a screen rectangle for a label if nothing placed this frame
   * overlaps it. Boxes come from a pool that persists across frames, so the
   * whole pass allocates nothing once warm.
   */
  private placeBox(x1: number, y1: number, x2: number, y2: number, force = false): boolean {
    const placed = this.placedLabelBoxes
    if (!force) {
      for (const p of placed) {
        if (x1 < p.x2 && x2 > p.x1 && y1 < p.y2 && y2 > p.y1) return false
      }
    }
    let box = this.boxPool[placed.length]
    if (!box) {
      box = { x1, y1, x2, y2 }
      this.boxPool.push(box)
    } else {
      box.x1 = x1
      box.y1 = y1
      box.x2 = x2
      box.y2 = y2
    }
    placed.push(box)
    return true
  }

  /** The last successful caption placement - fields, so the pass allocates nothing. */
  private capText = ''
  private capBaseline = 0
  private capX = 0

  /**
   * Find room for a cluster caption of width `w` around a mark at (sx, sy)
   * with screen radius `screenR`: above the mark, below it, then each again
   * shifted sideways just far enough to stay inside the plate. The plate is
   * the canvas less the panels' insets, and it is a hard edge - a caption is
   * never drawn cut off, nor under a panel. Sets capText, capX and
   * capBaseline on success.
   */
  private placeCaption(text: string, w: number, sx: number, sy: number, screenR: number): boolean {
    const half = w / 2 + 4
    const plateL = this.insets.left + PLATE_INSET
    const plateR = this.width - this.insets.right - PLATE_INSET
    const plateT = this.insets.top + PLATE_INSET
    const plateB = this.height - this.insets.bottom - PLATE_INSET
    if (half * 2 > plateR - plateL) return false
    for (let pass = 0; pass < 2; pass++) {
      for (let side = 0; side < 2; side++) {
        const y1 = side === 0 ? sy - screenR - 5 - CAPTION_H : sy + screenR + 5
        const y2 = y1 + CAPTION_H
        if (y1 < plateT || y2 > plateB) continue
        let x1 = sx - half
        let x2 = sx + half
        if (x1 < plateL || x2 > plateR) {
          if (pass === 0) continue
          const shift = x1 < plateL ? plateL - x1 : plateR - x2
          x1 += shift
          x2 += shift
        }
        if (!this.placeBox(x1, y1, x2, y2)) continue
        this.capText = text
        this.capBaseline = y2
        this.capX = (x1 + x2) / 2
        return true
      }
    }
    return false
  }

  private discCount = 0

  /** Record a mark's screen disc in the pooled list; returns its index. */
  private pushDisc(pos: THREE.Vector3, r: number, opacity: number, halfTan: number): ScreenDisc {
    let disc = this.discs[this.discCount]
    if (!disc) {
      disc = { ok: false, sx: 0, sy: 0, camDist: 0, screenR: 0, opacity: 0 }
      this.discs.push(disc)
    }
    this.discCount += 1
    this.labelVec.copy(pos).project(this.camera)
    disc.ok = this.labelVec.z <= 1 && this.labelVec.z >= -1
    disc.sx = (this.labelVec.x * 0.5 + 0.5) * this.width
    disc.sy = (-this.labelVec.y * 0.5 + 0.5) * this.height
    disc.camDist = pos.distanceTo(this.camera.position)
    disc.screenR = (r * (this.height / 2)) / (Math.max(1, disc.camDist) * halfTan)
    disc.opacity = opacity
    return disc
  }

  /**
   * Labels, in three tiers so no two ever sit on top of each other:
   *
   *   1. the emphasised few (selection, hover, a selected flow's ends) -
   *      always shown, and everything after them keeps clear of them;
   *   2. cluster captions, largest cluster first - above the mark, else
   *      below it, then each shifted to stay inside the plate, else the name
   *      without its count, else nothing;
   *   3. the rest by size - a focused view names only the neighbourhood, a
   *      free view names the biggest within a budget that grows as the
   *      camera comes closer, each new name fading in rather than popping.
   *
   * Every label is also kept off the face of a nearer readable sphere (node
   * or hub), so a name never reads as the caption of the wrong mark.
   */
  /**
   * Labels ease in and out rather than blinking. Each element carries an alpha
   * that chases 1 while a projection pass wants it and 0 once the pass stops
   * asking; the element is hidden only when the alpha has drained, and a name
   * on its way out keeps its last place. Every show path calls wantLabel and
   * every hide path is simply silence, so the pass reads as before.
   */
  private labelFades = new Map<HTMLElement, { alpha: number; opacity: number; wanted: boolean }>()
  private labelTick = 0

  private wantLabel(el: HTMLElement, transform: string, opacity: number) {
    let fade = this.labelFades.get(el)
    if (!fade) {
      fade = { alpha: 0, opacity, wanted: true }
      this.labelFades.set(el, fade)
    }
    fade.wanted = true
    fade.opacity = opacity
    el.style.transform = transform
  }

  /** After a projection pass: ease every label toward its wanted state. Returns true while any is mid-fade. */
  private settleLabels(now: number): boolean {
    const dt = this.labelTick ? Math.min(64, now - this.labelTick) : 16
    this.labelTick = now
    // In a touch faster than out, so a name arriving reads as decisive and one
    // leaving lingers only long enough not to blink.
    const rateIn = this.reduced ? 1 : 1 - Math.exp(-dt / 90)
    const rateOut = this.reduced ? 1 : 1 - Math.exp(-dt / 140)
    let moving = false
    for (const [el, fade] of this.labelFades) {
      const target = fade.wanted ? 1 : 0
      fade.wanted = false
      const prev = fade.alpha
      fade.alpha += (target - fade.alpha) * (target ? rateIn : rateOut)
      if (target === 1 && fade.alpha > 0.985) fade.alpha = 1
      if (target === 0 && fade.alpha < 0.02) fade.alpha = 0
      if (fade.alpha === 0) {
        el.style.display = 'none'
        this.labelFades.delete(el)
        continue
      }
      if (prev === 0 || el.style.display === 'none') el.style.display = 'block' // a rebuild may have hidden it directly
      el.style.opacity = (fade.alpha * fade.opacity).toFixed(2)
      if (fade.alpha !== target) moving = true
    }
    return moving
  }

  private projectLabels(now: number) {
    const cam = this.camera
    const halfTan = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
    const focus = this.focusKey()
    const { selectedId, pathFrom } = this.emphasis
    this.placedLabelBoxes.length = 0
    this.discCount = 0

    // Every node's screen disc first, so a label can be tested against ALL
    // nearer spheres - not just the ones that happen to have labels of their
    // own. In the dense party blob a label anchored above a low sphere
    // otherwise lands on the FACE of the taller sphere behind its anchor and
    // reads as that sphere's caption ("Labor" printed across Liberal).
    for (const visual of this.paintRank) {
      // A lifted (hovered) node is nearer the camera than its position says,
      // so its apparent radius grows a touch beyond this figure.
      this.pushDisc(
        visual.pos,
        visual.r * visual.scale.current * (1 + visual.lift.current * 0.15),
        visual.material.opacity,
        halfTan,
      )
    }
    const nodeDiscs = this.discCount
    for (const hub of this.hubs.values()) {
      if (hub.lod > 0.5) {
        this.pushDisc(hub.anchor.pos, hub.anchor.r * hub.anchor.scale.current, hub.material.opacity, halfTan)
      }
    }
    const discs = this.discs
    const discCount = this.discCount

    const isEmphasised = (id: string) =>
      id === focus || id === this.hoveredId || id === pathFrom || (this.pathNodeIds?.has(id) ?? false)
    const show = (visual: NodeVisual, sx: number, y: number, opacity: number) =>
      this.wantLabel(visual.label, `translate(-50%, -100%) translate(${sx.toFixed(1)}px, ${y.toFixed(1)}px)`, opacity)

    // 1. The emphasised few - the selection and its path are always named,
    // and everything after them, captions included, keeps clear of them.
    for (let rank = 0; rank < this.paintRank.length; rank++) {
      const visual = this.paintRank[rank]
      const disc = discs[rank]
      if (!visual || !disc) continue
      const id = visual.node.id
      if (!isEmphasised(id)) continue
      const label = visual.label
      if (!disc.ok) {
        continue
      }
      const { sx, sy, screenR } = disc
      const half = visual.labelW * (id === selectedId ? 1.2 : 1.1) / 2 + 4
      this.placeBox(sx - half, sy - screenR - 25, sx + half, sy - screenR - 3, true)
      show(visual, sx, sy - screenR - 4, 1)
      label.setAttribute('data-emphasised', '')
      if (id === selectedId) label.setAttribute('data-selected', '')
      else label.removeAttribute('data-selected')
    }

    // 2. Captions.
    for (const territory of this.captionRank) {
      const caption = territory.caption
      const hub = territory.hub
      const lod = hub ? hub.lod : 0
      this.labelVec.copy(territory.centre).project(cam)
      if (this.labelVec.z > 1 || this.labelVec.z < -1) {
        continue
      }
      const sx = (this.labelVec.x * 0.5 + 0.5) * this.width
      const sy = (-this.labelVec.y * 0.5 + 0.5) * this.height
      if (sx < -60 || sx > this.width + 60 || sy < -40 || sy > this.height + 40) {
        continue
      }
      const camDist = territory.centre.distanceTo(cam.position)
      // The caption rides the territory's rim, then the hub's as it folds.
      const worldR = hub
        ? territory.r + (hub.anchor.r * hub.anchor.scale.current * 1.3 - territory.r) * lod
        : territory.r
      const screenR = (worldR * (this.height / 2)) / (Math.max(1, camDist) * halfTan)
      const isHub = lod > 0.5
      if (
        !this.placeCaption(
          territory.captionFull, isHub ? territory.captionHubW : territory.captionW, sx, sy, screenR,
        ) &&
        !this.placeCaption(
          territory.captionShort, isHub ? territory.captionShortHubW : territory.captionShortW, sx, sy, screenR,
        )
      ) {
        continue
      }
      if (caption.textContent !== this.capText) caption.textContent = this.capText
      // A folded cluster's caption is its name: it dims with the hub, never
      // to the whisper an open territory's caption drops to under focus.
      const opacity = isHub
        ? 0.95 * (0.35 + 0.65 * (hub ? hub.opacity.current : 1))
        : focus ? 0.3 : 0.9
      this.wantLabel(
        caption,
        `translate(-50%, -100%) translate(${this.capX.toFixed(1)}px, ${this.capBaseline.toFixed(1)}px)`,
        opacity,
      )
      if (isHub) caption.setAttribute('data-hub', '')
      else caption.removeAttribute('data-hub')
    }

    // 3. The rest. The budget grows as the camera comes closer, like the 2D
    // zoom; it is continuous so the last name in fades rather than pops.
    const budget = Math.max(8, Math.min(48, 14 * (this.fitDist / Math.max(1, this.view.dist))))
    let kept = 0
    for (let rank = 0; rank < this.paintRank.length; rank++) {
      const visual = this.paintRank[rank]
      const disc = discs[rank]
      if (!visual || !disc) continue
      const id = visual.node.id
      if (isEmphasised(id)) continue
      const label = visual.label
      label.removeAttribute('data-emphasised')
      label.removeAttribute('data-selected')
      const hub = visual.territory?.hub
      const lod = hub ? hub.lod : 0
      const inNeighbourhood = this.neighbourIds?.has(id) ?? false
      if (
        lod > 0.35 || !disc.ok || disc.opacity < 0.2 ||
        (focus !== null && !inNeighbourhood) ||
        (!inNeighbourhood && kept >= budget)
      ) {
        continue
      }
      const { sx, sy, camDist, screenR } = disc
      // A name that would be cut by the plate edge, or sit under a panel, is
      // not drawn at all.
      const half = visual.labelW / 2 + 4
      if (
        sx - half < this.insets.left + PLATE_INSET ||
        sx + half > this.width - this.insets.right - PLATE_INSET ||
        sy - screenR - 23 < this.insets.top + PLATE_INSET ||
        sy - screenR - 3 > this.height - this.insets.bottom - PLATE_INSET
      ) {
        continue
      }
      // The label's anchor must not sit on the face of a nearer, clearly
      // visible sphere of readable size - see the discs note.
      const ax = sx
      const ay = sy - screenR - 13
      let covered = false
      for (let j = 0; j < discCount; j++) {
        if (j === rank) continue
        const p = discs[j]
        if (!p || !p.ok || p.opacity <= 0.2 || p.screenR <= 13 || p.camDist >= camDist - 1) continue
        // A hub disc covers generously: a name over a hub reads as the hub's.
        const reach = j >= nodeDiscs ? 1.15 : 0.92
        if (Math.hypot(ax - p.sx, ay - p.sy) < p.screenR * reach) {
          covered = true
          break
        }
      }
      if (covered) {
        continue
      }
      if (!this.placeBox(sx - half, sy - screenR - 23, sx + half, sy - screenR - 3)) {
        continue
      }
      let fadeIn = 1
      if (!inNeighbourhood) {
        fadeIn = Math.max(0, Math.min(1, budget - kept))
        kept += 1
      }
      // Distance fade matches the scene fog, so a label never floats at full
      // strength over a mark that has already melted into the paper.
      const fogT = Math.max(
        0,
        Math.min(1, (camDist - this.fog.near) / Math.max(1, this.fog.far - this.fog.near)),
      )
      const opacity = Math.max(0.35, (1 - fogT * 0.5) * Math.min(1, visual.opacity.current + 0.1)) *
        fadeIn * (1 - lod / 0.35)
      show(visual, sx, sy - screenR - 4, opacity)
    }
    this.positionPopup()
    this.projectEdgeLabels()
    if (this.settleLabels(now)) this.renderDirty = true
  }

  /** Relation labels ride emphasised edges only, like the 2D map's textPath. */
  private projectEdgeLabels() {
    for (const visual of this.edgeVisuals) this.projectEdgeLabel(visual)
    for (const visual of this.flowVisuals) this.projectEdgeLabel(visual)
  }

  private projectEdgeLabel(visual: EdgeVisual) {
    const show = visual.emphasised && Boolean(visual.edge.label) &&
      this.view.dist < this.fitDist * 1.15 && this.edgeFold(visual) > 0.5
    if (!show) return
    if (!visual.label) {
      const el = document.createElement('div')
      el.className = 'rp-map3d-edge-label'
      el.textContent = visual.edge.label
      this.labelLayer.appendChild(el)
      visual.label = el
      const cs = getComputedStyle(el)
      const ctx = this.measureCtx
      if (ctx) {
        ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
        visual.labelW = ctx.measureText(visual.edge.label).width + 10
      } else {
        visual.labelW = visual.edge.label.length * 5.4 + 10
      }
    }
    this.labelVec.copy(visual.from.pos).add(visual.to.pos).multiplyScalar(0.5).project(this.camera)
    if (this.labelVec.z > 1 || this.labelVec.z < -1) return
    const sx = (this.labelVec.x * 0.5 + 0.5) * this.width
    const sy = (-this.labelVec.y * 0.5 + 0.5) * this.height
    // Relation labels give way to node labels: an amount riding an edge
    // that mushes into a donor's name reads as neither.
    const half = visual.labelW / 2 + 3
    if (!this.placeBox(sx - half, sy - 25, sx + half, sy - 3)) return
    this.wantLabel(visual.label, `translate(-50%, -140%) translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`, 1)
  }

  // -------------------------------------------------------------------
  // Pause / teardown.
  // -------------------------------------------------------------------

  /**
   * Stop the frame loop while nobody can see the canvas (scrolled away, or a
   * display:none ancestor) - an idle spin off screen is wasted work. Resuming
   * restarts the clock so the first frame back carries no jump.
   */
  setPaused(paused: boolean) {
    if (this.disposed || this.paused === paused) return
    this.paused = paused
    if (paused) {
      if (this.frameHandle !== null) cancelAnimationFrame(this.frameHandle)
      this.frameHandle = null
    } else {
      this.lastFrame = performance.now()
      this.renderDirty = true
      this.frameHandle = requestAnimationFrame(this.frame)
    }
  }

  dispose() {
    this.disposed = true
    if (this.frameHandle !== null) cancelAnimationFrame(this.frameHandle)
    this.unbindPointerHandlers()
    if (this.onContextLost) this.canvas.removeEventListener('webglcontextlost', this.onContextLost)
    this.reducedQuery?.removeEventListener('change', this.onReducedChange)
    this.resizeObserver.disconnect()
    this.clearScene()
    this.popup.remove()
    this.sphereGeo.dispose()
    this.shellGeo.dispose()
    this.edgeGeometry.dispose()
    this.edgeMaterial.dispose()
    this.ringGeo.dispose()
    this.haloGeo.dispose()
    this.territoryGeo.dispose()
    this.selectionRingMaterial.dispose()
    this.traceRingMaterial.dispose()
    this.renderer.dispose()
  }
}
